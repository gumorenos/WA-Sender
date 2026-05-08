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

export function enforceRateLimit({
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
