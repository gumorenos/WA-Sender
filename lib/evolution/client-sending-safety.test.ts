import { afterEach, describe, expect, it, vi } from "vitest";

import { sendEvolutionTextMessage } from "@/lib/evolution/client";

const ENV_KEYS = [
  "EVOLUTION_MOCK",
  "MOCK_WHATSAPP_ENABLED",
  "REAL_SENDING_ENABLED",
  "AGENT_REAL_REPLY_ENABLED",
  "EVOLUTION_API_BASE_URL",
  "EVOLUTION_API_KEY",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function configureRealEvolution() {
  process.env.EVOLUTION_MOCK = "false";
  process.env.MOCK_WHATSAPP_ENABLED = "false";
  process.env.REAL_SENDING_ENABLED = "true";
  process.env.EVOLUTION_API_BASE_URL = "https://evolution.example.test";
  process.env.EVOLUTION_API_KEY = "test-key";
}

afterEach(() => {
  vi.unstubAllGlobals();

  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("Evolution sending safety gates", () => {
  it("blocks a real send before fetch when the real reply gate is disabled", async () => {
    configureRealEvolution();
    process.env.AGENT_REAL_REPLY_ENABLED = "false";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendEvolutionTextMessage({
        providerInstanceName: "ws_test_instance",
        phone: "+51999999999",
        message: "Confirmacion",
      }),
    ).rejects.toMatchObject({
      name: "EvolutionApiError",
      code: "AGENT_REAL_REPLY_DISABLED",
      status: 503,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps mock-mode testing safe when real sending is disabled", async () => {
    configureRealEvolution();
    process.env.REAL_SENDING_ENABLED = "false";
    process.env.AGENT_REAL_REPLY_ENABLED = "false";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEvolutionTextMessage({
      providerInstanceName: "ws_test_instance",
      phone: "+51999999999",
      message: "Confirmacion",
    });

    expect(result.mocked).toBe(true);
    expect(result.status).toBe("mocked");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows the provider call only when both real-send gates are enabled", async () => {
    configureRealEvolution();
    process.env.AGENT_REAL_REPLY_ENABLED = "true";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: { id: "provider-message-1" }, status: "sent" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEvolutionTextMessage({
      providerInstanceName: "ws_test_instance",
      phone: "+51999999999",
      message: "Confirmacion",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      mocked: false,
      providerMessageId: "provider-message-1",
      status: "sent",
    });
  });
});
