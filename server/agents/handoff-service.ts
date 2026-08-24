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
    const transitioned = await tx.conversation.updateMany({
      where: {
        id: conversation.id,
        workspaceId: context.workspaceId,
        status: conversation.status,
        updatedAt: conversation.updatedAt,
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
        resourceId: conversation.id,
        metadata: {
          event: input.active ? "HUMAN_HANDOFF_STARTED" : "HUMAN_HANDOFF_ENDED",
          source: "operator",
          reason: input.reason,
          instanceId: conversation.instanceId,
          agentId: conversation.agentId,
          ...contactAuditMetadata(conversation.contactPhone),
        },
      },
    });

    return tx.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      select: { id: true, status: true },
    });
  });

  return { changed: true, conversation: result };
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

  const result = await prisma.$transaction(async (tx) => {
    const transitioned = await tx.conversation.updateMany({
      where: {
        id: conversation.id,
        workspaceId: params.workspaceId,
        status: conversation.status,
        updatedAt: conversation.updatedAt,
      },
      data: { status: CONVERSATION_HUMAN_HANDOFF_STATUS },
    });

    if (transitioned.count !== 1) {
      const current = await tx.conversation.findUnique({
        where: { id: conversation.id },
        select: { status: true },
      });

      if (current?.status === CONVERSATION_HUMAN_HANDOFF_STATUS) {
        return { changed: false, status: current.status };
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
        resourceId: conversation.id,
        metadata: {
          event: "HUMAN_HANDOFF_STARTED",
          source: "configured_keyword",
          triggerKeyword: params.keyword.slice(0, 80),
          instanceId: conversation.instanceId,
          agentId: conversation.agentId,
          ...contactAuditMetadata(conversation.contactPhone),
        },
      },
    });

    return {
      changed: true,
      status: CONVERSATION_HUMAN_HANDOFF_STATUS,
    };
  });

  return result;
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
