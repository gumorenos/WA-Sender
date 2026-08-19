import { createHash } from "node:crypto";
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

export type RateLimitResult = {
  limit: number;
  remaining: number;
  resetAt: number;
  backend: "redis" | "local";
};

const buckets = new Map<string, RateLimitBucket>();
let rateLimitRedis: IORedis | null = null;

const CONSUME_RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if current == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
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

export class RateLimitUnavailableError extends RateLimitError {
  constructor(public readonly detail = "Redis rate limiter unavailable.") {
    super(
      1,
      "El control de frecuencia no esta disponible temporalmente. Intenta nuevamente.",
    );
    this.name = "RateLimitUnavailableError";
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

export function getRedisRateLimitKey(logicalKey: string) {
  const digest = createHash("sha256").update(logicalKey).digest("hex");
  return `wa-sender:rate-limit:${digest}`;
}

export function isRedisRateLimitRequired(
  env: {
    NODE_ENV?: string;
    RATE_LIMIT_REDIS_REQUIRED?: string;
  } = {
    NODE_ENV: process.env.NODE_ENV,
    RATE_LIMIT_REDIS_REQUIRED: process.env.RATE_LIMIT_REDIS_REQUIRED,
  },
) {
  if (env.RATE_LIMIT_REDIS_REQUIRED === "true") {
    return true;
  }

  if (env.RATE_LIMIT_REDIS_REQUIRED === "false") {
    return false;
  }

  return env.NODE_ENV === "production";
}

function consumeLocalRateLimit({
  key,
  limit,
  windowMs,
}: EnforceRateLimitInput): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      backend: "local",
    };
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

  return {
    limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    backend: "local",
  };
}

export async function consumeRedisRateLimit(
  connection: IORedis,
  { key, limit, windowMs }: EnforceRateLimitInput,
): Promise<RateLimitResult> {
  const result = (await connection.eval(
    CONSUME_RATE_LIMIT_LUA,
    1,
    getRedisRateLimitKey(key),
    String(windowMs),
  )) as [number | string, number | string];

  const count = Number(result[0]);
  const ttlMs = Number(result[1]);

  if (!Number.isFinite(count) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("Redis rate limiter returned an invalid response.");
  }

  if (count > limit) {
    throw new RateLimitError(Math.max(1, Math.ceil(ttlMs / 1000)));
  }

  return {
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: Date.now() + ttlMs,
    backend: "redis",
  };
}

async function getRateLimitRedis() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  if (!rateLimitRedis) {
    rateLimitRedis = new IORedis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  if (rateLimitRedis.status === "wait") {
    await rateLimitRedis.connect();
  }

  return rateLimitRedis;
}

export async function enforceRateLimit(input: EnforceRateLimitInput) {
  const redisRequired = isRedisRateLimitRequired();

  try {
    const redis = await getRateLimitRedis();

    if (redis) {
      return await consumeRedisRateLimit(redis, input);
    }

    if (redisRequired) {
      throw new RateLimitUnavailableError("REDIS_URL is not configured.");
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }

    if (redisRequired) {
      throw new RateLimitUnavailableError(
        error instanceof Error ? error.message : "Unknown Redis error.",
      );
    }
  }

  return consumeLocalRateLimit(input);
}

export async function closeRateLimitRedis() {
  if (!rateLimitRedis) {
    return;
  }

  const connection = rateLimitRedis;
  rateLimitRedis = null;

  if (connection.status === "ready") {
    await connection.quit().catch(() => connection.disconnect());
  } else {
    connection.disconnect();
  }
}

export function clearLocalRateLimitBuckets() {
  buckets.clear();
}

export function rateLimitResponse(error: RateLimitError) {
  if (error instanceof RateLimitUnavailableError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "RATE_LIMIT_UNAVAILABLE",
      },
      {
        status: 503,
        headers: {
          "Retry-After": "1",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      error: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(error.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}
