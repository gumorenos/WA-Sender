import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CONVERSATION_HUMAN_HANDOFF_STATUS,
  CONVERSATION_OPEN_STATUS,
} from "@/lib/agents/handoff";
import {
  HandoffServiceError,
  setConversationHandoff,
  updateAgentHandoffKeywords,
} from "@/server/agents/handoff-service";
import { handleEvolutionWebhook } from "@/server/agents/whatsapp-webhook-service";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("persistent human handoff", () => {
  const runId = suffix();
  const workspaceId = `ws_handoff_${runId}`;
  const otherWorkspaceId = `ws_handoff_other_${runId}`;
  const userId = `user_handoff_${runId}`;
  const instanceId = `inst_handoff_${runId}`;
  const providerInstanceId = `evo_handoff_${runId}`;
  const agentId = `agent_handoff_${runId}`;
  const phone = `5199${runId.replace(/\D/g, "").padEnd(7, "7").slice(0, 7)}`;

  beforeAll(async () => {
    process.env.AGENT_AUTOREPLY_ENABLED = "true";
    process.env.AGENT_REAL_REPLY_ENABLED = "false";
    process.env.REAL_SENDING_ENABLED = "false";
    process.env.MOCK_WHATSAPP_ENABLED = "true";
    process.env.AGENT_REPLY_RATE_LIMIT_SECONDS = "1";

    await db.user.create({
      data: {
        id: userId,
        email: `handoff-${runId}@example.test`,
        status: "ACTIVE",
      },
    });

    await db.workspace.createMany({
      data: [
        {
          id: workspaceId,
          name: `Handoff ${runId}`,
          slug: `handoff-${runId}`,
        },
        {
          id: otherWorkspaceId,
          name: `Handoff other ${runId}`,
          slug: `handoff-other-${runId}`,
        },
      ],
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `Evolution handoff ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId,
        status: "ACTIVE",
      },
    });

    await db.agent.create({
      data: {
        id: agentId,
        workspaceId,
        name: `Agente handoff ${runId}`,
        source: "MANUAL",
        status: "ACTIVE",
        llmProvider: "MOCK",
      },
    });

    const version = await db.agentVersion.create({
      data: {
        workspaceId,
        agentId,
        versionNumber: 1,
        source: "MANUAL",
        generatedPrompt:
          "Eres un agente de QA. Responde de forma breve y no inventes informacion.",
        systemPrompt:
          "Eres un agente de QA. Responde de forma breve y no inventes informacion.",
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
        handoffKeywords: ["asesor humano", "hablar con alguien"],
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
    await db.workspace.deleteMany({
      where: { id: { in: [workspaceId, otherWorkspaceId] } },
    });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  function payload(providerMessageId: string, text: string) {
    return {
      instance: providerInstanceId,
      data: {
        key: {
          id: providerMessageId,
          remoteJid: `${phone}@s.whatsapp.net`,
          fromMe: false,
        },
        pushName: "Cliente Handoff QA",
        message: {
          conversation: text,
        },
      },
    };
  }

  async function getConversation() {
    return db.conversation.findUniqueOrThrow({
      where: {
        workspaceId_instanceId_contactPhone: {
          workspaceId,
          instanceId,
          contactPhone: `+${phone}`,
        },
      },
    });
  }

  it("starts handoff by configured keyword before any automatic reply", async () => {
    const result = await handleEvolutionWebhook(
      payload(`handoff-start-${runId}`, "Quiero hablar con un ASESÓR humano, por favor"),
    );

    expect(result.action).toBe("human_handoff_started");

    const conversation = await getConversation();
    expect(conversation.status).toBe(CONVERSATION_HUMAN_HANDOFF_STATUS);

    const [inboundCount, outboundCount, auditCount] = await Promise.all([
      db.conversationMessage.count({
        where: { conversationId: conversation.id, direction: "inbound" },
      }),
      db.conversationMessage.count({
        where: { conversationId: conversation.id, direction: "outbound" },
      }),
      db.auditLog.count({
        where: {
          workspaceId,
          resourceType: "conversation_handoff",
          resourceId: conversation.id,
        },
      }),
    ]);

    expect(inboundCount).toBe(1);
    expect(outboundCount).toBe(0);
    expect(auditCount).toBe(1);
  });

  it("stores later inbound messages while handoff remains active without replying", async () => {
    const conversation = await getConversation();
    const beforeInbound = await db.conversationMessage.count({
      where: { conversationId: conversation.id, direction: "inbound" },
    });

    const result = await handleEvolutionWebhook(
      payload(`handoff-held-${runId}`, "Sigo esperando respuesta"),
    );

    expect(result.action).toBe("ignored_human_handoff");
    expect(
      await db.conversationMessage.count({
        where: { conversationId: conversation.id, direction: "inbound" },
      }),
    ).toBe(beforeInbound + 1);
    expect(
      await db.conversationMessage.count({
        where: { conversationId: conversation.id, direction: "outbound" },
      }),
    ).toBe(0);
  });

  it("requires explicit operator resume and only replies on a later inbound", async () => {
    const conversation = await getConversation();

    const resumed = await setConversationHandoff(
      conversation.id,
      {
        active: false,
        confirmed: true,
        reason: "La atencion humana termino y el operador devuelve el control al agente.",
      },
      { userId, workspaceId },
    );

    expect(resumed.changed).toBe(true);
    expect(resumed.conversation.status).toBe(CONVERSATION_OPEN_STATUS);
    expect(
      await db.conversationMessage.count({
        where: { conversationId: conversation.id, direction: "outbound" },
      }),
    ).toBe(0);

    const result = await handleEvolutionWebhook(
      payload(`handoff-resumed-${runId}`, "Hola de nuevo"),
    );

    expect(result.action).toBe("agent_reply_sent");
    expect(
      await db.conversationMessage.count({
        where: { conversationId: conversation.id, direction: "outbound" },
      }),
    ).toBe(1);

    const audits = await db.auditLog.findMany({
      where: {
        workspaceId,
        resourceType: "conversation_handoff",
        resourceId: conversation.id,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(audits).toHaveLength(2);
  });

  it("keeps handoff mutations tenant scoped", async () => {
    const conversation = await getConversation();

    await expect(
      setConversationHandoff(
        conversation.id,
        {
          active: true,
          confirmed: true,
          reason: "Intento cross tenant",
        },
        { userId, workspaceId: otherWorkspaceId },
      ),
    ).rejects.toBeInstanceOf(HandoffServiceError);
  });

  it("updates and normalizes handoff keywords with an audit entry", async () => {
    const result = await updateAgentHandoffKeywords(
      agentId,
      { keywords: [" Humano ", "humano", "asesor senior"] },
      { userId, workspaceId },
    );

    expect(result.keywords).toEqual(["Humano", "asesor senior"]);
    expect(
      await db.auditLog.count({
        where: {
          workspaceId,
          resourceType: "agent",
          resourceId: agentId,
        },
      }),
    ).toBeGreaterThanOrEqual(1);
  });
});
