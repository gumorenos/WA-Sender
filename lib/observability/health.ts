import { createHash, timingSafeEqual } from "node:crypto";
import { statfs } from "node:fs/promises";

import { prisma } from "@/lib/db";

type HealthStatus = "ok" | "warn" | "fail";

type ComponentHealth = {
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
};

function timeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
    },
  };
}

async function checkDatabase(): Promise<ComponentHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      message: "Database reachable.",
    };
  } catch (error) {
    return {
      status: "fail",
      message: "Database check failed.",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return {
      status: "fail",
      message: "REDIS_URL is not configured.",
    };
  }

  try {
    const { default: IORedis } = await import("ioredis");
    const connection = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
    });

    try {
      await connection.connect();
      const response = await connection.ping();

      return {
        status: response === "PONG" ? "ok" : "fail",
        message: response === "PONG" ? "Redis reachable." : "Redis ping returned unexpected response.",
      };
    } finally {
      connection.disconnect();
    }
  } catch (error) {
    return {
      status: "fail",
      message: "Redis check failed.",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

async function checkEvolution(): Promise<ComponentHealth> {
  const baseUrl = (process.env.EVOLUTION_API_BASE_URL ?? "").replace(/\/+$/, "");

  if (!baseUrl) {
    return {
      status: "warn",
      message: "Evolution base URL is not configured.",
    };
  }

  try {
    const parsedBaseUrl = new URL(baseUrl);
    if (
      parsedBaseUrl.protocol !== "http:" &&
      parsedBaseUrl.protocol !== "https:"
    ) {
      return {
        status: "fail",
        message: "Evolution base URL must use HTTP or HTTPS.",
      };
    }
  } catch {
    return {
      status: "fail",
      message: "Evolution base URL is invalid.",
    };
  }

  const timer = timeoutSignal(Number(process.env.EVOLUTION_TIMEOUT_MS ?? 8000));

  try {
    const response = await fetch(baseUrl, {
      signal: timer.signal,
    });

    return {
      status: response.status < 500 ? "ok" : "fail",
      message:
        response.status < 500
          ? "Evolution API reachable."
          : "Evolution API returned server error.",
      details: {
        statusCode: response.status,
      },
    };
  } catch (error) {
    return {
      status: "fail",
      message: "Evolution API check failed.",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  } finally {
    timer.clear();
  }
}

async function checkWorker(): Promise<ComponentHealth> {
  const redisUrl = process.env.REDIS_URL;
  const heartbeatKey =
    process.env.WORKER_HEARTBEAT_KEY ?? "wa-sender:worker:heartbeat";
  const staleSeconds = Number(
    process.env.WORKER_HEARTBEAT_STALE_SECONDS ?? 120,
  );

  if (!redisUrl) {
    return {
      status: "fail",
      message: "Worker heartbeat cannot be checked without Redis.",
    };
  }

  try {
    const { default: IORedis } = await import("ioredis");
    const connection = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
    });

    try {
      await connection.connect();
      const payload = await connection.get(heartbeatKey);

      if (!payload) {
        return {
          status: "fail",
          message: "Worker heartbeat is missing.",
          details: {
            heartbeatKey,
          },
        };
      }

      const parsed = JSON.parse(payload) as {
        timestamp?: string;
        pendingJobs?: number;
        activeJobs?: number;
        service?: string;
      };
      const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : null;
      const ageSeconds = timestamp
        ? Math.max(0, Math.floor((Date.now() - timestamp.getTime()) / 1000))
        : null;

      if (!timestamp || Number.isNaN(timestamp.getTime())) {
        return {
          status: "fail",
          message: "Worker heartbeat payload is invalid.",
          details: {
            heartbeatKey,
          },
        };
      }

      return {
        status: ageSeconds !== null && ageSeconds > staleSeconds ? "fail" : "ok",
        message:
          ageSeconds !== null && ageSeconds > staleSeconds
            ? "Worker heartbeat is stale."
            : "Worker heartbeat is fresh.",
        details: {
          heartbeatKey,
          ageSeconds,
          pendingJobs: parsed.pendingJobs ?? null,
          activeJobs: parsed.activeJobs ?? null,
          service: parsed.service ?? null,
        },
      };
    } finally {
      connection.disconnect();
    }
  } catch (error) {
    return {
      status: "fail",
      message: "Worker heartbeat check failed.",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

async function checkWhatsAppInstances(): Promise<ComponentHealth> {
  try {
    const [disconnectedCount, errorCount] = await Promise.all([
      prisma.whatsAppInstance.count({
        where: {
          status: "DISCONNECTED",
        },
      }),
      prisma.whatsAppInstance.count({
        where: {
          status: "ERROR",
        },
      }),
    ]);

    const totalProblemInstances = disconnectedCount + errorCount;

    return {
      status: totalProblemInstances > 0 ? "warn" : "ok",
      message:
        totalProblemInstances > 0
          ? "There are disconnected or errored WhatsApp instances."
          : "All tracked WhatsApp instances are connected.",
      details: {
        disconnectedCount,
        errorCount,
      },
    };
  } catch (error) {
    return {
      status: "fail",
      message: "WhatsApp instance status check failed.",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

async function checkLlmFailures(): Promise<ComponentHealth> {
  try {
    const threshold = new Date(Date.now() - 15 * 60_000);
    const recentFailures = await prisma.auditLog.count({
      where: {
        resourceType: "llm",
        action: "UPDATED",
        createdAt: {
          gte: threshold,
        },
      },
    });

    return {
      status: recentFailures > 0 ? "warn" : "ok",
      message:
        recentFailures > 0
          ? "Recent LLM failures were recorded."
          : "No recent LLM failures were recorded.",
      details: {
        recentFailures,
        windowMinutes: 15,
      },
    };
  } catch (error) {
    return {
      status: "fail",
      message: "LLM failure check failed.",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

async function checkDiskSpace(): Promise<ComponentHealth> {
  try {
    const stats = await statfs(process.cwd());
    const totalBytes = stats.blocks * stats.bsize;
    const availableBytes = stats.bavail * stats.bsize;
    const usedBytes = totalBytes - availableBytes;
    const usedPercent =
      totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

    return {
      status: usedPercent >= 90 ? "fail" : usedPercent >= 80 ? "warn" : "ok",
      message:
        usedPercent >= 90
          ? "Disk usage is critical."
          : usedPercent >= 80
            ? "Disk usage is high."
            : "Disk usage is within safe range.",
      details: {
        totalBytes,
        availableBytes,
        usedBytes,
        usedPercent,
      },
    };
  } catch (error) {
    return {
      status: "fail",
      message: "Disk usage check failed.",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

function tokenDigest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isAuthorizedHealthRequest(request: Request) {
  const expected = process.env.HEALTHCHECK_TOKEN;

  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }

  const received = request.headers.get("x-healthcheck-token");

  if (!received) {
    return false;
  }

  return timingSafeEqual(tokenDigest(received), tokenDigest(expected));
}

export async function getReadinessHealth() {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const components = { database, redis };
  const hasFail = Object.values(components).some(
    (component) => component.status === "fail",
  );

  return {
    status: hasFail ? "fail" : "ok",
    checkedAt: new Date().toISOString(),
    components,
  };
}

export async function getDeepHealth() {
  const [
    database,
    redis,
    evolution,
    worker,
    whatsAppInstances,
    llm,
    disk,
  ] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkEvolution(),
    checkWorker(),
    checkWhatsAppInstances(),
    checkLlmFailures(),
    checkDiskSpace(),
  ]);

  const components = {
    database,
    redis,
    evolution,
    worker,
    whatsAppInstances,
    llm,
    disk,
  };

  const hasFail = Object.values(components).some(
    (component) => component.status === "fail",
  );
  const hasWarn = Object.values(components).some(
    (component) => component.status === "warn",
  );

  return {
    status: hasFail ? "fail" : hasWarn ? "warn" : "ok",
    checkedAt: new Date().toISOString(),
    components,
  };
}
