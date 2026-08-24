import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reserveAgentLlmAttempt } from "@/server/agents/daily-budget";
import { claimAutomationReplyDelivery } from "@/server/agents/reply-delivery";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("agent daily budget", () => {
  const runId = suffix();
  const workspaceId = `ws_agent_budget_${runId}`;
  const instanceId = `inst_agent_budget_${runId}`;
  const agentId = `agent_budget_${runId}`;
  let conversationSequence = 0;

  beforeAll(async () => {
    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `Agent budget ${runId}`,
        slug: `agent-budget-${runId}`,
        timezone: "America/Lima",
      },
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `Budget instance ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId: `evo_budget_${runId}`,
        status: "ACTIVE",
      },
    });

    await db.agent.create({
      data: {
        id: agentId,
        workspaceId,
        name: `Budget agent ${runId}`,
        source: "MANUAL",
        status: "ACTIVE",
        llmProvider: "MOCK",
      },
    });

    await db.agentSetting.create({
      data: {
        workspaceId,
        agentId,
        autoReplyEnabled: true,
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  async function createConversation() {
    conversationSequence += 1;
    return db.conversation.create({
      data: {
        workspaceId,
        instanceId,
        agentId,
        contactPhone: `+5196${String(conversationSequence).padStart(7, "0")}`,
        status: "OPEN",
      },
    });
  }

  it("allows exactly one concurrent LLM reservation for the last daily slot", async () => {
    const now = new Date("2026-08-20T18:00:00.000Z");
    const env = {
      AGENT_DAILY_LLM_LIMIT: "1",
      AGENT_DAILY_PROVIDER_CALL_LIMIT: "50",
    };

    const results = await Promise.all([
      reserveAgentLlmAttempt({ workspaceId, now, env }),
      reserveAgentLlmAttempt({ workspaceId, now, env }),
    ]);

    expect(results.filter((result) => result.reserved)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.reserved && result.reason === "DAILY_LIMIT_REACHED",
      ),
    ).toHaveLength(1);

    const usage = await db.agentDailyUsage.findUniqueOrThrow({
      where: {
        workspaceId_usageDate: {
          workspaceId,
          usageDate: "2026-08-20",
        },
      },
    });
    expect(usage.llmAttempts).toBe(1);
    expect(usage.llmDenied).toBe(1);
  });

  it("accepts zero as a database-backed LLM kill switch", async () => {
    const result = await reserveAgentLlmAttempt({
      workspaceId,
      now: new Date("2026-08-21T18:00:00.000Z"),
      env: {
        AGENT_DAILY_LLM_LIMIT: "0",
        AGENT_DAILY_PROVIDER_CALL_LIMIT: "50",
      },
    });

    expect(result).toMatchObject({
      reserved: false,
      reason: "DAILY_LIMIT_REACHED",
      usageDate: "2026-08-21",
      limit: 0,
      usedBefore: 0,
    });

    const usage = await db.agentDailyUsage.findUniqueOrThrow({
      where: {
        workspaceId_usageDate: {
          workspaceId,
          usageDate: "2026-08-21",
        },
      },
    });
    expect(usage.llmAttempts).toBe(0);
    expect(usage.llmDenied).toBe(1);
  });

  it("serializes provider starts across different conversations", async () => {
    const [firstConversation, secondConversation] = await Promise.all([
      createConversation(),
      createConversation(),
    ]);
    const now = new Date("2026-08-22T18:00:00.000Z");
    const budgetEnv = {
      AGENT_DAILY_LLM_LIMIT: "50",
      AGENT_DAILY_PROVIDER_CALL_LIMIT: "1",
    };

    const results = await Promise.all([
      claimAutomationReplyDelivery({
        workspaceId,
        conversationId: firstConversation.id,
        agentId,
        content: "Respuesta uno",
        provider: "mock",
        model: "mock-model",
        rateLimitSeconds: 60,
        now,
        budgetEnv,
      }),
      claimAutomationReplyDelivery({
        workspaceId,
        conversationId: secondConversation.id,
        agentId,
        content: "Respuesta dos",
        provider: "mock",
        model: "mock-model",
        rateLimitSeconds: 60,
        now,
        budgetEnv,
      }),
    ]);

    expect(results.filter((result) => result.claimed)).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          !result.claimed && result.reason === "DAILY_PROVIDER_LIMIT_REACHED",
      ),
    ).toHaveLength(1);

    const usage = await db.agentDailyUsage.findUniqueOrThrow({
      where: {
        workspaceId_usageDate: {
          workspaceId,
          usageDate: "2026-08-22",
        },
      },
    });
    expect(usage.providerStarts).toBe(1);
    expect(usage.providerDenied).toBe(1);

    expect(
      await db.conversationMessage.count({
        where: {
          workspaceId,
          conversationId: {
            in: [firstConversation.id, secondConversation.id],
          },
          role: "assistant_pending",
        },
      }),
    ).toBe(1);
  });

  it("rolls to a new budget row at workspace-local midnight", async () => {
    const env = {
      AGENT_DAILY_LLM_LIMIT: "1",
      AGENT_DAILY_PROVIDER_CALL_LIMIT: "50",
    };

    const beforeMidnight = await reserveAgentLlmAttempt({
      workspaceId,
      now: new Date("2026-08-24T04:59:59.000Z"),
      env,
    });
    const afterMidnight = await reserveAgentLlmAttempt({
      workspaceId,
      now: new Date("2026-08-24T05:00:01.000Z"),
      env,
    });

    expect(beforeMidnight).toMatchObject({ reserved: true, usageDate: "2026-08-23" });
    expect(afterMidnight).toMatchObject({ reserved: true, usageDate: "2026-08-24" });
  });
});
