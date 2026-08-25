import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { handleEvolutionWebhook } from "@/server/agents/whatsapp-webhook-service";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("pre-LLM lease through concurrent webhooks", () => {
  const runId = suffix();
  const workspaceId = `ws_llm_webhook_${runId}`;
  const instanceId = `inst_llm_webhook_${runId}`;
  const providerInstanceId = `evo_llm_webhook_${runId}`;
  const agentId = `agent_llm_webhook_${runId}`;
  const phone = `5194${runId.replace(/\D/g, "").padEnd(7, "4").slice(0, 7)}`;
  const originalEnv = {
    AGENT_AUTOREPLY_ENABLED: process.env.AGENT_AUTOREPLY_ENABLED,
    AGENT_DAILY_LLM_LIMIT: process.env.AGENT_DAILY_LLM_LIMIT,
    AGENT_DAILY_PROVIDER_CALL_LIMIT: process.env.AGENT_DAILY_PROVIDER_CALL_LIMIT,
    AGENT_LLM_GENERATION_STALE_SECONDS:
      process.env.AGENT_LLM_GENERATION_STALE_SECONDS,
    AGENT_REAL_REPLY_ENABLED: process.env.AGENT_REAL_REPLY_ENABLED,
    EVOLUTION_MOCK: process.env.EVOLUTION_MOCK,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    MOCK_WHATSAPP_ENABLED: process.env.MOCK_WHATSAPP_ENABLED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    REAL_SENDING_ENABLED: process.env.REAL_SENDING_ENABLED,
  };

  beforeAll(async () => {
    process.env.AGENT_AUTOREPLY_ENABLED = "true";
    process.env.AGENT_REAL_REPLY_ENABLED = "false";
    process.env.REAL_SENDING_ENABLED = "false";
    process.env.MOCK_WHATSAPP_ENABLED = "true";
    process.env.EVOLUTION_MOCK = "true";
    process.env.AGENT_DAILY_LLM_LIMIT = "50";
    process.env.AGENT_DAILY_PROVIDER_CALL_LIMIT = "50";
    process.env.AGENT_LLM_GENERATION_STALE_SECONDS = "60";
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "prebeta-test-key";

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `LLM webhook ${runId}`,
        slug: `llm-webhook-${runId}`,
        timezone: "America/Lima",
      },
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `LLM webhook instance ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId,
        status: "ACTIVE",
      },
    });

    await db.agent.create({
      data: {
        id: agentId,
        workspaceId,
        name: `LLM webhook agent ${runId}`,
        source: "MANUAL",
        status: "ACTIVE",
        llmProvider: "OPENAI",
      },
    });

    const version = await db.agentVersion.create({
      data: {
        workspaceId,
        agentId,
        versionNumber: 1,
        source: "MANUAL",
        generatedPrompt: "Responde de forma breve y controlada.",
        systemPrompt: "Responde de forma breve y controlada.",
      },
    });

    await db.agent.update({
      where: { id: agentId },
      data: { activeAgentVersionId: version.id },
    });

    await db.agentSetting.create({
      data: {
        workspaceId,
        agentId,
        autoReplyEnabled: true,
      },
    });

    await db.agentInstanceAssignment.create({
      data: {
        workspaceId,
        instanceId,
        agentId,
        active: true,
      },
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.$disconnect();

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function payload(id: string, text: string) {
    return {
      instance: providerInstanceId,
      data: {
        key: {
          id,
          remoteJid: `${phone}@s.whatsapp.net`,
          fromMe: false,
        },
        pushName: "Concurrent QA",
        message: {
          conversation: text,
        },
      },
    };
  }

  it("executes exactly one LLM request when a second inbound arrives during generation", async () => {
    let signalLlmStarted: (() => void) | undefined;
    let releaseLlm: (() => void) | undefined;
    const llmStarted = new Promise<void>((resolve) => {
      signalLlmStarted = resolve;
    });
    const llmRelease = new Promise<void>((resolve) => {
      releaseLlm = resolve;
    });

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      if (!url.startsWith("https://api.openai.com/")) {
        throw new Error(`Unexpected fetch in LLM lease test: ${url}`);
      }

      signalLlmStarted?.();
      await llmRelease;

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Respuesta LLM controlada" } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstPromise = handleEvolutionWebhook(
      payload(`llm-first-${runId}`, "Primera consulta concurrente"),
    );

    await Promise.race([
      llmStarted,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("First webhook did not reach the LLM.")), 2_000),
      ),
    ]);

    const second = await handleEvolutionWebhook(
      payload(`llm-second-${runId}`, "Segunda consulta mientras el LLM sigue ocupado"),
    );

    expect(second.action).toBe("ignored_llm_generation_in_flight");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    releaseLlm?.();
    const first = await firstPromise;
    expect(first.action).toBe("agent_reply_sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const conversation = await db.conversation.findUniqueOrThrow({
      where: {
        workspaceId_instanceId_contactPhone: {
          workspaceId,
          instanceId,
          contactPhone: `+${phone}`,
        },
      },
    });

    expect(
      await db.conversationMessage.count({
        where: {
          conversationId: conversation.id,
          role: "assistant",
          direction: "outbound",
        },
      }),
    ).toBe(1);
    expect(
      await db.conversationMessage.count({
        where: {
          conversationId: conversation.id,
          role: "assistant_generating",
        },
      }),
    ).toBe(0);

    const usage = await db.agentDailyUsage.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(usage.llmAttempts).toBe(1);
    expect(usage.providerStarts).toBe(1);
  });
});
