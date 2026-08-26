import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  handleEvolutionWebhook: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildRateLimitKey: vi.fn(() => "webhook:test"),
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: vi.fn(() => "127.0.0.1"),
  isRateLimitError: vi.fn(() => false),
  rateLimitResponse: vi.fn(),
}));

vi.mock("@/server/agents/whatsapp-webhook-service", () => ({
  handleEvolutionWebhook: mocks.handleEvolutionWebhook,
}));

import { POST } from "@/app/api/webhooks/evolution/route";

const SECRET = "test-evolution-webhook-secret";
const LIMIT = 16 * 1024;

function request(body: BodyInit, extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/evolution", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-evolution-webhook-secret": SECRET,
      ...extraHeaders,
    },
    body,
  });
}

describe("Evolution webhook ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("EVOLUTION_WEBHOOK_MAX_BODY_BYTES", String(LIMIT));
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.handleEvolutionWebhook.mockResolvedValue({
      ok: true,
      action: "processed_test_webhook",
    });
  });

  it("rejects Content-Length over the cap before webhook processing", async () => {
    const response = await POST(
      request("{}", {
        "content-length": String(LIMIT + 1),
      }),
    );

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: "EVOLUTION_WEBHOOK_BODY_TOO_LARGE",
      maxBytes: LIMIT,
    });
    expect(mocks.handleEvolutionWebhook).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed body without Content-Length", async () => {
    const oversized = JSON.stringify({ padding: "x".repeat(LIMIT + 1) });
    const response = await POST(request(oversized));

    expect(response.status).toBe(413);
    expect(mocks.handleEvolutionWebhook).not.toHaveBeenCalled();
  });

  it("passes a valid bounded JSON payload to the webhook service", async () => {
    const payload = {
      instance: "qa-instance",
      data: { message: { conversation: "hola" } },
    };
    const response = await POST(request(JSON.stringify(payload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      action: "processed_test_webhook",
    });
    expect(mocks.handleEvolutionWebhook).toHaveBeenCalledTimes(1);
    expect(mocks.handleEvolutionWebhook).toHaveBeenCalledWith(payload);
  });

  it("rejects invalid JSON without calling the webhook service", async () => {
    const response = await POST(request("{not-json"));

    expect(response.status).toBe(400);
    expect(mocks.handleEvolutionWebhook).not.toHaveBeenCalled();
  });

  it("rejects unauthorized requests before reading an oversized body", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/evolution", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(LIMIT + 1),
          "x-evolution-webhook-secret": "wrong-secret",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.handleEvolutionWebhook).not.toHaveBeenCalled();
  });
});
