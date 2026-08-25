import type { Prisma } from "@prisma/client";

type RetentionEnv = {
  EXTRACTED_NUMBER_RETENTION_DAYS?: string;
  CONVERSATION_RETENTION_DAYS?: string;
  WEBHOOK_EVENT_RETENTION_DAYS?: string;
  PLAYGROUND_RETENTION_DAYS?: string;
  AUDIT_LOG_RETENTION_DAYS?: string;
};

export type PrivacyRetentionPolicy = {
  extractedNumberDays: number;
  conversationDays: number;
  webhookEventDays: number;
  playgroundDays: number;
  auditLogDays: number;
};

export const RETENTION_HOLD_ROLES = [
  "assistant_generating",
  "assistant_pending",
  "assistant_unknown",
] as const;

const DEFAULT_RETENTION_POLICY: PrivacyRetentionPolicy = {
  extractedNumberDays: 30,
  conversationDays: 90,
  webhookEventDays: 30,
  playgroundDays: 30,
  auditLogDays: 365,
};

function currentRetentionEnv(): RetentionEnv {
  return {
    EXTRACTED_NUMBER_RETENTION_DAYS:
      process.env.EXTRACTED_NUMBER_RETENTION_DAYS,
    CONVERSATION_RETENTION_DAYS: process.env.CONVERSATION_RETENTION_DAYS,
    WEBHOOK_EVENT_RETENTION_DAYS: process.env.WEBHOOK_EVENT_RETENTION_DAYS,
    PLAYGROUND_RETENTION_DAYS: process.env.PLAYGROUND_RETENTION_DAYS,
    AUDIT_LOG_RETENTION_DAYS: process.env.AUDIT_LOG_RETENTION_DAYS,
  };
}

function positiveDays(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPrivacyRetentionPolicy(
  env: RetentionEnv = currentRetentionEnv(),
): PrivacyRetentionPolicy {
  return {
    extractedNumberDays: positiveDays(
      env.EXTRACTED_NUMBER_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.extractedNumberDays,
    ),
    conversationDays: positiveDays(
      env.CONVERSATION_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.conversationDays,
    ),
    webhookEventDays: positiveDays(
      env.WEBHOOK_EVENT_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.webhookEventDays,
    ),
    playgroundDays: positiveDays(
      env.PLAYGROUND_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.playgroundDays,
    ),
    auditLogDays: positiveDays(
      env.AUDIT_LOG_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.auditLogDays,
    ),
  };
}

export function getExtractedNumberRetentionDays(
  env: RetentionEnv = currentRetentionEnv(),
) {
  return getPrivacyRetentionPolicy(env).extractedNumberDays;
}

export function getRetentionCutoff(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export async function purgeExpiredExtractedNumbers(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  {
    now = new Date(),
    retentionDays = getExtractedNumberRetentionDays(),
  }: {
    now?: Date;
    retentionDays?: number;
  } = {},
) {
  const cutoff = getRetentionCutoff(now, retentionDays);
  const deleted = await tx.extractedNumber.deleteMany({
    where: {
      workspaceId,
      extractedAt: { lt: cutoff },
    },
  });

  return {
    cutoff,
    deletedCount: deleted.count,
    retentionDays,
  };
}

export async function purgeExpiredPrivacyData(
  tx: Prisma.TransactionClient,
  {
    now = new Date(),
    policy = getPrivacyRetentionPolicy(),
  }: {
    now?: Date;
    policy?: PrivacyRetentionPolicy;
  } = {},
) {
  const cutoffs = {
    extractedNumbers: getRetentionCutoff(now, policy.extractedNumberDays),
    conversations: getRetentionCutoff(now, policy.conversationDays),
    webhookEvents: getRetentionCutoff(now, policy.webhookEventDays),
    playground: getRetentionCutoff(now, policy.playgroundDays),
    auditLogs: getRetentionCutoff(now, policy.auditLogDays),
  };

  const extractedNumbers = await tx.extractedNumber.deleteMany({
    where: { extractedAt: { lt: cutoffs.extractedNumbers } },
  });

  const conversationMessages = await tx.conversationMessage.deleteMany({
    where: {
      createdAt: { lt: cutoffs.conversations },
      role: { notIn: [...RETENTION_HOLD_ROLES] },
      conversation: { status: "OPEN" },
    },
  });

  const conversations = await tx.conversation.deleteMany({
    where: {
      status: "OPEN",
      messages: { none: {} },
      OR: [
        { lastMessageAt: { lt: cutoffs.conversations } },
        {
          lastMessageAt: null,
          createdAt: { lt: cutoffs.conversations },
        },
      ],
    },
  });

  const webhookEvents = await tx.webhookEvent.deleteMany({
    where: {
      status: "PROCESSED",
      createdAt: { lt: cutoffs.webhookEvents },
    },
  });

  const playgroundSessions = await tx.playgroundSession.deleteMany({
    where: { updatedAt: { lt: cutoffs.playground } },
  });

  const auditLogs = await tx.auditLog.deleteMany({
    where: { createdAt: { lt: cutoffs.auditLogs } },
  });

  return {
    policy,
    cutoffs,
    deleted: {
      extractedNumbers: extractedNumbers.count,
      conversationMessages: conversationMessages.count,
      conversations: conversations.count,
      webhookEvents: webhookEvents.count,
      playgroundSessions: playgroundSessions.count,
      auditLogs: auditLogs.count,
    },
  };
}
