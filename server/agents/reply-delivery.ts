import { Prisma } from "@prisma/client";

import { CONVERSATION_HUMAN_HANDOFF_STATUS } from "@/lib/agents/handoff";
import { prisma } from "@/lib/db";
import { acquireConversationReplyLock } from "@/server/agents/conversation-reply-lock";

export const AUTOMATION_REPLY_PENDING_ROLE = "assistant_pending";
export const AUTOMATION_REPLY_UNKNOWN_ROLE = "assistant_unknown";

export type AutomationReplyClaimResult =
  | {
      claimed: true;
      markerId: string;
    }
  | {
      claimed: false;
      reason:
        | "CONVERSATION_NOT_FOUND"
        | "HUMAN_HANDOFF"
        | "CONTACT_BLOCKED"
        | "AGENT_DISABLED"
        | "REPLY_IN_FLIGHT"
        | "STALE_REPLY_REQUIRES_REVIEW"
        | "RATE_LIMITED";
    };

type ReplyPendingEnv = {
  AGENT_REPLY_PENDING_STALE_SECONDS?: string;
  EVOLUTION_TIMEOUT_MS?: string;
};

function safePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getAutomationReplyPendingStaleMs(env?: ReplyPendingEnv) {
  const pendingStaleSeconds =
    env === undefined
      ? process.env.AGENT_REPLY_PENDING_STALE_SECONDS
      : env.AGENT_REPLY_PENDING_STALE_SECONDS;
  const evolutionTimeoutMs =
    env === undefined
      ? process.env.EVOLUTION_TIMEOUT_MS
      : env.EVOLUTION_TIMEOUT_MS;
  const providerTimeoutMs = safePositiveInt(evolutionTimeoutMs, 8_000);
  const configuredMs = safePositiveInt(pendingStaleSeconds, 30) * 1000;

  return Math.min(
    10 * 60_000,
    Math.max(30_000, configuredMs, providerTimeoutMs + 10_000),
  );
}

function pendingMetadata(params: {
  agentId: string;
  model: string | null;
  provider: string;
}) {
  return {
    automationReply: true,
    deliveryState: "PROVIDER_CALL_STARTED",
    agentId: params.agentId,
    provider: params.provider,
    model: params.model,
  } satisfies Prisma.InputJsonValue;
}

function unknownMetadata(params: {
  reason: string;
  previousMarkerCreatedAt: Date;
}) {
  return {
    automationReply: true,
    deliveryState: "UNKNOWN_PROVIDER_RESULT",
    reason: params.reason,
    previousMarkerCreatedAt: params.previousMarkerCreatedAt.toISOString(),
  } satisfies Prisma.InputJsonValue;
}

export async function claimAutomationReplyDelivery(params: {
  workspaceId: string;
  conversationId: string;
  agentId: string;
  content: string;
  provider: string;
  model: string | null;
  rateLimitSeconds: number;
  now?: Date;
}): Promise<AutomationReplyClaimResult> {
  const now = params.now ?? new Date();
  const staleCutoff = new Date(now.getTime() - getAutomationReplyPendingStaleMs());
  const rateLimitSince = new Date(
    now.getTime() - Math.max(1, params.rateLimitSeconds) * 1000,
  );

  return prisma.$transaction(async (tx) => {
    await acquireConversationReplyLock(
      tx,
      params.workspaceId,
      params.conversationId,
    );

    const conversation = await tx.conversation.findFirst({
      where: {
        id: params.conversationId,
        workspaceId: params.workspaceId,
      },
      select: {
        id: true,
        status: true,
        contactPhone: true,
      },
    });

    if (!conversation) {
      return { claimed: false, reason: "CONVERSATION_NOT_FOUND" };
    }

    if (conversation.status === CONVERSATION_HUMAN_HANDOFF_STATUS) {
      return { claimed: false, reason: "HUMAN_HANDOFF" };
    }

    const [
      optOut,
      deniedExtractedNumber,
      agent,
      pendingReply,
      unknownReply,
      recentReply,
    ] = await Promise.all([
      tx.optOut.findUnique({
        where: {
          workspaceId_phone: {
            workspaceId: params.workspaceId,
            phone: conversation.contactPhone,
          },
        },
        select: { id: true },
      }),
      tx.extractedNumber.findFirst({
        where: {
          workspaceId: params.workspaceId,
          phone: conversation.contactPhone,
          OR: [
            { consentStatus: "EXPLICITLY_DENIED" },
            { optInStatus: "DENIED" },
          ],
        },
        select: { id: true },
      }),
      tx.agent.findFirst({
        where: {
          id: params.agentId,
          workspaceId: params.workspaceId,
        },
        select: {
          status: true,
          settings: {
            select: { autoReplyEnabled: true },
          },
        },
      }),
      tx.conversationMessage.findFirst({
        where: {
          conversationId: conversation.id,
          workspaceId: params.workspaceId,
          role: AUTOMATION_REPLY_PENDING_ROLE,
          direction: "outbound",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
        },
      }),
      tx.conversationMessage.findFirst({
        where: {
          conversationId: conversation.id,
          workspaceId: params.workspaceId,
          role: AUTOMATION_REPLY_UNKNOWN_ROLE,
          direction: "outbound",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }),
      tx.conversationMessage.findFirst({
        where: {
          conversationId: conversation.id,
          workspaceId: params.workspaceId,
          role: "assistant",
          direction: "outbound",
          createdAt: { gte: rateLimitSince },
        },
        select: { id: true },
      }),
    ]);

    if (optOut || deniedExtractedNumber) {
      return { claimed: false, reason: "CONTACT_BLOCKED" };
    }

    if (agent?.status !== "ACTIVE" || agent.settings?.autoReplyEnabled !== true) {
      return { claimed: false, reason: "AGENT_DISABLED" };
    }

    if (unknownReply) {
      return { claimed: false, reason: "STALE_REPLY_REQUIRES_REVIEW" };
    }

    if (pendingReply) {
      if (pendingReply.createdAt > staleCutoff) {
        return { claimed: false, reason: "REPLY_IN_FLIGHT" };
      }

      const quarantined = await tx.conversationMessage.updateMany({
        where: {
          id: pendingReply.id,
          workspaceId: params.workspaceId,
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_PENDING_ROLE,
          createdAt: { lte: staleCutoff },
        },
        data: {
          role: AUTOMATION_REPLY_UNKNOWN_ROLE,
          metadata: unknownMetadata({
            reason: "STALE_AUTOMATION_REPLY_MARKER",
            previousMarkerCreatedAt: pendingReply.createdAt,
          }),
        },
      });

      if (quarantined.count === 1) {
        await tx.auditLog.create({
          data: {
            workspaceId: params.workspaceId,
            action: "UPDATED",
            resourceType: "agent_reply_delivery",
            resourceId: pendingReply.id,
            metadata: {
              event: "AUTOMATION_REPLY_STALE_QUARANTINED",
              conversationId: conversation.id,
              agentId: params.agentId,
            },
          },
        });
      }

      return { claimed: false, reason: "STALE_REPLY_REQUIRES_REVIEW" };
    }

    if (recentReply) {
      return { claimed: false, reason: "RATE_LIMITED" };
    }

    const marker = await tx.conversationMessage.create({
      data: {
        workspaceId: params.workspaceId,
        conversationId: conversation.id,
        role: AUTOMATION_REPLY_PENDING_ROLE,
        direction: "outbound",
        content: params.content,
        metadata: pendingMetadata({
          agentId: params.agentId,
          provider: params.provider,
          model: params.model,
        }),
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        action: "UPDATED",
        resourceType: "agent_reply_delivery",
        resourceId: marker.id,
        metadata: {
          event: "AUTOMATION_REPLY_PROVIDER_CALL_STARTED",
          conversationId: conversation.id,
          agentId: params.agentId,
          provider: params.provider,
          model: params.model,
        },
      },
    });

    return {
      claimed: true,
      markerId: marker.id,
    };
  });
}

export async function completeAutomationReplyDelivery(params: {
  workspaceId: string;
  conversationId: string;
  markerId: string;
  agentId: string;
  providerMessageId: string | null;
  provider: string;
  model: string | null;
  sendStatus: string;
  mocked: boolean;
  completedAt?: Date;
}) {
  const completedAt = params.completedAt ?? new Date();

  return prisma.$transaction(async (tx) => {
    const completed = await tx.conversationMessage.updateMany({
      where: {
        id: params.markerId,
        workspaceId: params.workspaceId,
        conversationId: params.conversationId,
        role: AUTOMATION_REPLY_PENDING_ROLE,
      },
      data: {
        role: "assistant",
        providerMessageId: params.providerMessageId,
        metadata: {
          automationReply: true,
          deliveryState: "SENT",
          provider: params.provider,
          model: params.model,
          sendStatus: params.sendStatus,
          mocked: params.mocked,
        } satisfies Prisma.InputJsonValue,
      },
    });

    if (completed.count !== 1) {
      return false;
    }

    await tx.conversation.updateMany({
      where: {
        id: params.conversationId,
        workspaceId: params.workspaceId,
      },
      data: {
        agentId: params.agentId,
        lastMessageAt: completedAt,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        action: "UPDATED",
        resourceType: "agent_reply_delivery",
        resourceId: params.markerId,
        metadata: {
          event: "AUTOMATION_REPLY_SENT",
          conversationId: params.conversationId,
          agentId: params.agentId,
          provider: params.provider,
          model: params.model,
          mocked: params.mocked,
        },
      },
    });

    return true;
  });
}

export async function quarantineAutomationReplyDelivery(params: {
  workspaceId: string;
  conversationId: string;
  markerId: string;
  agentId: string;
  errorCode: string;
}) {
  return prisma.$transaction(async (tx) => {
    const quarantined = await tx.conversationMessage.updateMany({
      where: {
        id: params.markerId,
        workspaceId: params.workspaceId,
        conversationId: params.conversationId,
        role: AUTOMATION_REPLY_PENDING_ROLE,
      },
      data: {
        role: AUTOMATION_REPLY_UNKNOWN_ROLE,
        metadata: {
          automationReply: true,
          deliveryState: "UNKNOWN_PROVIDER_RESULT",
          errorCode: params.errorCode.slice(0, 120),
        } satisfies Prisma.InputJsonValue,
      },
    });

    if (quarantined.count !== 1) {
      return false;
    }

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        action: "UPDATED",
        resourceType: "agent_reply_delivery",
        resourceId: params.markerId,
        metadata: {
          event: "AUTOMATION_REPLY_PROVIDER_RESULT_UNKNOWN",
          conversationId: params.conversationId,
          agentId: params.agentId,
          errorCode: params.errorCode.slice(0, 120),
        },
      },
    });

    return true;
  });
}
