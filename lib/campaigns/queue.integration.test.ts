import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import {
  closeCampaignQueue,
  enqueueCampaign,
  getCampaignJobId,
  getCampaignQueue,
} from "./queue";

const describeWithRedis = process.env.REDIS_URL ? describe : describe.skip;

describeWithRedis("campaign queue idempotency", () => {
  afterAll(async () => {
    await closeCampaignQueue();
  });

  it("deduplicates repeated enqueue requests for the same campaign", async () => {
    const campaignId = `queue-${randomUUID()}`;
    const first = await enqueueCampaign(campaignId);
    const second = await enqueueCampaign(campaignId);

    expect(first).toEqual({
      queued: true,
      deduplicated: false,
      jobId: getCampaignJobId(campaignId),
    });
    expect(second).toEqual({
      queued: true,
      deduplicated: true,
      jobId: getCampaignJobId(campaignId),
    });

    const queue = getCampaignQueue();
    expect(queue).not.toBeNull();

    const savedJob = await queue?.getJob(getCampaignJobId(campaignId));
    expect(savedJob).not.toBeUndefined();
    expect(savedJob?.data).toEqual({ campaignId });

    await savedJob?.remove();
  });
});
