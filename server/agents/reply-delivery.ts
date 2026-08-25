import { Prisma } from "@prisma/client";

import { CONVERSATION_HUMAN_HANDOFF_STATUS } from "@/lib/agents/handoff";
import { prisma } from "@/lib/db";
import { acquireConversationReplyLock } from "@/server/agents/conversation-reply-lock";
import {
  reserveAgentProviderStartInTransaction,
  type AgentDailyBudgetEnv,
} from "@/server/agents/daily-budget";

export const AUTOMATION_REPLY_PENDING_ROLE = "assistant_pending";
export const AUTOMATION_REPLY_UNKNOWN_ROLE = "assistant_unknown";
const AUTOMATION_REPLY_GENERATING_ROLE = "assistant_generating";
const AUTOMATION_REPLY_ABANDONED_ROLE = "assistant_not_sent";

export type AutomationReplyClaimResult =
  | {
      claimed: true;
      markerId: string;
      budget: {
        usageDate: string;
        limit: number;
        usedAfter: number;
      };
    }
  | {
      claimed: false;
      reason:
        | "CONVERSATION_NOT_FOUND"
        | "GENERATION_LEASE_LOST"
        | "HUMAN_HANDOFF"
        | "CONTACT_BLOCKED"
        | "AGENT_DISABLED"
        | "WORKSPACE_DISABLED"
        | "REPLY_IN_FLIGHT"
        | "STALE_REPLY_REQUIRES_REVIEW"
        | "RATE_LIMITED"
        | "DAILY_PROVIDER_LIMIT_REACHED";
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
  budgetDate: string;
  budgetLimit: number;
  budgetUsedAfter: number;
}) {
  return {
    automationReply: true,
    deliveryState: "PROVIDER_CALL_STARTED",
    agentId: params.agentId,
    provider: params.provider,
    model: params.model,
    dailyBudgetDate: params.budgetDate,
    dailyProviderLimit: params.budgetLimit,
    dailyProviderUsedAfter: params.budgetUsedAfter,
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

async function releaseGenerationLease(
  tx: Prisma.TransactionClient,
  params: {
    workspaceId: string;
    conversationId: string;
    generationLeaseId: string;
    agentId: string;
    reason: string;
  },
) {
  const released = await tx.conversationMessage.updateMany({
    where: {
      id: params.generationLeaseId,
      workspaceId: params.workspaceId,
      conversationId: params.conversationId,
      role: AUTOMATION_REPLY_GENERATING_ROLE,
      direction: "outbound",
    },
    data: {
      role: AUTOMATION_REPLY_ABANDONED_ROLE,
      content: "",
      metadata: {
        automationReply: true,
        deliveryState: "LLM_RESULT_DISCARDED",
        reason: params.reason.slice(0, 120),
      } satisfies Prisma.InputJsonValue,
    },
  });

  if (released.count === 1) {
    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        action: "UPDATED",
        resourceType: "agent_reply_generation",
        resourceId: params.generationLeaseId,
        metadata: {
          event: "AUTOMATION_REPLY_LLM_LEASE_RELEASED",
          conversationId: params.conversationId,
          agentId: params.agentId,
          reason: params.reason.slice(0, 120),
        },
      },
    });
  }

  return released.count === 1;
}

export async function claimAutomationReplyDelivery(params: {
  workspaceId: string;
  conversationId: string;
  generationLeaseId: string;
  agentId: string;
  content: string;
  provider: string;
  model: string | null;
  rateLimitSeconds: number;
  now?: Date;
  budgetEnv?: AgentDailyBudgetEnv;
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

    const generationLease = await tx.conversationMessage.findFirst({
      where: {
        id: params.generationLeaseId,
        workspaceId: params.workspaceId,
        conversationId: conversation.id,
        role: AUTOMATION_REPLY_GENERATING_ROLE,
        direction: "outbound",
      },
      select: { id: true },
    });

    if (!generationLease) {
      return { claimed: false, reason: "GENERATION_LEASE_LOST" };
    }

    if (conversation.status === CONVERSATION_HUMAN_HANDOFF_STATUS) {
      await releaseGenerationLease(tx, {
        ...params,
        reason: "HUMAN_HANDOFF_BEFORE_PROVIDER",
      });
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
      await releaseGenerationLease(tx, {
        ...params,
        reason: "CONTACT_BLOCKED_BEFORE_PROVIDER",
      });
      return { claimed: false, reason: "CONTACT_BLOCKED" };
    }

    if (agent?.status !== "ACTIVE" || agent.settings?.autoReplyEnabled !== true) {
      await releaseGenerationLease(tx, {
        ...params,
        reason: "AGENT_DISABLED_BEFORE_PROVIDER",
      });
      return { claimed: false, reason: "AGENT_DISABLED" };
    }

    if (unknownReply) {
      await releaseGenerationLease(tx, {
        ...params,
        reason: "UNKNOWN_REPLY_BLOCKS_PROVIDER",
      });
      return { claimed: false, reason: "STALE_REPLY_REQUIRES_REVIEW" };
    }

    if (pendingReply) {
      if (pendingReply.createdAt > staleCutoff) {
        await releaseGenerationLease(tx, {
          ...params,
          reason: "PROVIDER_REPLY_ALREADY_IN_FLIGHT",
        });
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

      await releaseGenerationLease(tx, {
        ...params,
        reason: "STALE_PROVIDER_REPLY_REQUIRES_REVIEW",
      });
      return { claimed: false, reason: "STALE_REPLY_REQUIRES_REVIEW" };
    }

    if (recentReply) {
      await releaseGenerationLease(tx, {
        ...params,
        reason: "RATE_LIMITED_BEFORE_PROVIDER",
      });
      return { claimed: false, reason: "RATE_LIMITED" };
    }

    const providerBudget = await reserveAgentProviderStartInTransaction(tx, {
      workspaceId: params.workspaceId,
      now,
      env: params.budgetEnv,
    });

    if (!providerBudget.reserved) {
      const reason =
        providerBudget.reason === "WORKSPACE_NOT_FOUND"
          ? "WORKSPACE_DISABLED"
          : "DAILY_PROVIDER_LIMIT_REACHED";

      await releaseGenerationLease(tx, {
        ...params,
        reason,
      });

      return { claimed: false, reason };
    }

    const promoted = await tx.conversationMessage.updateMany({
      where: {
        id: generationLease.id,
        workspaceId: params.workspaceId,
        conversationId: conversation.id,
        role: AUTOMATION_REPLY_GENERATING_ROLE,
        direction: "outbound",
      },
      data: {
        role: AUTOMATION_REPLY_PENDING_ROLE,
        content: params.content,
        metadata: pendingMetadata({
          agentId: params.agentId,
          provider: params.provider,
          model: params.model,
          budgetDate: providerBudget.usageDate,
          budgetLimit: providerBudget.limit,
          budgetUsedAfter: providerBudget.usedAfter,
        }),
      },
    });

    if (promoted.count !== 1) {
      throw new Error("Automation reply generation lease could not be promoted.");
    }

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        action: "UPDATED",
        resourceType: "agent_reply_delivery",
        resourceId: generationLease.id,
        metadata: {
          event: "AUTOMATION_REPLY_PROVIDER_CALL_STARTED",
          conversationId: conversation.id,
          agentId: params.agentId,
          provider: params.provider,
          model: params.model,
          dailyBudgetDate: providerBudget.usageDate,
          dailyProviderLimit: providerBudget.limit,
          dailyProviderUsedAfter: providerBudget.usedAfter,
        },
      },
    });

    return {
      claimed: true,
      markerId: generationLease.id,
      budget: {
        usageDate: providerBudget.usageDate,
        limit: providerBudget.limit,
        usedAfter: providerBudget.usedAfter,
      },
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
