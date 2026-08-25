import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  abandonAutomationReplyGeneration,
  AUTOMATION_REPLY_ABANDONED_ROLE,
  AUTOMATION_REPLY_GENERATING_ROLE,
  claimAutomationReplyGeneration,
  getAutomationReplyGenerationStaleMs,
} from "@/server/agents/reply-generation";
import { claimAutomationReplyDelivery } from "@/server/agents/reply-delivery";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("automation reply generation lease", () => {
  const runId = suffix();
  const workspaceId = `ws_llm_lease_${runId}`;
  const instanceId = `inst_llm_lease_${runId}`;
  const agentId = `agent_llm_lease_${runId}`;
  let conversationSequence = 0;

  beforeAll(async () => {
    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `LLM lease ${runId}`,
        slug: `llm-lease-${runId}`,
        timezone: "America/Lima",
      },
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `LLM lease instance ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId: `evo_llm_lease_${runId}`,
        status: "ACTIVE",
      },
    });

    await db.agent.create({
      data: {
        id: agentId,
        workspaceId,
        name: `LLM lease agent ${runId}`,
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

  async function createConversation(label: string) {
    conversationSequence += 1;
    return db.conversation.create({
      data: {
        workspaceId,
        instanceId,
        agentId,
        contactPhone: `+5197${String(conversationSequence).padStart(7, "0")}`,
        contactDisplayName: label,
        status: "OPEN",
      },
    });
  }

  function claimGeneration(
    conversationId: string,
    now: Date,
    overrides?: {
      llmLimit?: string;
      staleSeconds?: string;
    },
  ) {
    return claimAutomationReplyGeneration({
      workspaceId,
      conversationId,
      agentId,
      provider: "mock",
      model: "mock-model",
      rateLimitSeconds: 60,
      now,
      budgetEnv: {
        AGENT_DAILY_LLM_LIMIT: overrides?.llmLimit ?? "50",
        AGENT_DAILY_PROVIDER_CALL_LIMIT: "50",
      },
      leaseEnv: {
        AGENT_LLM_GENERATION_STALE_SECONDS: overrides?.staleSeconds ?? "60",
      },
    });
  }

  it("allows only one concurrent generation claim for the same conversation", async () => {
    const conversation = await createConversation("Concurrent generation");
    const now = new Date("2026-08-24T18:00:00.000Z");

    const results = await Promise.all([
      claimGeneration(conversation.id, now),
      claimGeneration(conversation.id, now),
    ]);

    expect(results.filter((result) => result.claimed)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.claimed && result.reason === "GENERATION_IN_FLIGHT",
      ),
    ).toHaveLength(1);

    expect(
      await db.conversationMessage.count({
        where: {
          workspaceId,
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_GENERATING_ROLE,
        },
      }),
    ).toBe(1);

    const usage = await db.agentDailyUsage.findUniqueOrThrow({
      where: {
        workspaceId_usageDate: {
          workspaceId,
          usageDate: "2026-08-24",
        },
      },
    });
    expect(usage.llmAttempts).toBe(1);
  });

  it("expires a stale generation lease and prevents the old process from starting the provider", async () => {
    const conversation = await createConversation("Stale generation");
    const firstNow = new Date("2026-08-25T17:00:00.000Z");
    const first = await claimGeneration(conversation.id, firstNow, {
      staleSeconds: "45",
    });

    expect(first.claimed).toBe(true);
    if (!first.claimed) {
      throw new Error("Expected first generation lease.");
    }

    // ConversationMessage.createdAt comes from PostgreSQL now(), while this test
    // deliberately injects a logical clock. Pin the fixture to that clock so
    // reclaim semantics never depend on the wall-clock hour when CI happens to run.
    await db.conversationMessage.update({
      where: { id: first.leaseId },
      data: { createdAt: firstNow },
    });

    const second = await claimGeneration(
      conversation.id,
      new Date(firstNow.getTime() + 90_000),
      { staleSeconds: "45" },
    );
    expect(second.claimed).toBe(true);
    if (!second.claimed) {
      throw new Error("Expected replacement generation lease.");
    }
    expect(second.leaseId).not.toBe(first.leaseId);

    const oldLease = await db.conversationMessage.findUniqueOrThrow({
      where: { id: first.leaseId },
    });
    expect(oldLease.role).toBe(AUTOMATION_REPLY_ABANDONED_ROLE);

    const lateOldProcess = await claimAutomationReplyDelivery({
      workspaceId,
      conversationId: conversation.id,
      generationLeaseId: first.leaseId,
      agentId,
      content: "Respuesta vieja que no debe salir",
      provider: "mock",
      model: "mock-model",
      rateLimitSeconds: 60,
      now: new Date(firstNow.getTime() + 91_000),
      budgetEnv: {
        AGENT_DAILY_LLM_LIMIT: "50",
        AGENT_DAILY_PROVIDER_CALL_LIMIT: "50",
      },
    });

    expect(lateOldProcess).toEqual({
      claimed: false,
      reason: "GENERATION_LEASE_LOST",
    });

    const usage = await db.agentDailyUsage.findUniqueOrThrow({
      where: {
        workspaceId_usageDate: {
          workspaceId,
          usageDate: "2026-08-25",
        },
      },
    });
    expect(usage.providerStarts).toBe(0);
  });

  it("releases a failed LLM lease immediately so a later inbound can try again", async () => {
    const conversation = await createConversation("LLM failure release");
    const now = new Date("2026-08-26T17:00:00.000Z");
    const first = await claimGeneration(conversation.id, now);

    expect(first.claimed).toBe(true);
    if (!first.claimed) {
      throw new Error("Expected generation lease.");
    }

    const released = await abandonAutomationReplyGeneration({
      workspaceId,
      conversationId: conversation.id,
      leaseId: first.leaseId,
      agentId,
      reason: "LLM_PROVIDER_TIMEOUT",
    });
    expect(released).toBe(true);

    const second = await claimGeneration(
      conversation.id,
      new Date(now.getTime() + 1_000),
    );
    expect(second.claimed).toBe(true);
  });

  it("promotes the same generation row into the provider marker", async () => {
    const conversation = await createConversation("Promote lease");
    const now = new Date("2026-08-27T17:00:00.000Z");
    const generation = await claimGeneration(conversation.id, now);

    expect(generation.claimed).toBe(true);
    if (!generation.claimed) {
      throw new Error("Expected generation lease.");
    }

    const delivery = await claimAutomationReplyDelivery({
      workspaceId,
      conversationId: conversation.id,
      generationLeaseId: generation.leaseId,
      agentId,
      content: "Respuesta generada",
      provider: "mock",
      model: "mock-model",
      rateLimitSeconds: 60,
      now: new Date(now.getTime() + 1_000),
      budgetEnv: {
        AGENT_DAILY_LLM_LIMIT: "50",
        AGENT_DAILY_PROVIDER_CALL_LIMIT: "50",
      },
    });

    expect(delivery.claimed).toBe(true);
    if (!delivery.claimed) {
      throw new Error("Expected provider claim.");
    }
    expect(delivery.markerId).toBe(generation.leaseId);

    const row = await db.conversationMessage.findUniqueOrThrow({
      where: { id: generation.leaseId },
    });
    expect(row.role).toBe("assistant_pending");
    expect(row.content).toBe("Respuesta generada");
  });

  it("uses zero LLM budget as a pre-generation kill switch without creating a lease", async () => {
    const conversation = await createConversation("LLM zero budget");
    const result = await claimGeneration(
      conversation.id,
      new Date("2026-08-28T17:00:00.000Z"),
      { llmLimit: "0" },
    );

    expect(result).toMatchObject({
      claimed: false,
      reason: "DAILY_LLM_LIMIT_REACHED",
      budget: {
        usageDate: "2026-08-28",
        limit: 0,
        usedBefore: 0,
      },
    });
    expect(
      await db.conversationMessage.count({
        where: {
          workspaceId,
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_GENERATING_ROLE,
        },
      }),
    ).toBe(0);
  });

  it("clamps the stale threshold above the LLM HTTP timeout margin", () => {
    expect(
      getAutomationReplyGenerationStaleMs({
        AGENT_LLM_GENERATION_STALE_SECONDS: "5",
      }),
    ).toBe(45_000);
    expect(
      getAutomationReplyGenerationStaleMs({
        AGENT_LLM_GENERATION_STALE_SECONDS: "900",
      }),
    ).toBe(10 * 60_000);
  });
});
