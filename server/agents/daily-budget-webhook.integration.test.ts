import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleEvolutionWebhook } from "@/server/agents/whatsapp-webhook-service";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("agent daily budget webhook gate", () => {
  const runId = suffix();
  const workspaceId = `ws_budget_webhook_${runId}`;
  const instanceId = `inst_budget_webhook_${runId}`;
  const providerInstanceId = `evo_budget_webhook_${runId}`;
  const agentId = `agent_budget_webhook_${runId}`;
  const phone = `5195${runId.replace(/\D/g, "").padEnd(7, "5").slice(0, 7)}`;
  const originalEnv = {
    AGENT_AUTOREPLY_ENABLED: process.env.AGENT_AUTOREPLY_ENABLED,
    AGENT_DAILY_LLM_LIMIT: process.env.AGENT_DAILY_LLM_LIMIT,
    AGENT_DAILY_PROVIDER_CALL_LIMIT: process.env.AGENT_DAILY_PROVIDER_CALL_LIMIT,
    AGENT_REAL_REPLY_ENABLED: process.env.AGENT_REAL_REPLY_ENABLED,
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
    process.env.AGENT_DAILY_LLM_LIMIT = "0";
    process.env.AGENT_DAILY_PROVIDER_CALL_LIMIT = "50";
    process.env.LLM_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `Budget webhook ${runId}`,
        slug: `budget-webhook-${runId}`,
        timezone: "America/Lima",
      },
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `Budget webhook instance ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId,
        status: "ACTIVE",
      },
    });

    await db.agent.create({
      data: {
        id: agentId,
        workspaceId,
        name: `Budget webhook agent ${runId}`,
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
        generatedPrompt: "Responde de forma breve.",
        systemPrompt: "Responde de forma breve.",
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

  it("stops before OpenAI generation when the workspace LLM budget is zero", async () => {
    const result = await handleEvolutionWebhook({
      instance: providerInstanceId,
      data: {
        key: {
          id: `budget-zero-${runId}`,
          remoteJid: `${phone}@s.whatsapp.net`,
          fromMe: false,
        },
        pushName: "Budget QA",
        message: {
          conversation: "Hola, necesito informacion",
        },
      },
    });

    expect(result.action).toBe("ignored_agent_daily_llm_limit");

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
          direction: "outbound",
        },
      }),
    ).toBe(0);

    const usage = await db.agentDailyUsage.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(usage.llmAttempts).toBe(0);
    expect(usage.llmDenied).toBe(1);
    expect(usage.providerStarts).toBe(0);
  });
});
