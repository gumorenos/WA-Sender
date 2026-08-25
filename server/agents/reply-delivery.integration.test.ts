import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CONVERSATION_HUMAN_HANDOFF_STATUS } from "@/lib/agents/handoff";
import { setConversationHandoff } from "@/server/agents/handoff-service";
import {
  AUTOMATION_REPLY_PENDING_ROLE,
  AUTOMATION_REPLY_UNKNOWN_ROLE,
  claimAutomationReplyDelivery,
  completeAutomationReplyDelivery,
  getAutomationReplyPendingStaleMs,
  quarantineAutomationReplyDelivery,
} from "@/server/agents/reply-delivery";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("linearized automation reply delivery", () => {
  const runId = suffix();
  const workspaceId = `ws_reply_${runId}`;
  const userId = `user_reply_${runId}`;
  const instanceId = `inst_reply_${runId}`;
  const agentId = `agent_reply_${runId}`;
  let conversationSequence = 0;

  beforeAll(async () => {
    process.env.AGENT_REPLY_PENDING_STALE_SECONDS = "30";
    process.env.EVOLUTION_TIMEOUT_MS = "8000";

    await db.user.create({
      data: {
        id: userId,
        email: `reply-${runId}@example.test`,
        status: "ACTIVE",
      },
    });

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `Reply delivery ${runId}`,
        slug: `reply-delivery-${runId}`,
      },
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `Reply instance ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId: `evo_reply_${runId}`,
        status: "ACTIVE",
      },
    });

    await db.agent.create({
      data: {
        id: agentId,
        workspaceId,
        name: `Reply agent ${runId}`,
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
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  async function createConversation(label: string) {
    conversationSequence += 1;
    const phone = `+5198${String(conversationSequence).padStart(7, "0")}`;

    const conversation = await db.conversation.create({
      data: {
        workspaceId,
        instanceId,
        agentId,
        contactPhone: phone,
        contactDisplayName: label,
        status: "OPEN",
      },
    });

    return { conversation, phone };
  }

  async function createGenerationLease(conversationId: string) {
    return db.conversationMessage.create({
      data: {
        workspaceId,
        conversationId,
        role: "assistant_generating",
        direction: "outbound",
        content: "",
        metadata: {
          automationReply: true,
          deliveryState: "LLM_CALL_STARTED",
          agentId,
        },
      },
      select: { id: true },
    });
  }

  async function claim(
    conversationId: string,
    content = "Respuesta automatica de prueba",
  ) {
    const lease = await createGenerationLease(conversationId);

    return claimAutomationReplyDelivery({
      workspaceId,
      conversationId,
      generationLeaseId: lease.id,
      agentId,
      content,
      provider: "mock",
      model: "mock-model",
      rateLimitSeconds: 60,
    });
  }

  it("serializes concurrent reply claims so only one provider marker wins", async () => {
    const { conversation } = await createConversation("Concurrent claims");

    const results = await Promise.all([
      claim(conversation.id, "Respuesta A"),
      claim(conversation.id, "Respuesta B"),
    ]);

    const claimed = results.filter((result) => result.claimed);
    const rejected = results.filter((result) => !result.claimed);

    expect(claimed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      claimed: false,
      reason: "REPLY_IN_FLIGHT",
    });
    expect(
      await db.conversationMessage.count({
        where: {
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_PENDING_ROLE,
        },
      }),
    ).toBe(1);
    expect(
      await db.conversationMessage.count({
        where: {
          conversationId: conversation.id,
          role: "assistant_not_sent",
        },
      }),
    ).toBe(1);
  });

  it("blocks a post-LLM claim when operator handoff won before provider start", async () => {
    const { conversation } = await createConversation("Handoff wins");

    const handoff = await setConversationHandoff(
      conversation.id,
      {
        active: true,
        confirmed: true,
        reason: "Operador toma control antes de iniciar el envio automatico.",
      },
      { userId, workspaceId },
    );

    expect(handoff.changed).toBe(true);
    expect(handoff.conversation.status).toBe(CONVERSATION_HUMAN_HANDOFF_STATUS);

    const result = await claim(conversation.id);
    expect(result).toEqual({ claimed: false, reason: "HUMAN_HANDOFF" });
    expect(
      await db.conversationMessage.count({
        where: {
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_PENDING_ROLE,
        },
      }),
    ).toBe(0);
    expect(
      await db.conversationMessage.count({
        where: {
          conversationId: conversation.id,
          role: "assistant_not_sent",
        },
      }),
    ).toBe(1);
  });

  it("blocks a post-LLM claim when opt-out was persisted first", async () => {
    const { conversation, phone } = await createConversation("Opt out wins");

    await db.optOut.create({
      data: {
        workspaceId,
        instanceId,
        phone,
        source: "reply_delivery_test",
        reason: "STOP",
      },
    });

    const result = await claim(conversation.id);
    expect(result).toEqual({ claimed: false, reason: "CONTACT_BLOCKED" });
  });

  it("quarantines a stale provider marker and keeps later replies blocked", async () => {
    const { conversation } = await createConversation("Stale marker");
    const staleCreatedAt = new Date(Date.now() - 120_000);

    const stale = await db.conversationMessage.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        role: AUTOMATION_REPLY_PENDING_ROLE,
        direction: "outbound",
        content: "Respuesta cuyo resultado del proveedor se desconoce",
        createdAt: staleCreatedAt,
        metadata: {
          automationReply: true,
          deliveryState: "PROVIDER_CALL_STARTED",
        },
      },
    });

    const first = await claim(conversation.id);
    expect(first).toEqual({
      claimed: false,
      reason: "STALE_REPLY_REQUIRES_REVIEW",
    });

    const quarantined = await db.conversationMessage.findUniqueOrThrow({
      where: { id: stale.id },
    });
    expect(quarantined.role).toBe(AUTOMATION_REPLY_UNKNOWN_ROLE);

    const second = await claim(conversation.id);
    expect(second).toEqual({
      claimed: false,
      reason: "STALE_REPLY_REQUIRES_REVIEW",
    });
    expect(
      await db.conversationMessage.count({
        where: {
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_PENDING_ROLE,
        },
      }),
    ).toBe(0);
  });

  it("completes the same generation/provider marker instead of inserting a second outbound row", async () => {
    const { conversation } = await createConversation("Complete marker");
    const result = await claim(conversation.id, "Respuesta confirmada");

    expect(result.claimed).toBe(true);
    if (!result.claimed) {
      throw new Error("Expected reply claim to succeed.");
    }

    const completed = await completeAutomationReplyDelivery({
      workspaceId,
      conversationId: conversation.id,
      markerId: result.markerId,
      agentId,
      providerMessageId: "provider-confirmed-1",
      provider: "mock",
      model: "mock-model",
      sendStatus: "sent",
      mocked: false,
    });

    expect(completed).toBe(true);

    const messages = await db.conversationMessage.findMany({
      where: {
        conversationId: conversation.id,
        direction: "outbound",
      },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("assistant");
    expect(messages[0]?.providerMessageId).toBe("provider-confirmed-1");
  });

  it("quarantines a provider-started reply after an uncertain send error", async () => {
    const { conversation } = await createConversation("Unknown provider result");
    const result = await claim(conversation.id, "Respuesta incierta");

    expect(result.claimed).toBe(true);
    if (!result.claimed) {
      throw new Error("Expected reply claim to succeed.");
    }

    const quarantined = await quarantineAutomationReplyDelivery({
      workspaceId,
      conversationId: conversation.id,
      markerId: result.markerId,
      agentId,
      errorCode: "EVOLUTION_TIMEOUT",
    });

    expect(quarantined).toBe(true);

    const message = await db.conversationMessage.findUniqueOrThrow({
      where: { id: result.markerId },
    });
    expect(message.role).toBe(AUTOMATION_REPLY_UNKNOWN_ROLE);

    const next = await claim(conversation.id, "No debe enviarse");
    expect(next).toEqual({
      claimed: false,
      reason: "STALE_REPLY_REQUIRES_REVIEW",
    });
  });

  it("keeps the stale threshold beyond the provider timeout with safety margin", () => {
    expect(
      getAutomationReplyPendingStaleMs({
        AGENT_REPLY_PENDING_STALE_SECONDS: "5",
        EVOLUTION_TIMEOUT_MS: "45000",
      }),
    ).toBe(55_000);

    expect(
      getAutomationReplyPendingStaleMs({
        AGENT_REPLY_PENDING_STALE_SECONDS: "900",
        EVOLUTION_TIMEOUT_MS: "8000",
      }),
    ).toBe(10 * 60_000);
  });
});
