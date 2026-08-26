import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closeRateLimitRedis,
  enforceRateLimit,
  RateLimitError,
  RateLimitUnavailableError,
  resetLocalRateLimitBuckets,
} from "@/lib/security/rate-limit";

const describeWithRedis = process.env.REDIS_URL ? describe : describe.skip;

async function resetRateLimiterState() {
  await closeRateLimitRedis();
  resetLocalRateLimitBuckets();
  vi.unstubAllEnvs();
}

describeWithRedis("distributed rate limiting", () => {
  afterEach(resetRateLimiterState);

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

describe("required Redis fail-closed behavior", () => {
  afterEach(resetRateLimiterState);

  it("does not consume a local fallback bucket when REDIS_URL is missing", async () => {
    const key = `qa:missing-redis:${randomUUID()}`;
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "true");

    await expect(
      enforceRateLimit({ key, limit: 1, windowMs: 30_000 }),
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);

    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "false");
    await expect(
      enforceRateLimit({ key, limit: 1, windowMs: 30_000 }),
    ).resolves.toBeUndefined();

    await expect(
      enforceRateLimit({ key, limit: 1, windowMs: 30_000 }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("does not fall back locally when required Redis is unreachable", async () => {
    const key = `qa:unreachable-redis:${randomUUID()}`;
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1/0");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "true");

    await expect(
      enforceRateLimit({ key, limit: 1, windowMs: 30_000 }),
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);

    await closeRateLimitRedis();
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "false");

    await expect(
      enforceRateLimit({ key, limit: 1, windowMs: 30_000 }),
    ).resolves.toBeUndefined();
  });
});
