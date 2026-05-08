import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const QUEUE_NAME = "campaign-send";
const MAX_ATTEMPTS = Number(process.env.CAMPAIGN_MESSAGE_MAX_ATTEMPTS ?? 3);
const FALLBACK_POLL_MS = Number(process.env.WORKER_FALLBACK_POLL_MS ?? 5000);
const SCHEDULER_POLL_MS = Number(process.env.WORKER_SCHEDULER_POLL_MS ?? 15000);
const OUT_OF_WINDOW_REQUEUE_MS = 60_000;
const DAILY_LIMIT_REQUEUE_MS = 15 * 60_000;
const WORKER_HEARTBEAT_INTERVAL_MS = Number(
  process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 30000,
);
const WORKER_HEARTBEAT_KEY =
  process.env.WORKER_HEARTBEAT_KEY ?? "wa-sender:worker:heartbeat";
const WORKER_HEARTBEAT_FILE =
  process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/wa-sender-worker-heartbeat.json";

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
    return;
  }

  await queue.add(
    "send-next-message",
    { campaignId },
    {
      attempts: 1,
      delay: Math.max(0, delayMs),
      jobId: `campaign:${campaignId}:${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
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
    throw new Error("Evolution API is not configured.");
  }

  const parsedBaseUrl = new URL(baseUrl);

  if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
    throw new Error("Evolution API base URL must use HTTP or HTTPS.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.EVOLUTION_TIMEOUT_MS ?? 8000),
  );

  try {
    const response = await fetch(
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

    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!response.ok) {
      throw new Error(`Evolution API returned ${response.status}.`);
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

async function countMessagesSentToday(workspaceId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return prisma.campaignMessage.count({
    where: {
      workspaceId,
      status: "SENT",
      sentAt: { gte: start },
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

async function completeIfNoPending(campaign) {
  const pending = await prisma.campaignMessage.count({
    where: {
      campaignId: campaign.id,
      status: "PENDING",
    },
  });

  if (pending > 0) {
    return false;
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "COMPLETED" },
  });
  await writeEvent(campaign, "CAMPAIGN_COMPLETED");
  await syncCounters(campaign.id);

  return true;
}

async function processCampaign(campaignId, queue = null) {
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
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "RUNNING" },
    });
    campaign.status = "RUNNING";
    await writeEvent(campaign, "CAMPAIGN_RUNNING");
  }

  if (campaign.status !== "RUNNING") {
    return;
  }

  if (!campaign.instance || campaign.instance.status !== "ACTIVE") {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "FAILED" },
    });
    await writeEvent(campaign, "CAMPAIGN_FAILED", {
      reason: "INSTANCE_NOT_ACTIVE",
    });
    return;
  }

  if (!campaign.instance.providerInstanceId) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "FAILED" },
    });
    await writeEvent(campaign, "CAMPAIGN_FAILED", {
      reason: "INSTANCE_PROVIDER_ID_MISSING",
    });
    return;
  }

  try {
    if (!isWithinActiveWindow(campaign)) {
      await writeEvent(campaign, "CAMPAIGN_OUTSIDE_ACTIVE_WINDOW", {
        timezone: campaign.timezone,
      });
      await enqueueCampaign(queue, campaign.id, OUT_OF_WINDOW_REQUEUE_MS);
      return;
    }
  } catch (error) {
    await prisma.campaign.update({
      where: { id: campaign.id },
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
  const sentToday = await countMessagesSentToday(campaign.workspaceId);

  if (sentToday >= dailyLimit) {
    await writeEvent(campaign, "CAMPAIGN_DAILY_LIMIT_REACHED", {
      dailyLimit,
    });
    await enqueueCampaign(queue, campaign.id, DAILY_LIMIT_REQUEUE_MS);
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
    const waitMs = nextAllowedAt - Date.now();

    if (waitMs > 0) {
      await enqueueCampaign(queue, campaign.id, waitMs);
      return;
    }
  }

  const message = await prisma.campaignMessage.findFirst({
    where: {
      campaignId: campaign.id,
      workspaceId: campaign.workspaceId,
      status: "PENDING",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!message) {
    await completeIfNoPending(campaign);
    return;
  }

  if (message.consentStatus === "EXPLICITLY_DENIED") {
    await prisma.campaignMessage.update({
      where: { id: message.id },
      data: {
        status: "SKIPPED",
        lastErrorCode: "CONSENT_DENIED",
        lastErrorMessage: "El destinatario tiene opt-out registrado.",
      },
    });
    await writeEvent(
      campaign,
      "MESSAGE_SKIPPED_CONSENT_DENIED",
      contactAuditMetadata(message.recipientPhone),
      message.id,
    );
    await syncCounters(campaign.id);
    await enqueueCampaign(queue, campaign.id, 0);
    return;
  }

  await prisma.campaignMessage.update({
    where: { id: message.id },
    data: {
      status: "SENDING",
      attemptCount: { increment: 1 },
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  await writeEvent(campaign, "MESSAGE_SENDING", {}, message.id);

  try {
    const result = await sendTextViaEvolution({
      instanceName: campaign.instance.providerInstanceId,
      phone: message.recipientPhone,
      text: message.renderedMessage ?? message.messageTemplate,
    });

    await prisma.campaignMessage.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
      },
    });
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
    const nextAttemptCount = message.attemptCount + 1;
    const exhausted = nextAttemptCount >= MAX_ATTEMPTS;

    await prisma.campaignMessage.update({
      where: { id: message.id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        lastErrorCode: exhausted ? "SEND_FAILED" : "SEND_RETRYABLE",
        lastErrorMessage:
          error instanceof Error ? error.message : "No se pudo enviar el mensaje.",
      },
    });
    await writeEvent(
      campaign,
      exhausted ? "MESSAGE_FAILED" : "MESSAGE_RETRY_SCHEDULED",
      {
        attemptCount: nextAttemptCount,
      },
      message.id,
    );
  }

  await syncCounters(campaign.id);

  const currentCampaign = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    select: { status: true },
  });

  if (currentCampaign?.status === "RUNNING") {
    await enqueueCampaign(queue, campaign.id, campaign.delaySeconds * 1000);
  }
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
          await processCampaign(campaign.id, null);
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
      await processCampaign(job.data.campaignId, queue);
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
