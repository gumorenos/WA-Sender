import { describe, expect, it } from "vitest";

import {
  getRedisRateLimitKey,
  isRedisRateLimitRequired,
  RateLimitError,
  RateLimitUnavailableError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";

describe("rate limit production policy", () => {
  it("requires Redis by default in production and permits only an explicit opt-out", () => {
    expect(isRedisRateLimitRequired({ NODE_ENV: "production" })).toBe(true);
    expect(
      isRedisRateLimitRequired({
        NODE_ENV: "production",
        RATE_LIMIT_REDIS_REQUIRED: "false",
      }),
    ).toBe(false);
    expect(
      isRedisRateLimitRequired({
        NODE_ENV: "development",
        RATE_LIMIT_REDIS_REQUIRED: "true",
      }),
    ).toBe(true);
    expect(isRedisRateLimitRequired({ NODE_ENV: "development" })).toBe(false);
  });

  it("hashes logical identifiers before using them as Redis keys", () => {
    const stored = getRedisRateLimitKey(
      "campaign:start:workspace-secret:user-secret",
    );

    expect(stored).toMatch(/^wa-sender:ratelimit:[a-f0-9]{64}$/);
    expect(stored).not.toContain("workspace-secret");
    expect(stored).not.toContain("user-secret");
  });

  it("returns fail-closed 503 for an unavailable required limiter", async () => {
    const response = rateLimitResponse(
      new RateLimitUnavailableError("connection refused"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toMatchObject({
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  });

  it("keeps normal rate-limit exhaustion as 429 with no-store", () => {
    const response = rateLimitResponse(new RateLimitError(7));

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("7");
  });
});
