import IORedis from "ioredis";
import { NextResponse } from "next/server";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type EnforceRateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

const buckets = new Map<string, RateLimitBucket>();
const RATE_LIMIT_KEY_PREFIX = "wa-sender:ratelimit:";
let redis: IORedis | null = null;
let redisUrl: string | null = null;

const FIXED_WINDOW_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { count, ttl }
`;

export class RateLimitError extends Error {
  constructor(
    public readonly retryAfterSeconds: number,
    message = "Demasiadas solicitudes. Intenta nuevamente mas tarde.",
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function buildRateLimitKey(parts: Array<string | null | undefined>) {
  return parts.map((part) => part || "unknown").join(":");
}

function enforceLocalRateLimit({
  key,
  limit,
  windowMs,
}: EnforceRateLimitInput) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return;
  }

  if (current.count >= limit) {
    throw new RateLimitError(
      Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    );
  }

  current.count += 1;

  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }
  }
}

function getRateLimitRedis() {
  const configuredUrl = process.env.REDIS_URL?.trim() || null;

  if (!configuredUrl) {
    return null;
  }

  if (redis && redisUrl === configuredUrl) {
    return redis;
  }

  if (redis) {
    redis.disconnect();
  }

  redisUrl = configuredUrl;
  redis = new IORedis(configuredUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_500,
  });
  redis.on("error", () => {
    // Errors are handled by enforceRateLimit so callers can use the local fallback.
  });

  return redis;
}

async function enforceRedisRateLimit(
  client: IORedis,
  { key, limit, windowMs }: EnforceRateLimitInput,
) {
  if (client.status === "wait") {
    await client.connect();
  }

  const result = await client.eval(
    FIXED_WINDOW_SCRIPT,
    1,
    `${RATE_LIMIT_KEY_PREFIX}${key}`,
    String(windowMs),
  );

  if (!Array.isArray(result)) {
    throw new Error("Redis devolvio una respuesta inesperada para rate limiting.");
  }

  const count = Number(result[0]);
  const ttlMs = Number(result[1]);

  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
    throw new Error("Redis devolvio valores invalidos para rate limiting.");
  }

  if (count > limit) {
    throw new RateLimitError(Math.max(1, Math.ceil(Math.max(1, ttlMs) / 1000)));
  }
}

export async function enforceRateLimit(input: EnforceRateLimitInput) {
  const client = getRateLimitRedis();

  if (!client) {
    enforceLocalRateLimit(input);
    return;
  }

  try {
    await enforceRedisRateLimit(client, input);
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }

    console.warn("rate_limit_redis_fallback", {
      key: input.key,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    enforceLocalRateLimit(input);
  }
}

export async function closeRateLimitRedis() {
  if (!redis) {
    return;
  }

  const client = redis;
  redis = null;
  redisUrl = null;

  if (client.status === "ready" || client.status === "connecting") {
    await client.quit().catch(() => client.disconnect());
    return;
  }

  client.disconnect();
}

export function resetLocalRateLimitBuckets() {
  buckets.clear();
}

export function rateLimitResponse(error: RateLimitError) {
  return NextResponse.json(
    {
      error: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(error.retryAfterSeconds),
      },
    },
  );
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}
