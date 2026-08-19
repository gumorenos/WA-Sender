import { afterEach, describe, expect, it } from "vitest";

import {
  getReadinessHealth,
  isAuthorizedHealthRequest,
} from "@/lib/observability/health";

const originalToken = process.env.HEALTHCHECK_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.HEALTHCHECK_TOKEN;
  } else {
    process.env.HEALTHCHECK_TOKEN = originalToken;
  }

  Object.defineProperty(process.env, "NODE_ENV", {
    value: originalNodeEnv,
    configurable: true,
    writable: true,
    enumerable: true,
  });
});

describe("deep health authorization", () => {
  it("accepts only the healthcheck header when a token is configured", () => {
    process.env.HEALTHCHECK_TOKEN = "super-secret-health-token";

    expect(
      isAuthorizedHealthRequest(
        new Request("http://localhost/api/health/deep", {
          headers: {
            "x-healthcheck-token": "super-secret-health-token",
          },
        }),
      ),
    ).toBe(true);

    expect(
      isAuthorizedHealthRequest(
        new Request(
          "http://localhost/api/health/deep?token=super-secret-health-token",
        ),
      ),
    ).toBe(false);
  });

  it("rejects the wrong token", () => {
    process.env.HEALTHCHECK_TOKEN = "expected-token";

    expect(
      isAuthorizedHealthRequest(
        new Request("http://localhost/api/health/deep", {
          headers: { "x-healthcheck-token": "wrong-token" },
        }),
      ),
    ).toBe(false);
  });
});

describe("readiness", () => {
  it("reports database and Redis as ready in the CI integration environment", async () => {
    if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
      return;
    }

    const readiness = await getReadinessHealth();

    expect(readiness.status).toBe("ok");
    expect(readiness.components.database.status).toBe("ok");
    expect(readiness.components.redis.status).toBe("ok");
  });
});
