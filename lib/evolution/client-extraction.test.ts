import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EvolutionApiError,
  extractEvolutionNumbers,
} from "@/lib/evolution/client";

const originalEnv = { ...process.env };

function setRealEvolutionEnv(maxBytes = 1024) {
  process.env.EVOLUTION_MOCK = "false";
  process.env.MOCK_WHATSAPP_ENABLED = "false";
  process.env.EVOLUTION_API_BASE_URL = "https://evolution.test";
  process.env.EVOLUTION_API_KEY = "test-key";
  process.env.EVOLUTION_TIMEOUT_MS = "1000";
  process.env.EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES = String(maxBytes);
}

describe("Evolution extraction response safety", () => {
  beforeEach(() => {
    setRealEvolutionEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("rejects an extraction whose announced response size exceeds the cap", async () => {
    setRealEvolutionEnv(10);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("[]", {
          status: 200,
          headers: { "content-length": "11" },
        }),
      ),
    );

    await expect(
      extractEvolutionNumbers({
        providerInstanceName: "instance-a",
        source: "contacts",
      }),
    ).rejects.toMatchObject({
      name: "EvolutionApiError",
      status: 502,
      code: "EVOLUTION_RESPONSE_TOO_LARGE",
    } satisfies Partial<EvolutionApiError>);
  });

  it("distinguishes invalid JSON from an oversized response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })),
    );

    await expect(
      extractEvolutionNumbers({
        providerInstanceName: "instance-b",
        source: "chats",
      }),
    ).rejects.toMatchObject({
      name: "EvolutionApiError",
      status: 502,
      code: "EVOLUTION_INVALID_JSON",
    } satisfies Partial<EvolutionApiError>);
  });

  it("cancels a 404 body and safely falls back from POST to GET", async () => {
    let cancelled = false;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("ignored-error-body"));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contacts: [{ id: "51999999999@s.whatsapp.net" }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractEvolutionNumbers({
      providerInstanceName: "instance-c",
      source: "contacts",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cancelled).toBe(true);
    expect(result.mocked).toBe(false);
    expect(result.records).toHaveLength(1);
  });
});
