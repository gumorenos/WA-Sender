import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

import {
  CONVERSATION_HUMAN_HANDOFF_STATUS,
  CONVERSATION_OPEN_STATUS,
  conversationHandoffSchema,
  handoffKeywordsSchema,
  normalizeHandoffKeywords,
  type ConversationHandoffInput,
  type HandoffKeywordsInput,
} from "@/lib/agents/handoff";
import { prisma } from "@/lib/db";
import { acquireConversationReplyLock } from "@/server/agents/conversation-reply-lock";

type HandoffContext = {
  userId: string;
  workspaceId: string;
};

export class HandoffServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "HandoffServiceError";
  }
}

function contactAuditMetadata(phone: string) {
  return {
    phoneLast4: phone.slice(-4),
    phoneHash: createHash("sha256").update(phone).digest("hex").slice(0, 16),
  };
}

async function getOwnedConversation(conversationId: string, workspaceId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: {
      id: true,
      workspaceId: true,
      instanceId: true,
      agentId: true,
      contactPhone: true,
      contactDisplayName: true,
      status: true,
      lastMessageAt: true,
      updatedAt: true,
    },
  });

  if (!conversation) {
    throw new HandoffServiceError("Conversacion no encontrada.", 404);
  }

  return conversation;
}

export async function setConversationHandoff(
  conversationId: string,
  rawInput: unknown,
  context: HandoffContext,
) {
  const parsed = conversationHandoffSchema.safeParse(rawInput);

  if (!parsed.success) {
    throw new HandoffServiceError(
      parsed.error.issues[0]?.message ?? "Datos invalidos.",
      400,
    );
  }

  const input: ConversationHandoffInput = parsed.data;
  const conversation = await getOwnedConversation(
    conversationId,
    context.workspaceId,
  );
  const targetStatus = input.active
    ? CONVERSATION_HUMAN_HANDOFF_STATUS
    : CONVERSATION_OPEN_STATUS;

  if (conversation.status === targetStatus) {
    return {
      changed: false,
      conversation: {
        id: conversation.id,
        status: conversation.status,
      },
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    await acquireConversationReplyLock(tx, context.workspaceId, conversation.id);

    const current = await tx.conversation.findFirst({
      where: {
        id: conversation.id,
        workspaceId: context.workspaceId,
      },
      select: {
        id: true,
        instanceId: true,
        agentId: true,
        contactPhone: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!current) {
      throw new HandoffServiceError("Conversacion no encontrada.", 404);
    }

    if (current.status === targetStatus) {
      return {
        id: current.id,
        status: current.status,
        changed: false,
      };
    }

    const transitioned = await tx.conversation.updateMany({
      where: {
        id: current.id,
        workspaceId: context.workspaceId,
        status: current.status,
        updatedAt: current.updatedAt,
      },
      data: { status: targetStatus },
    });

    if (transitioned.count !== 1) {
      throw new HandoffServiceError(
        "La conversacion cambio mientras procesabamos la solicitud. Recarga e intenta nuevamente.",
        409,
      );
    }

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        action: "UPDATED",
        resourceType: "conversation_handoff",
        resourceId: current.id,
        metadata: {
          event: input.active ? "HUMAN_HANDOFF_STARTED" : "HUMAN_HANDOFF_ENDED",
          source: "operator",
          reason: input.reason,
          instanceId: current.instanceId,
          agentId: current.agentId,
          ...contactAuditMetadata(current.contactPhone),
        },
      },
    });

    const saved = await tx.conversation.findUniqueOrThrow({
      where: { id: current.id },
      select: { id: true, status: true },
    });

    return { ...saved, changed: true };
  });

  return {
    changed: result.changed,
    conversation: {
      id: result.id,
      status: result.status,
    },
  };
}

export async function startKeywordHandoff(params: {
  conversationId: string;
  workspaceId: string;
  keyword: string;
}) {
  const conversation = await getOwnedConversation(
    params.conversationId,
    params.workspaceId,
  );

  if (conversation.status === CONVERSATION_HUMAN_HANDOFF_STATUS) {
    return { changed: false, status: conversation.status };
  }

  return prisma.$transaction(async (tx) => {
    await acquireConversationReplyLock(tx, params.workspaceId, conversation.id);

    const current = await tx.conversation.findFirst({
      where: {
        id: conversation.id,
        workspaceId: params.workspaceId,
      },
      select: {
        id: true,
        instanceId: true,
        agentId: true,
        contactPhone: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!current) {
      throw new HandoffServiceError("Conversacion no encontrada.", 404);
    }

    if (current.status === CONVERSATION_HUMAN_HANDOFF_STATUS) {
      return { changed: false, status: current.status };
    }

    const transitioned = await tx.conversation.updateMany({
      where: {
        id: current.id,
        workspaceId: params.workspaceId,
        status: current.status,
        updatedAt: current.updatedAt,
      },
      data: { status: CONVERSATION_HUMAN_HANDOFF_STATUS },
    });

    if (transitioned.count !== 1) {
      const latest = await tx.conversation.findUnique({
        where: { id: current.id },
        select: { status: true },
      });

      if (latest?.status === CONVERSATION_HUMAN_HANDOFF_STATUS) {
        return { changed: false, status: latest.status };
      }

      throw new HandoffServiceError(
        "La conversacion cambio durante el handoff automatico.",
        409,
      );
    }

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        action: "UPDATED",
        resourceType: "conversation_handoff",
        resourceId: current.id,
        metadata: {
          event: "HUMAN_HANDOFF_STARTED",
          source: "configured_keyword",
          triggerKeyword: params.keyword.slice(0, 80),
          instanceId: current.instanceId,
          agentId: current.agentId,
          ...contactAuditMetadata(current.contactPhone),
        },
      },
    });

    return {
      changed: true,
      status: CONVERSATION_HUMAN_HANDOFF_STATUS,
    };
  });
}

export async function updateAgentHandoffKeywords(
  agentId: string,
  rawInput: unknown,
  context: HandoffContext,
) {
  const parsed = handoffKeywordsSchema.safeParse(rawInput);

  if (!parsed.success) {
    throw new HandoffServiceError(
      parsed.error.issues[0]?.message ?? "Keywords invalidas.",
      400,
    );
  }

  const input: HandoffKeywordsInput = parsed.data;
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId: context.workspaceId },
    select: { id: true },
  });

  if (!agent) {
    throw new HandoffServiceError("Agente no encontrado.", 404);
  }

  const keywords = normalizeHandoffKeywords(input.keywords);

  const settings = await prisma.$transaction(async (tx) => {
    const saved = await tx.agentSetting.upsert({
      where: { agentId: agent.id },
      create: {
        workspaceId: context.workspaceId,
        agentId: agent.id,
        handoffKeywords: keywords satisfies Prisma.InputJsonValue,
      },
      update: {
        handoffKeywords: keywords satisfies Prisma.InputJsonValue,
      },
      select: {
        agentId: true,
        handoffKeywords: true,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        action: "UPDATED",
        resourceType: "agent",
        resourceId: agent.id,
        metadata: {
          event: "AGENT_HANDOFF_KEYWORDS_UPDATED",
          keywordCount: keywords.length,
        },
      },
    });

    return saved;
  });

  return {
    agentId: settings.agentId,
    keywords: normalizeHandoffKeywords(settings.handoffKeywords),
  };
}

export async function listConversationsForOperations(workspaceId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { workspaceId },
    orderBy: [{ status: "desc" }, { lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      instanceId: true,
      agentId: true,
      contactPhone: true,
      contactDisplayName: true,
      status: true,
      lastMessageAt: true,
      updatedAt: true,
      agent: { select: { name: true } },
      instance: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          direction: true,
          content: true,
          createdAt: true,
        },
      },
    },
  });

  return conversations.map((conversation) => ({
    id: conversation.id,
    instanceId: conversation.instanceId,
    instanceName: conversation.instance.name,
    agentId: conversation.agentId,
    agentName: conversation.agent?.name ?? null,
    contactPhone: conversation.contactPhone,
    contactDisplayName: conversation.contactDisplayName,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    updatedAt: conversation.updatedAt.toISOString(),
    lastMessage: conversation.messages[0]
      ? {
          direction: conversation.messages[0].direction,
          content: conversation.messages[0].content.slice(0, 240),
          createdAt: conversation.messages[0].createdAt.toISOString(),
        }
      : null,
  }));
}
