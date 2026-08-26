import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

export const RETENTION_LOCK_KEY = "wa-sender:privacy-retention:v1";
export const RETENTION_HOLD_ROLES = [
  "assistant_generating",
  "assistant_pending",
  "assistant_unknown",
];

export const DEFAULT_RETENTION_POLICY = Object.freeze({
  extractedNumberDays: 30,
  conversationDays: 90,
  webhookEventDays: 30,
  playgroundDays: 30,
  auditLogDays: 365,
});

const DEFAULT_INTERVAL_SECONDS = 86_400;
const MIN_INTERVAL_SECONDS = 300;
const MAX_INTERVAL_SECONDS = 604_800;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPrivacyRetentionPolicy(env = process.env) {
  return {
    extractedNumberDays: positiveInteger(
      env.EXTRACTED_NUMBER_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.extractedNumberDays,
    ),
    conversationDays: positiveInteger(
      env.CONVERSATION_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.conversationDays,
    ),
    webhookEventDays: positiveInteger(
      env.WEBHOOK_EVENT_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.webhookEventDays,
    ),
    playgroundDays: positiveInteger(
      env.PLAYGROUND_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.playgroundDays,
    ),
    auditLogDays: positiveInteger(
      env.AUDIT_LOG_RETENTION_DAYS,
      DEFAULT_RETENTION_POLICY.auditLogDays,
    ),
  };
}

export function getRetentionIntervalMs(env = process.env) {
  const seconds = positiveInteger(
    env.PRIVACY_RETENTION_INTERVAL_SECONDS,
    DEFAULT_INTERVAL_SECONDS,
  );
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, seconds)) * 1000;
}

export function getRetentionCutoff(now, retentionDays) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export function isPrivacyRetentionEnabled(env = process.env) {
  return env.PRIVACY_RETENTION_ENABLED === "true";
}

export function shouldRunRetentionOnStart(env = process.env) {
  return env.PRIVACY_RETENTION_RUN_ON_START !== "false";
}

function cutoffsFor(now, policy) {
  return {
    extractedNumbers: getRetentionCutoff(now, policy.extractedNumberDays),
    conversations: getRetentionCutoff(now, policy.conversationDays),
    webhookEvents: getRetentionCutoff(now, policy.webhookEventDays),
    playground: getRetentionCutoff(now, policy.playgroundDays),
    auditLogs: getRetentionCutoff(now, policy.auditLogDays),
  };
}

export async function runPrivacyRetentionSweep(
  prisma,
  { now = new Date(), policy = getPrivacyRetentionPolicy() } = {},
) {
  return prisma.$transaction(async (tx) => {
    const lockRows = await tx.$queryRawUnsafe(
      "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired",
      RETENTION_LOCK_KEY,
    );
    if (!lockRows?.[0]?.acquired) {
      return { acquired: false, policy, cutoffs: cutoffsFor(now, policy), deleted: null };
    }

    const cutoffs = cutoffsFor(now, policy);
    const extractedNumbers = await tx.extractedNumber.deleteMany({
      where: { extractedAt: { lt: cutoffs.extractedNumbers } },
    });
    const conversationMessages = await tx.conversationMessage.deleteMany({
      where: {
        createdAt: { lt: cutoffs.conversations },
        role: { notIn: RETENTION_HOLD_ROLES },
        conversation: { status: "OPEN" },
      },
    });
    const conversations = await tx.conversation.deleteMany({
      where: {
        status: "OPEN",
        messages: { none: {} },
        OR: [
          { lastMessageAt: { lt: cutoffs.conversations } },
          { lastMessageAt: null, createdAt: { lt: cutoffs.conversations } },
        ],
      },
    });
    const webhookEvents = await tx.webhookEvent.deleteMany({
      where: { status: "PROCESSED", createdAt: { lt: cutoffs.webhookEvents } },
    });
    const playgroundSessions = await tx.playgroundSession.deleteMany({
      where: { updatedAt: { lt: cutoffs.playground } },
    });
    const auditLogs = await tx.auditLog.deleteMany({
      where: { createdAt: { lt: cutoffs.auditLogs } },
    });

    return {
      acquired: true,
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
  });
}

function log(level, message, metadata = {}) {
  console.log(
    JSON.stringify({
      level,
      message,
      service: "privacy-retention",
      timestamp: new Date().toISOString(),
      ...metadata,
    }),
  );
}

async function writeHeartbeat(payload, env = process.env) {
  const path =
    env.PRIVACY_RETENTION_HEARTBEAT_FILE ??
    "/tmp/wa-sender-privacy-retention-heartbeat.json";
  await writeFile(path, JSON.stringify(payload));
}

export async function runPrivacyRetentionLoop({
  prisma = new PrismaClient(),
  env = process.env,
} = {}) {
  const intervalMs = getRetentionIntervalMs(env);
  const enabled = isPrivacyRetentionEnabled(env);
  let stopping = false;
  let wakeSleep = null;

  const sleepOrStop = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        wakeSleep = null;
        resolve();
      }, ms);
      wakeSleep = () => {
        clearTimeout(timer);
        wakeSleep = null;
        resolve();
      };
    });

  const stop = () => {
    stopping = true;
    wakeSleep?.();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  try {
    if (!enabled) {
      log("info", "Privacy retention runner is disabled by configuration.");
      while (!stopping) {
        await writeHeartbeat(
          {
            service: "privacy-retention",
            status: "disabled",
            timestamp: new Date().toISOString(),
          },
          env,
        );
        if (!stopping) {
          await sleepOrStop(Math.min(intervalMs, 60_000));
        }
      }
      return;
    }

    let runNow = shouldRunRetentionOnStart(env);
    while (!stopping) {
      if (!runNow) {
        await sleepOrStop(intervalMs);
        if (stopping) break;
      }
      runNow = false;

      try {
        const result = await runPrivacyRetentionSweep(prisma);
        const status = result.acquired ? "success" : "lock_skipped";
        log("info", "Privacy retention sweep completed.", {
          status,
          deleted: result.deleted,
          policy: result.policy,
        });
        await writeHeartbeat(
          {
            service: "privacy-retention",
            status,
            timestamp: new Date().toISOString(),
            deleted: result.deleted,
          },
          env,
        );
      } catch (error) {
        log("error", "Privacy retention cycle failed.", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      if (!stopping) {
        await sleepOrStop(intervalMs);
      }
    }
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    wakeSleep?.();
    await prisma.$disconnect();
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runPrivacyRetentionLoop().catch((error) => {
    log("error", "Privacy retention runner terminated unexpectedly.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    process.exitCode = 1;
  });
}
