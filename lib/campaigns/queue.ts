import { Queue } from "bullmq";
import IORedis from "ioredis";

export const CAMPAIGN_QUEUE_NAME = "campaign-send";

let queue: Queue | null = null;
let connection: IORedis | null = null;

function getRedisUrl() {
  return process.env.REDIS_URL || "";
}

function getConnection() {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (!connection) {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  return connection;
}

export function getCampaignJobId(campaignId: string) {
  return `campaign-${campaignId}`;
}

export function getCampaignQueue() {
  const redisConnection = getConnection();

  if (!redisConnection) {
    return null;
  }

  if (!queue) {
    queue = new Queue(CAMPAIGN_QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });
  }

  return queue;
}

export async function enqueueCampaign(campaignId: string, delayMs = 0) {
  const campaignQueue = getCampaignQueue();

  if (!campaignQueue) {
    return { queued: false, reason: "REDIS_URL is not configured." };
  }

  const jobId = getCampaignJobId(campaignId);
  const requestedDelay = Math.max(0, delayMs);
  const existing = await campaignQueue.getJob(jobId);

  if (existing) {
    const state = await existing.getState();

    if (state === "delayed") {
      const remainingDelay = Math.max(
        0,
        existing.timestamp + existing.delay - Date.now(),
      );

      if (Math.abs(requestedDelay - remainingDelay) > 1000) {
        await existing.changeDelay(requestedDelay);
        return {
          queued: true,
          deduplicated: true,
          rescheduled: true,
          jobId,
        };
      }
    }

    return {
      queued: true,
      deduplicated: true,
      rescheduled: false,
      jobId,
    };
  }

  await campaignQueue.add(
    "process-campaign",
    { campaignId },
    {
      delay: requestedDelay,
      jobId,
    },
  );

  return {
    queued: true,
    deduplicated: false,
    rescheduled: false,
    jobId,
  };
}

export async function closeCampaignQueue() {
  if (queue) {
    await queue.close();
    queue = null;
  }

  if (connection) {
    await connection.quit();
    connection = null;
  }
}
