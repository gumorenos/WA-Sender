import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  closeRateLimitRedis,
  enforceRateLimit,
  RateLimitError,
  resetLocalRateLimitBuckets,
} from "@/lib/security/rate-limit";

const describeWithRedis = process.env.REDIS_URL ? describe : describe.skip;

describeWithRedis("distributed rate limiting", () => {
  afterEach(async () => {
    await closeRateLimitRedis();
    resetLocalRateLimitBuckets();
  });

  it("keeps the counter in Redis across client reconnects", async () => {
    const key = `qa:${randomUUID()}`;

    await enforceRateLimit({ key, limit: 1, windowMs: 30_000 });
    await closeRateLimitRedis();
    resetLocalRateLimitBuckets();

    await expect(
      enforceRateLimit({ key, limit: 1, windowMs: 30_000 }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("allows requests up to the configured limit and then rejects", async () => {
    const key = `qa:${randomUUID()}`;

    await enforceRateLimit({ key, limit: 2, windowMs: 30_000 });
    await enforceRateLimit({ key, limit: 2, windowMs: 30_000 });

    await expect(
      enforceRateLimit({ key, limit: 2, windowMs: 30_000 }),
    ).rejects.toMatchObject({
      retryAfterSeconds: expect.any(Number),
    });
  });
});
