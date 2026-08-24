import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";

import {
  CLAIMED_NOT_SENT,
  PROVIDER_CALL_STARTED,
  ProviderSendError,
  UNKNOWN_PROVIDER_RESULT,
  campaignJobId,
  claimNextPendingMessage,
  getZonedDayRange,
  markProviderCallStarted,
  recoverGlobalStaleSendingMessages,
  recoverStaleSendingMessages,
} from "./campaign-worker-safety.mjs";

const prisma = new PrismaClient();
const QUEUE_NAME = "campaign-send";
const MAX_ATTEMPTS = Number(process.env.CAMPAIGN_MESSAGE_MAX_ATTEMPTS ?? 3);
const FALLBACK_POLL_MS = Number(process.env.WORKER_FALLBACK_POLL_MS ?? 5000);
const SCHEDULER_POLL_MS = Number(process.env.WORKER_SCHEDULER_POLL_MS ?? 15000);
const STALE_SENDING_MS = Number(
  process.env.WORKER_STALE_SENDING_SECONDS ?? 600,
) * 1000;
const STALE_SWEEP_INTERVAL_MS = Number(
  process.env.WORKER_STALE_SWEEP_INTERVAL_MS ?? 60000,
);
const WORKER_HEARTBEAT_INTERVAL_MS = Number(
  process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 30000,
);
const WORKER_HEARTBEAT_KEY =
  process.env.WORKER_HEARTBEAT_KEY ?? "wa-sender:worker:heartbeat";
const WORKER_HEARTBEAT_FILE =
  process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/wa-sender-worker-heartbeat.json";

let globalStaleSweepRunning = false;

function log(level, message, metadata = {}) {
  const payload = {
    level,
    message,
    service: "campaign-worker",
    timestamp: new Date().toISOString(),
    ...metadata,
  };
  console.log(JSON.stringify(payload));
}

function contactAuditMetadata(phone) {
  return {
    phoneLast4: phone.slice(-4),
    phoneHash: createHash("sha256").update(phone).digest("hex").slice(0, 16),
  };
}

async function writeWorkerHeartbeat(connection = null) {
  const payload = {
    service: "campaign-worker",
    timestamp: new Date().toISOString(),
  };

  if (connection) {
    try {
      const [pendingJobs, activeJobs] = await Promise.all([
        connection.llen(`bull:${QUEUE_NAME}:wait`).catch(() => null),
        connection.llen(`bull:${QUEUE_NAME}:active`).catch(() => null),
      ]);

      payload.pendingJobs = pendingJobs;
      payload.activeJobs = activeJobs;
      await connection.set(WORKER_HEARTBEAT_KEY, JSON.stringify(payload));
    } catch (error) {
      log("warn", "Failed to write worker heartbeat to Redis.", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  try {
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(WORKER_HEARTBEAT_FILE, JSON.stringify(payload)),
    );
  } catch (error) {
    log("warn", "Failed to write worker heartbeat file.", {
      error: error instanceof Error ? error.message : "Unknown error",
      path: WORKER_HEARTBEAT_FILE,
    });
  }
}

function isWorkerEnabled() {
  return process.env.WORKER_ENABLED !== "false";
}

function isDue(date) {
  return !date || new Date(date).getTime() <= Date.now();
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getZonedTimeInMinutes(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: timezone,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour * 60 + minute;
}

function isWithinActiveWindow(campaign) {
  if (!campaign.activeWindowStart || !campaign.activeWindowEnd) {
    return true;
  }

  const current = getZonedTimeInMinutes(new Date(), campaign.timezone);
  const start = timeToMinutes(campaign.activeWindowStart);
  const end = timeToMinutes(campaign.activeWindowEnd);

  if (start < end) {
    return current >= start && current <= end;
  }

  return current >= start || current <= end;
}

function canSendWithConsent(consentStatus) {
  if (consentStatus === "EXPLICITLY_GRANTED") {
    return true;
  }

  return (
    process.env.REAL_SENDING_ENABLED !== "true" &&
    consentStatus === "NOT_REQUIRED_FOR_MOCK"
  );
}

function getConsentBlockReason(consentStatus) {
  if (consentStatus === "EXPLICITLY_DENIED") {
    return {
      code: "CONSENT_DENIED",
      message: "El destinatario tiene opt-out registrado.",
      event: "MESSAGE_SKIPPED_CONSENT_DENIED",
    };
  }

  if (consentStatus === "NOT_REQUIRED_FOR_MOCK") {
    return {
      code: "CONSENT_MOCK_ONLY",
      message:
        "El consentimiento marcado solo para mock no permite envio real.",
      event: "MESSAGE_SKIPPED_CONSENT_MOCK_ONLY",
    };
  }

  return {
    code: "CONSENT_UNCONFIRMED",
    message: "El destinatario no tiene consentimiento explicito confirmado.",
    event: "MESSAGE_SKIPPED_CONSENT_UNCONFIRMED",
  };
}

async function writeEvent(campaign, type, payload = {}, messageId = null) {
  await prisma.campaignEvent.create({
    data: {
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      messageId,
      type,
      payload,
    },
  });
}

async function writeEventAtMostOncePer(campaign, type, windowMs, payload = {}) {
  const since = new Date(Date.now() - windowMs);
  const recent = await prisma.campaignEvent.findFirst({
    where: {
      campaignId: campaign.id,
      workspaceId: campaign.workspaceId,
      type,
      createdAt: { gte: since },
    },
    select: { id: true },
  });

  if (!recent) {
    await writeEvent(campaign, type, payload);
  }
}

async function syncCounters(campaignId) {
  const [totalCount, pendingCount, sentCount, failedCount] = await Promise.all([
    prisma.campaignMessage.count({ where: { campaignId } }),
    prisma.campaignMessage.count({
      where: {
        campaignId,
        status: { in: ["PENDING", "QUEUED", "SENDING"] },
      },
    }),
    prisma.campaignMessage.count({ where: { campaignId, status: "SENT" } }),
    prisma.campaignMessage.count({ where: { campaignId, status: "FAILED" } }),
  ]);

  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      totalCount,
      pendingCount,
      sentCount,
      failedCount,
    },
  });
}

async function enqueueCampaign(queue, campaignId, delayMs = 0) {
  if (!queue) {
    return { queued: false, reason: "NO_QUEUE" };
  }

  const jobId = campaignJobId(campaignId);
  const existing = await queue.getJob(jobId);

  if (existing) {
    return { queued: true, deduplicated: true, jobId };
  }

  await queue.add(
    "process-campaign",
    { campaignId },
    {
      attempts: 1,
      delay: Math.max(0, delayMs),
      jobId,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  return { queued: true, deduplicated: false, jobId };
}

async function sendTextViaEvolution({ instanceName, phone, text }) {
  const mockEnabled =
    process.env.EVOLUTION_MOCK === "true" ||
    process.env.MOCK_WHATSAPP_ENABLED === "true" ||
    process.env.REAL_SENDING_ENABLED !== "true";

  if (mockEnabled) {
    return {
      providerMessageId: `mock_msg_${instanceName}_${Date.now()}`,
      status: "mocked",
      mocked: true,
    };
  }

  const baseUrl = (process.env.EVOLUTION_API_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY ?? "";

  if (!baseUrl || !apiKey) {
    throw new ProviderSendError("Evolution API is not configured.", {
      code: "PROVIDER_CONFIG_ERROR",
      outcome: "NOT_SENT",
      fatalCampaign: true,
    });
  }

  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new ProviderSendError("Evolution API base URL is invalid.", {
      code: "PROVIDER_CONFIG_ERROR",
      outcome: "NOT_SENT",
      fatalCampaign: true,
    });
  }

  if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
    throw new ProviderSendError("Evolution API base URL must use HTTP or HTTPS.", {
      code: "PROVIDER_CONFIG_ERROR",
      outcome: "NOT_SENT",
      fatalCampaign: true,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.EVOLUTION_TIMEOUT_MS ?? 8000),
  );

  try {
    let response;
    try {
      response = await fetch(
        `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify({
            number: phone.replace(/[^\d]/g, ""),
            text,
            options: {
              delay: 0,
              linkPreview: false,
            },
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      throw new ProviderSendError(
        error instanceof Error
          ? `Evolution request ended without a trustworthy result: ${error.message}`
          : "Evolution request ended without a trustworthy result.",
        {
          code: UNKNOWN_PROVIDER_RESULT,
          outcome: "UNKNOWN",
        },
      );
    }

    const raw = await response.text();

    if (!response.ok) {
      if (response.status === 429) {
        throw new ProviderSendError("Evolution API rate limited the request.", {
          code: "PROVIDER_RATE_LIMITED",
          outcome: "NOT_SENT",
          retryable: true,
        });
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        throw new ProviderSendError(
          `Evolution API rejected the request with ${response.status}.`,
          {
            code: "PROVIDER_REJECTED",
            outcome: "NOT_SENT",
          },
        );
      }

      throw new ProviderSendError(
        `Evolution API returned ${response.status}; delivery result is uncertain.`,
        {
          code: UNKNOWN_PROVIDER_RESULT,
          outcome: "UNKNOWN",
        },
      );
    }

    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        throw new ProviderSendError(
          "Evolution accepted the request but returned an unreadable response.",
          {
            code: UNKNOWN_PROVIDER_RESULT,
            outcome: "UNKNOWN",
          },
        );
      }
    }

    return {
      providerMessageId: data.key?.id ?? data.messageId ?? data.id ?? null,
      status: data.status ?? "sent",
      mocked: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function countMessagesSentToday(workspaceId, timezone) {
  const { start, end } = getZonedDayRange(new Date(), timezone);

  return prisma.campaignMessage.count({
    where: {
      workspaceId,
      status: "SENT",
      sentAt: {
        gte: start,
        lt: end,
      },
    },
  });
}

async function getDailyLimit(workspaceId) {
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId },
    select: {
      plan: {
        select: {
          dailyMessageLimit: true,
        },
      },
    },
  });

  return subscription?.plan.dailyMessageLimit ?? 50;
}

async function finishCampaignIfNoActiveMessages(campaign) {
  const [activeCount, failedCount] = await Promise.all([
    prisma.campaignMessage.count({
      where: {
        campaignId: campaign.id,
        status: { in: ["PENDING", "QUEUED", "SENDING"] },
      },
    }),
    prisma.campaignMessage.count({
      where: {
        campaignId: campaign.id,
        status: "FAILED",
      },
    }),
  ]);

  if (activeCount > 0) {
    return false;
  }

  const finalStatus = failedCount > 0 ? "FAILED" : "COMPLETED";
  const transitioned = await prisma.campaign.updateMany({
    where: {
      id: campaign.id,
      status: "RUNNING",
    },
    data: {
      status: finalStatus,
    },
  });

  if (transitioned.count !== 1) {
    return false;
  }

  await writeEvent(
    campaign,
    failedCount > 0 ? "CAMPAIGN_FINISHED_WITH_ERRORS" : "CAMPAIGN_COMPLETED",
    failedCount > 0 ? { failedCount } : {},
  );
  await syncCounters(campaign.id);

  return true;
}

async function failCampaignForUnknownResult(campaign, messageId, reason) {
  await prisma.campaign.updateMany({
    where: {
      id: campaign.id,
      status: "RUNNING",
    },
    data: {
      status: "FAILED",
    },
  });
  await writeEvent(
    campaign,
    "CAMPAIGN_FAILED_UNKNOWN_PROVIDER_RESULT",
    { reason },
    messageId,
  );
  await syncCounters(campaign.id);
}

async function recoverStaleMessages(campaign) {
  const recovered = await recoverStaleSendingMessages(prisma, campaign, {
    staleAfterMs: STALE_SENDING_MS,
  });

  let hasUnknown = false;
  for (const item of recovered) {
    if (item.action === "RESET_TO_PENDING") {
      await writeEvent(
        campaign,
        "MESSAGE_STALE_CLAIM_RECOVERED",
        { reason: CLAIMED_NOT_SENT },
        item.id,
      );
      continue;
    }

    hasUnknown = true;
    await writeEvent(
      campaign,
      "MESSAGE_STALE_PROVIDER_RESULT_UNKNOWN",
      { reason: UNKNOWN_PROVIDER_RESULT },
      item.id,
    );
  }

  if (hasUnknown) {
    await prisma.campaign.updateMany({
      where: { id: campaign.id, status: "RUNNING" },
      data: { status: "FAILED" },
    });
    await writeEvent(campaign, "CAMPAIGN_FAILED_UNKNOWN_PROVIDER_RESULT", {
      reason: "STALE_SENDING_AFTER_PROVIDER_CALL",
    });
  }

  if (recovered.length > 0) {
    await syncCounters(campaign.id);
  }

  return { recovered, hasUnknown };
}

async function runGlobalStaleSweep() {
  if (globalStaleSweepRunning) {
    return { skipped: true, reason: "SWEEP_ALREADY_RUNNING" };
  }

  globalStaleSweepRunning = true;

  try {
    const result = await recoverGlobalStaleSendingMessages(prisma, {
      staleAfterMs: STALE_SENDING_MS,
    });
    const affectedCampaignIds = [
      ...new Set(result.recovered.map((item) => item.campaignId)),
    ];

    await Promise.all(
      affectedCampaignIds.map((campaignId) => syncCounters(campaignId)),
    );

    if (result.recovered.length > 0) {
      log("warn", "Global stale sending sweep recovered messages.", {
        cutoff: result.cutoff.toISOString(),
        scannedCount: result.scannedCount,
        recoveredCount: result.recovered.length,
        unknownCount: result.recovered.filter(
          (item) => item.action === "QUARANTINED_UNKNOWN",
        ).length,
        failedRunningCampaignCount: result.recovered.filter(
          (item) => item.campaignFailed === true,
        ).length,
        affectedCampaignCount: affectedCampaignIds.length,
      });
    }

    return result;
  } finally {
    globalStaleSweepRunning = false;
  }
}

function scheduleGlobalStaleSweep() {
  setInterval(() => {
    runGlobalStaleSweep().catch((error) => {
      log("error", "Global stale sending sweep failed.", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  }, Math.max(10000, STALE_SWEEP_INTERVAL_MS));
}

async function processCampaign(campaignId) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      instance: true,
    },
  });

  if (!campaign) {
    return;
  }

  if (campaign.status === "SCHEDULED" && isDue(campaign.scheduledStartAt)) {
    const transitioned = await prisma.campaign.updateMany({
      where: {
        id: campaign.id,
        status: "SCHEDULED",
      },
      data: { status: "RUNNING" },
    });

    if (transitioned.count !== 1) {
      return;
    }

    campaign.status = "RUNNING";
    await writeEvent(campaign, "CAMPAIGN_RUNNING");
  }

  if (campaign.status !== "RUNNING") {
    return;
  }

  const recovery = await recoverStaleMessages(campaign);
  if (recovery.hasUnknown) {
    return;
  }

  if (!campaign.instance || campaign.instance.status !== "ACTIVE") {
    await prisma.campaign.updateMany({
      where: { id: campaign.id, status: "RUNNING" },
      data: { status: "FAILED" },
    });
    await writeEvent(campaign, "CAMPAIGN_FAILED", {
      reason: "INSTANCE_NOT_ACTIVE",
    });
    return;
  }

  if (!campaign.instance.providerInstanceId) {
    await prisma.campaign.updateMany({
      where: { id: campaign.id, status: "RUNNING" },
      data: { status: "FAILED" },
    });
    await writeEvent(campaign, "CAMPAIGN_FAILED", {
      reason: "INSTANCE_PROVIDER_ID_MISSING",
    });
    return;
  }

  try {
    if (!isWithinActiveWindow(campaign)) {
      await writeEventAtMostOncePer(
        campaign,
        "CAMPAIGN_OUTSIDE_ACTIVE_WINDOW",
        15 * 60_000,
        { timezone: campaign.timezone },
      );
      return;
    }
  } catch (error) {
    await prisma.campaign.updateMany({
      where: { id: campaign.id, status: "RUNNING" },
      data: { status: "FAILED" },
    });
    await writeEvent(campaign, "CAMPAIGN_FAILED", {
      reason: "INVALID_TIMEZONE",
      timezone: campaign.timezone,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return;
  }

  const dailyLimit = await getDailyLimit(campaign.workspaceId);
  const sentToday = await countMessagesSentToday(
    campaign.workspaceId,
    campaign.timezone,
  );

  if (sentToday >= dailyLimit) {
    await writeEventAtMostOncePer(
      campaign,
      "CAMPAIGN_DAILY_LIMIT_REACHED",
      15 * 60_000,
      { dailyLimit, timezone: campaign.timezone },
    );
    return;
  }

  const lastSentMessage = await prisma.campaignMessage.findFirst({
    where: {
      campaignId: campaign.id,
      status: "SENT",
      sentAt: { not: null },
    },
    orderBy: {
      sentAt: "desc",
    },
    select: {
      sentAt: true,
    },
  });

  if (lastSentMessage?.sentAt) {
    const nextAllowedAt =
      lastSentMessage.sentAt.getTime() + campaign.delaySeconds * 1000;

    if (nextAllowedAt > Date.now()) {
      return;
    }
  }

  const message = await claimNextPendingMessage(prisma, campaign);

  if (!message) {
    await finishCampaignIfNoActiveMessages(campaign);
    return;
  }

  if (!canSendWithConsent(message.consentStatus)) {
    const reason = getConsentBlockReason(message.consentStatus);
    const skipped = await prisma.campaignMessage.updateMany({
      where: {
        id: message.id,
        status: "SENDING",
        lastErrorCode: CLAIMED_NOT_SENT,
      },
      data: {
        status: "SKIPPED",
        lastErrorCode: reason.code,
        lastErrorMessage: reason.message,
      },
    });

    if (skipped.count === 1) {
      await writeEvent(
        campaign,
        reason.event,
        {
          ...contactAuditMetadata(message.recipientPhone),
          consentStatus: message.consentStatus,
          realSendingEnabled: process.env.REAL_SENDING_ENABLED === "true",
        },
        message.id,
      );
    }

    await syncCounters(campaign.id);
    return;
  }

  const providerCallMarked = await markProviderCallStarted(prisma, message);
  if (!providerCallMarked) {
    return;
  }

  const attemptNumber = message.attemptCount + 1;
  await writeEvent(
    campaign,
    "MESSAGE_SENDING",
    { attemptCount: attemptNumber },
    message.id,
  );

  try {
    const result = await sendTextViaEvolution({
      instanceName: campaign.instance.providerInstanceId,
      phone: message.recipientPhone,
      text: message.renderedMessage ?? message.messageTemplate,
    });

    const saved = await prisma.campaignMessage.updateMany({
      where: {
        id: message.id,
        status: "SENDING",
        lastErrorCode: PROVIDER_CALL_STARTED,
      },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });

    if (saved.count !== 1) {
      await prisma.campaignMessage.update({
        where: { id: message.id },
        data: {
          providerMessageId: result.providerMessageId,
          lastErrorCode: "PROVIDER_ACCEPTED_DB_STATE_CONFLICT",
          lastErrorMessage:
            "El proveedor confirmo el envio, pero el estado local habia cambiado. Requiere revision manual.",
        },
      });
      await failCampaignForUnknownResult(
        campaign,
        message.id,
        "PROVIDER_ACCEPTED_DB_STATE_CONFLICT",
      );
      return;
    }

    await writeEvent(
      campaign,
      "MESSAGE_SENT",
      {
        mocked: result.mocked,
        providerStatus: result.status,
      },
      message.id,
    );
  } catch (error) {
    const providerError =
      error instanceof ProviderSendError
        ? error
        : new ProviderSendError(
            error instanceof Error ? error.message : "Unknown provider error",
            {
              code: UNKNOWN_PROVIDER_RESULT,
              outcome: "UNKNOWN",
            },
          );

    if (providerError.outcome === "UNKNOWN") {
      await prisma.campaignMessage.updateMany({
        where: {
          id: message.id,
          status: "SENDING",
        },
        data: {
          status: "FAILED",
          lastErrorCode: UNKNOWN_PROVIDER_RESULT,
          lastErrorMessage: providerError.message,
        },
      });
      await writeEvent(
        campaign,
        "MESSAGE_PROVIDER_RESULT_UNKNOWN",
        {
          attemptCount: attemptNumber,
          code: providerError.code,
        },
        message.id,
      );
      await failCampaignForUnknownResult(
        campaign,
        message.id,
        providerError.code,
      );
      return;
    }

    const shouldRetry = providerError.retryable && attemptNumber < MAX_ATTEMPTS;
    await prisma.campaignMessage.updateMany({
      where: {
        id: message.id,
        status: "SENDING",
        lastErrorCode: PROVIDER_CALL_STARTED,
      },
      data: {
        status: shouldRetry ? "PENDING" : "FAILED",
        lastErrorCode: shouldRetry
          ? "SEND_RETRYABLE"
          : providerError.retryable
            ? "SEND_RETRYABLE_EXHAUSTED"
            : providerError.code,
        lastErrorMessage: providerError.message,
      },
    });
    await writeEvent(
      campaign,
      shouldRetry ? "MESSAGE_RETRY_SCHEDULED" : "MESSAGE_FAILED",
      {
        attemptCount: attemptNumber,
        code: providerError.code,
        retryable: providerError.retryable,
      },
      message.id,
    );

    if (providerError.fatalCampaign) {
      await prisma.campaign.updateMany({
        where: { id: campaign.id, status: "RUNNING" },
        data: { status: "FAILED" },
      });
      await writeEvent(campaign, "CAMPAIGN_FAILED", {
        reason: providerError.code,
      });
    }
  }

  await syncCounters(campaign.id);
}

async function enqueueDueCampaigns(queue) {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: { in: ["RUNNING", "SCHEDULED"] },
    },
    select: {
      id: true,
      scheduledStartAt: true,
      status: true,
    },
  });

  for (const campaign of campaigns) {
    if (campaign.status === "RUNNING" || isDue(campaign.scheduledStartAt)) {
      await enqueueCampaign(queue, campaign.id, 0);
    }
  }
}

async function runFallbackLoop() {
  log("warn", "Redis is not configured. Using development polling fallback.");
  await writeWorkerHeartbeat(null);
  scheduleGlobalStaleSweep();

  setInterval(async () => {
    try {
      const campaigns = await prisma.campaign.findMany({
        where: {
          status: { in: ["RUNNING", "SCHEDULED"] },
        },
        select: {
          id: true,
          scheduledStartAt: true,
          status: true,
        },
      });

      for (const campaign of campaigns) {
        if (campaign.status === "RUNNING" || isDue(campaign.scheduledStartAt)) {
          await processCampaign(campaign.id);
        }
      }
      await writeWorkerHeartbeat(null);
    } catch (error) {
      log("error", "Fallback polling failed.", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, FALLBACK_POLL_MS);
}

async function main() {
  if (!isWorkerEnabled()) {
    log("info", "Worker is disabled by WORKER_ENABLED=false.");
    return;
  }

  await runGlobalStaleSweep();

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    await runFallbackLoop();
    return;
  }

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(QUEUE_NAME, { connection });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await processCampaign(job.data.campaignId);
    },
    {
      connection,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 1000,
      },
    },
  );

  worker.on("failed", (job, error) => {
    log("error", "Campaign queue job failed.", {
      jobId: job?.id,
      error: error.message,
    });
  });

  worker.on("completed", (job) => {
    log("info", "Campaign queue job completed.", {
      jobId: job.id,
    });
  });

  await enqueueDueCampaigns(queue);
  await writeWorkerHeartbeat(connection);
  scheduleGlobalStaleSweep();
  setInterval(() => {
    enqueueDueCampaigns(queue).catch((error) => {
      log("error", "Campaign scheduler failed.", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  }, SCHEDULER_POLL_MS);
  setInterval(() => {
    writeWorkerHeartbeat(connection).catch((error) => {
      log("warn", "Worker heartbeat loop failed.", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  }, WORKER_HEARTBEAT_INTERVAL_MS);

  log("info", "Campaign worker started.", {
    queue: QUEUE_NAME,
  });
}

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

main().catch(async (error) => {
  log("error", "Campaign worker crashed.", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
  await prisma.$disconnect();
  process.exit(1);
});
