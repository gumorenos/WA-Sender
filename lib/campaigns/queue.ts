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
  const existing = await campaignQueue.getJob(jobId);

  if (existing) {
    return { queued: true, deduplicated: true, jobId };
  }

  await campaignQueue.add(
    "process-campaign",
    { campaignId },
    {
      delay: Math.max(0, delayMs),
      jobId,
    },
  );

  return { queued: true, deduplicated: false, jobId };
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
