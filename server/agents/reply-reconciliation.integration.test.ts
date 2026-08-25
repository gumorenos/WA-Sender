import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listConversationsForOperations } from "@/server/agents/handoff-service";
import {
  AUTOMATION_REPLY_NOT_SENT_ROLE,
  AutomationReplyReconciliationError,
  reconcileUnknownAutomationReply,
} from "@/server/agents/reply-reconciliation";
import { claimAutomationReplyGeneration } from "@/server/agents/reply-generation";
import { AUTOMATION_REPLY_UNKNOWN_ROLE } from "@/server/agents/reply-delivery";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("automation reply reconciliation", () => {
  const runId = suffix();
  const workspaceId = `ws_reply_reconcile_${runId}`;
  const otherWorkspaceId = `ws_reply_reconcile_other_${runId}`;
  const userId = `user_reply_reconcile_${runId}`;
  const instanceId = `inst_reply_reconcile_${runId}`;
  const agentId = `agent_reply_reconcile_${runId}`;
  let sequence = 0;

  beforeAll(async () => {
    await db.user.create({
      data: {
        id: userId,
        email: `reply-reconcile-${runId}@example.test`,
        status: "ACTIVE",
      },
    });

    await db.workspace.createMany({
      data: [
        {
          id: workspaceId,
          name: `Reply reconcile ${runId}`,
          slug: `reply-reconcile-${runId}`,
        },
        {
          id: otherWorkspaceId,
          name: `Reply reconcile other ${runId}`,
          slug: `reply-reconcile-other-${runId}`,
        },
      ],
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `Reply reconcile instance ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId: `evo_reply_reconcile_${runId}`,
        status: "ACTIVE",
      },
    });

    await db.agent.create({
      data: {
        id: agentId,
        workspaceId,
        name: `Reply reconcile agent ${runId}`,
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
    await db.workspace.deleteMany({
      where: { id: { in: [workspaceId, otherWorkspaceId] } },
    });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  async function createUnknownReply(options?: { providerMessageId?: string | null }) {
    sequence += 1;
    const phone = `+5197${String(sequence).padStart(7, "0")}`;
    const conversation = await db.conversation.create({
      data: {
        workspaceId,
        instanceId,
        agentId,
        contactPhone: phone,
        contactDisplayName: `Contact ${sequence}`,
        status: "OPEN",
        messages: {
          create: [
            {
              workspaceId,
              role: "user",
              direction: "inbound",
              content: `Inbound ${sequence}`,
            },
            {
              workspaceId,
              role: AUTOMATION_REPLY_UNKNOWN_ROLE,
              direction: "outbound",
              content: `Respuesta incierta ${sequence}`,
              providerMessageId: options?.providerMessageId ?? null,
              metadata: {
                automationReply: true,
                deliveryState: "UNKNOWN_PROVIDER_RESULT",
              },
            },
          ],
        },
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    const unknown = conversation.messages.find(
      (message) => message.role === AUTOMATION_REPLY_UNKNOWN_ROLE,
    );
    if (!unknown) {
      throw new Error("Expected unknown reply fixture.");
    }

    return { conversation, unknown, phone };
  }

  function claimGeneration(conversationId: string) {
    return claimAutomationReplyGeneration({
      workspaceId,
      conversationId,
      agentId,
      provider: "mock",
      model: "mock-model",
      rateLimitSeconds: 60,
    });
  }

  const context = { userId, workspaceId };

  it("confirms sent without creating a second outbound message", async () => {
    const { conversation, unknown } = await createUnknownReply();

    const result = await reconcileUnknownAutomationReply(
      conversation.id,
      unknown.id,
      {
        confirmed: true,
        resolution: "CONFIRMED_SENT",
        reason: "Verificado en la consola del proveedor.",
        providerMessageId: "provider-confirmed-reply-1",
      },
      context,
    );

    expect(result.messageRole).toBe("assistant");
    expect(result.providerMessageId).toBe("provider-confirmed-reply-1");

    const outbound = await db.conversationMessage.findMany({
      where: {
        conversationId: conversation.id,
        direction: "outbound",
      },
    });
    expect(outbound).toHaveLength(1);
    expect(outbound[0]?.id).toBe(unknown.id);
    expect(outbound[0]?.role).toBe("assistant");

    const updatedConversation = await db.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      select: { lastMessageAt: true },
    });
    expect(updatedConversation.lastMessageAt?.getTime()).toBe(unknown.createdAt.getTime());
  });

  it("confirms not sent without replaying the old response and unblocks a future generation claim", async () => {
    const { conversation, unknown } = await createUnknownReply();

    const before = await claimGeneration(conversation.id);
    expect(before).toEqual({
      claimed: false,
      reason: "STALE_REPLY_REQUIRES_REVIEW",
    });

    const result = await reconcileUnknownAutomationReply(
      conversation.id,
      unknown.id,
      {
        confirmed: true,
        resolution: "CONFIRMED_NOT_SENT",
        reason: "Proveedor confirma que el request no fue aceptado.",
      },
      context,
    );

    expect(result.messageRole).toBe(AUTOMATION_REPLY_NOT_SENT_ROLE);

    const oldReply = await db.conversationMessage.findUniqueOrThrow({
      where: { id: unknown.id },
    });
    expect(oldReply.role).toBe(AUTOMATION_REPLY_NOT_SENT_ROLE);
    expect(oldReply.content).toContain("Respuesta incierta");

    const after = await claimGeneration(conversation.id);
    expect(after.claimed).toBe(true);
  });

  it("allows exactly one of two concurrent reconciliations", async () => {
    const { conversation, unknown } = await createUnknownReply();

    const results = await Promise.allSettled([
      reconcileUnknownAutomationReply(
        conversation.id,
        unknown.id,
        {
          confirmed: true,
          resolution: "CONFIRMED_SENT",
          reason: "Operador uno encontro evidencia de envio.",
        },
        context,
      ),
      reconcileUnknownAutomationReply(
        conversation.id,
        unknown.id,
        {
          confirmed: true,
          resolution: "CONFIRMED_NOT_SENT",
          reason: "Operador dos encontro evidencia contraria.",
        },
        context,
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(AutomationReplyReconciliationError);
      expect((rejected.reason as AutomationReplyReconciliationError).status).toBe(409);
    }

    expect(
      await db.auditLog.count({
        where: {
          workspaceId,
          resourceType: "agent_reply_reconciliation",
          resourceId: unknown.id,
        },
      }),
    ).toBe(1);
  });

  it("rejects a provider id that conflicts with stored evidence", async () => {
    const { conversation, unknown } = await createUnknownReply({
      providerMessageId: "provider-original",
    });

    await expect(
      reconcileUnknownAutomationReply(
        conversation.id,
        unknown.id,
        {
          confirmed: true,
          resolution: "CONFIRMED_SENT",
          reason: "La evidencia tiene un identificador diferente.",
          providerMessageId: "provider-conflict",
        },
        context,
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(
      (await db.conversationMessage.findUniqueOrThrow({ where: { id: unknown.id } })).role,
    ).toBe(AUTOMATION_REPLY_UNKNOWN_ROLE);
  });

  it("rejects provider ids when the operator confirms not sent", async () => {
    const { conversation, unknown } = await createUnknownReply();

    await expect(
      reconcileUnknownAutomationReply(
        conversation.id,
        unknown.id,
        {
          confirmed: true,
          resolution: "CONFIRMED_NOT_SENT",
          reason: "Proveedor confirma que no hubo envio.",
          providerMessageId: "provider-should-not-be-accepted",
        },
        context,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("enforces the workspace boundary", async () => {
    const { conversation, unknown } = await createUnknownReply();

    await expect(
      reconcileUnknownAutomationReply(
        conversation.id,
        unknown.id,
        {
          confirmed: true,
          resolution: "CONFIRMED_NOT_SENT",
          reason: "Intento desde otro workspace no autorizado.",
        },
        { userId, workspaceId: otherWorkspaceId },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("requires explicit confirmation and a meaningful reason", async () => {
    const { conversation, unknown } = await createUnknownReply();

    await expect(
      reconcileUnknownAutomationReply(
        conversation.id,
        unknown.id,
        {
          confirmed: false,
          resolution: "CONFIRMED_NOT_SENT",
          reason: "corto",
        },
        context,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("does not expose unknown generated content in ordinary conversation listing", async () => {
    const { conversation, unknown } = await createUnknownReply();

    const memberView = await listConversationsForOperations(workspaceId, {
      includeReplyReview: false,
    });
    const memberConversation = memberView.find((item) => item.id === conversation.id);
    expect(memberConversation?.replyReview).toBeNull();
    expect(memberConversation?.lastMessage?.content).not.toBe(unknown.content);
    expect(memberConversation?.lastMessage?.content).toContain("Inbound");

    const operatorView = await listConversationsForOperations(workspaceId, {
      includeReplyReview: true,
    });
    const operatorConversation = operatorView.find((item) => item.id === conversation.id);
    expect(operatorConversation?.replyReview).toMatchObject({
      id: unknown.id,
      content: unknown.content,
    });
  });
});
