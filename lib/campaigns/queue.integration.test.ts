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

    expect(first).toMatchObject({
      queued: true,
      deduplicated: false,
      rescheduled: false,
      jobId: getCampaignJobId(campaignId),
    });
    expect(second).toMatchObject({
      queued: true,
      deduplicated: true,
      rescheduled: false,
      jobId: getCampaignJobId(campaignId),
    });

    const queue = getCampaignQueue();
    expect(queue).not.toBeNull();

    const savedJob = await queue?.getJob(getCampaignJobId(campaignId));
    expect(savedJob).not.toBeUndefined();
    expect(savedJob?.data).toEqual({ campaignId });

    await savedJob?.remove();
  });

  it("reschedules an existing delayed job instead of creating a duplicate", async () => {
    const campaignId = `queue-delayed-${randomUUID()}`;
    const first = await enqueueCampaign(campaignId, 60_000);
    const changed = await enqueueCampaign(campaignId, 2_000);

    expect(first).toMatchObject({
      queued: true,
      deduplicated: false,
      rescheduled: false,
    });
    expect(changed).toMatchObject({
      queued: true,
      deduplicated: true,
      rescheduled: true,
    });

    const queue = getCampaignQueue();
    const jobs = await queue?.getJobs(["delayed", "waiting"]);
    const matchingJobs =
      jobs?.filter((job) => job.data.campaignId === campaignId) ?? [];

    expect(matchingJobs).toHaveLength(1);
    expect(matchingJobs[0]?.id).toBe(getCampaignJobId(campaignId));
    expect(matchingJobs[0]?.delay).toBe(2_000);

    await matchingJobs[0]?.remove();
  });
});
