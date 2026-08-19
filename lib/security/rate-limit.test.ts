import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import IORedis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";

import {
  consumeRedisRateLimit,
  getRedisRateLimitKey,
  isRedisRateLimitRequired,
  RateLimitError,
  RateLimitUnavailableError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";

const describeWithRedis = process.env.REDIS_URL ? describe : describe.skip;
const redisClients: IORedis[] = [];

function createRedisClient() {
  const client = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  redisClients.push(client);
  return client;
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listTypeScriptFiles(absolute);
      }

      return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [absolute] : [];
    }),
  );

  return nested.flat();
}

afterAll(async () => {
  await Promise.all(
    redisClients.map((client) => client.quit().catch(() => client.disconnect())),
  );
});

describe("rate limit policy", () => {
  it("requires Redis by default in production but permits an explicit local fallback", () => {
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
  });

  it("hashes logical keys before storing them in Redis", () => {
    const logical = "campaigns:start:workspace-secret:user-secret";
    const stored = getRedisRateLimitKey(logical);

    expect(stored).toMatch(/^wa-sender:rate-limit:[a-f0-9]{64}$/);
    expect(stored).not.toContain("workspace-secret");
    expect(stored).not.toContain("user-secret");
  });

  it("returns 503 for an unavailable required limiter and 429 for an exceeded limit", async () => {
    const unavailable = rateLimitResponse(
      new RateLimitUnavailableError("connection refused"),
    );
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("cache-control")).toBe("no-store");

    const exceeded = rateLimitResponse(new RateLimitError(7));
    expect(exceeded.status).toBe(429);
    expect(exceeded.headers.get("retry-after")).toBe("7");
  });

  it("requires every API call site to await enforceRateLimit", async () => {
    const apiRoot = path.join(process.cwd(), "app", "api");
    const files = await listTypeScriptFiles(apiRoot);
    const violations: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        if (
          /\benforceRateLimit\s*\(/.test(line) &&
          !/\bawait\s+enforceRateLimit\s*\(/.test(line)
        ) {
          violations.push(
            `${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`,
          );
        }
      });
    }

    expect(violations).toEqual([]);
  });
});

describeWithRedis("distributed Redis rate limiter", () => {
  it("shares one atomic counter across independent Redis connections", async () => {
    const first = createRedisClient();
    const second = createRedisClient();
    const key = `qa:shared:${randomUUID()}`;

    const attempts = await Promise.allSettled([
      consumeRedisRateLimit(first, { key, limit: 3, windowMs: 60_000 }),
      consumeRedisRateLimit(second, { key, limit: 3, windowMs: 60_000 }),
      consumeRedisRateLimit(first, { key, limit: 3, windowMs: 60_000 }),
      consumeRedisRateLimit(second, { key, limit: 3, windowMs: 60_000 }),
    ]);

    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    const rejected = attempts.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(RateLimitError);
  });

  it("keeps different logical keys isolated and gives them expirations", async () => {
    const client = createRedisClient();
    const firstKey = `qa:first:${randomUUID()}`;
    const secondKey = `qa:second:${randomUUID()}`;

    const first = await consumeRedisRateLimit(client, {
      key: firstKey,
      limit: 1,
      windowMs: 10_000,
    });
    const second = await consumeRedisRateLimit(client, {
      key: secondKey,
      limit: 1,
      windowMs: 10_000,
    });

    expect(first.backend).toBe("redis");
    expect(second.backend).toBe("redis");
    expect(first.remaining).toBe(0);
    expect(second.remaining).toBe(0);

    const [firstTtl, secondTtl] = await Promise.all([
      client.pttl(getRedisRateLimitKey(firstKey)),
      client.pttl(getRedisRateLimitKey(secondKey)),
    ]);

    expect(firstTtl).toBeGreaterThan(0);
    expect(secondTtl).toBeGreaterThan(0);
  });
});
