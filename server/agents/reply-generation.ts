import { Prisma } from "@prisma/client";

import { CONVERSATION_HUMAN_HANDOFF_STATUS } from "@/lib/agents/handoff";
import { prisma } from "@/lib/db";
import { acquireConversationReplyLock } from "@/server/agents/conversation-reply-lock";
import {
  reserveAgentLlmAttemptInTransaction,
  type AgentDailyBudgetEnv,
} from "@/server/agents/daily-budget";
import {
  AUTOMATION_REPLY_PENDING_ROLE,
  AUTOMATION_REPLY_UNKNOWN_ROLE,
  getAutomationReplyPendingStaleMs,
} from "@/server/agents/reply-delivery";

export const AUTOMATION_REPLY_GENERATING_ROLE = "assistant_generating";
export const AUTOMATION_REPLY_ABANDONED_ROLE = "assistant_not_sent";

export type AutomationReplyGenerationClaimResult =
  | {
      claimed: true;
      leaseId: string;
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
        | "HUMAN_HANDOFF"
        | "CONTACT_BLOCKED"
        | "AGENT_DISABLED"
        | "WORKSPACE_DISABLED"
        | "GENERATION_IN_FLIGHT"
        | "REPLY_IN_FLIGHT"
        | "STALE_REPLY_REQUIRES_REVIEW"
        | "RATE_LIMITED"
        | "DAILY_LLM_LIMIT_REACHED";
      budget?: {
        usageDate?: string;
        limit: number;
        usedBefore?: number;
      };
    };

type GenerationLeaseEnv = {
  AGENT_LLM_GENERATION_STALE_SECONDS?: string;
};

function safePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getAutomationReplyGenerationStaleMs(env?: GenerationLeaseEnv) {
  const configured =
    env === undefined
      ? process.env.AGENT_LLM_GENERATION_STALE_SECONDS
      : env.AGENT_LLM_GENERATION_STALE_SECONDS;

  return Math.min(
    10 * 60_000,
    Math.max(45_000, safePositiveInt(configured, 60) * 1000),
  );
}

function generationMetadata(params: {
  agentId: string;
  provider: string;
  model: string | null;
  budgetDate: string;
  budgetLimit: number;
  budgetUsedAfter: number;
}) {
  return {
    automationReply: true,
    deliveryState: "LLM_CALL_STARTED",
    agentId: params.agentId,
    provider: params.provider,
    model: params.model,
    dailyBudgetDate: params.budgetDate,
    dailyLlmLimit: params.budgetLimit,
    dailyLlmUsedAfter: params.budgetUsedAfter,
  } satisfies Prisma.InputJsonValue;
}

function abandonedMetadata(params: {
  reason: string;
  previousLeaseCreatedAt?: Date;
}) {
  return {
    automationReply: true,
    deliveryState: "LLM_RESULT_DISCARDED",
    reason: params.reason.slice(0, 120),
    ...(params.previousLeaseCreatedAt
      ? { previousLeaseCreatedAt: params.previousLeaseCreatedAt.toISOString() }
      : {}),
  } satisfies Prisma.InputJsonValue;
}

async function abandonGenerationLeaseInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    workspaceId: string;
    conversationId: string;
    leaseId: string;
    agentId: string;
    reason: string;
    previousLeaseCreatedAt?: Date;
  },
) {
  const abandoned = await tx.conversationMessage.updateMany({
    where: {
      id: params.leaseId,
      workspaceId: params.workspaceId,
      conversationId: params.conversationId,
      role: AUTOMATION_REPLY_GENERATING_ROLE,
      direction: "outbound",
    },
    data: {
      role: AUTOMATION_REPLY_ABANDONED_ROLE,
      content: "",
      metadata: abandonedMetadata({
        reason: params.reason,
        previousLeaseCreatedAt: params.previousLeaseCreatedAt,
      }),
    },
  });

  if (abandoned.count !== 1) {
    return false;
  }

  await tx.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      action: "UPDATED",
      resourceType: "agent_reply_generation",
      resourceId: params.leaseId,
      metadata: {
        event: "AUTOMATION_REPLY_LLM_LEASE_RELEASED",
        conversationId: params.conversationId,
        agentId: params.agentId,
        reason: params.reason.slice(0, 120),
      },
    },
  });

  return true;
}

export async function releaseAutomationReplyGenerationInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    workspaceId: string;
    conversationId: string;
    leaseId: string;
    agentId: string;
    reason: string;
  },
) {
  return abandonGenerationLeaseInTransaction(tx, params);
}

export async function abandonAutomationReplyGeneration(params: {
  workspaceId: string;
  conversationId: string;
  leaseId: string;
  agentId: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    await acquireConversationReplyLock(
      tx,
      params.workspaceId,
      params.conversationId,
    );

    return abandonGenerationLeaseInTransaction(tx, params);
  });
}

export async function claimAutomationReplyGeneration(params: {
  workspaceId: string;
  conversationId: string;
  agentId: string;
  provider: string;
  model: string | null;
  rateLimitSeconds: number;
  now?: Date;
  budgetEnv?: AgentDailyBudgetEnv;
  leaseEnv?: GenerationLeaseEnv;
}): Promise<AutomationReplyGenerationClaimResult> {
  const now = params.now ?? new Date();
  const generationStaleCutoff = new Date(
    now.getTime() - getAutomationReplyGenerationStaleMs(params.leaseEnv),
  );
  const pendingStaleCutoff = new Date(
    now.getTime() - getAutomationReplyPendingStaleMs(),
  );
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
      generationLease,
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
          workspaceId: params.workspaceId,
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_GENERATING_ROLE,
          direction: "outbound",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
      tx.conversationMessage.findFirst({
        where: {
          workspaceId: params.workspaceId,
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_PENDING_ROLE,
          direction: "outbound",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
      tx.conversationMessage.findFirst({
        where: {
          workspaceId: params.workspaceId,
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_UNKNOWN_ROLE,
          direction: "outbound",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }),
      tx.conversationMessage.findFirst({
        where: {
          workspaceId: params.workspaceId,
          conversationId: conversation.id,
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
      if (pendingReply.createdAt > pendingStaleCutoff) {
        return { claimed: false, reason: "REPLY_IN_FLIGHT" };
      }

      const quarantined = await tx.conversationMessage.updateMany({
        where: {
          id: pendingReply.id,
          workspaceId: params.workspaceId,
          conversationId: conversation.id,
          role: AUTOMATION_REPLY_PENDING_ROLE,
          createdAt: { lte: pendingStaleCutoff },
        },
        data: {
          role: AUTOMATION_REPLY_UNKNOWN_ROLE,
          metadata: {
            automationReply: true,
            deliveryState: "UNKNOWN_PROVIDER_RESULT",
            reason: "STALE_AUTOMATION_REPLY_MARKER",
            previousMarkerCreatedAt: pendingReply.createdAt.toISOString(),
          } satisfies Prisma.InputJsonValue,
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

    if (generationLease) {
      if (generationLease.createdAt > generationStaleCutoff) {
        return { claimed: false, reason: "GENERATION_IN_FLIGHT" };
      }

      await abandonGenerationLeaseInTransaction(tx, {
        workspaceId: params.workspaceId,
        conversationId: conversation.id,
        leaseId: generationLease.id,
        agentId: params.agentId,
        reason: "STALE_LLM_GENERATION_LEASE",
        previousLeaseCreatedAt: generationLease.createdAt,
      });
    }

    if (recentReply) {
      return { claimed: false, reason: "RATE_LIMITED" };
    }

    const llmBudget = await reserveAgentLlmAttemptInTransaction(tx, {
      workspaceId: params.workspaceId,
      now,
      env: params.budgetEnv,
    });

    if (!llmBudget.reserved) {
      return {
        claimed: false,
        reason:
          llmBudget.reason === "WORKSPACE_NOT_FOUND"
            ? "WORKSPACE_DISABLED"
            : "DAILY_LLM_LIMIT_REACHED",
        budget: {
          usageDate: llmBudget.usageDate,
          limit: llmBudget.limit,
          usedBefore: llmBudget.usedBefore,
        },
      };
    }

    const lease = await tx.conversationMessage.create({
      data: {
        workspaceId: params.workspaceId,
        conversationId: conversation.id,
        role: AUTOMATION_REPLY_GENERATING_ROLE,
        direction: "outbound",
        content: "",
        metadata: generationMetadata({
          agentId: params.agentId,
          provider: params.provider,
          model: params.model,
          budgetDate: llmBudget.usageDate,
          budgetLimit: llmBudget.limit,
          budgetUsedAfter: llmBudget.usedAfter,
        }),
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        action: "UPDATED",
        resourceType: "agent_reply_generation",
        resourceId: lease.id,
        metadata: {
          event: "AUTOMATION_REPLY_LLM_CALL_STARTED",
          conversationId: conversation.id,
          agentId: params.agentId,
          provider: params.provider,
          model: params.model,
          dailyBudgetDate: llmBudget.usageDate,
          dailyLlmLimit: llmBudget.limit,
          dailyLlmUsedAfter: llmBudget.usedAfter,
        },
      },
    });

    return {
      claimed: true,
      leaseId: lease.id,
      budget: {
        usageDate: llmBudget.usageDate,
        limit: llmBudget.limit,
        usedAfter: llmBudget.usedAfter,
      },
    };
  });
}
