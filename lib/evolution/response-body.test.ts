import { describe, expect, it } from "vitest";

import {
  EvolutionResponseTooLargeError,
  getEvolutionExtractMaxResponseBytes,
  readResponseTextWithLimit,
} from "@/lib/evolution/response-body";

function chunkedResponse(chunks: Uint8Array[], onCancel?: () => void) {
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }

        controller.enqueue(chunks[index]);
        index += 1;
      },
      cancel() {
        onCancel?.();
      },
    }),
  );
}

describe("Evolution response byte limits", () => {
  it("uses a 5 MiB default and accepts a positive override", () => {
    expect(getEvolutionExtractMaxResponseBytes({})).toBe(5 * 1024 * 1024);
    expect(
      getEvolutionExtractMaxResponseBytes({
        EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES: "12345",
      }),
    ).toBe(12345);
  });

  it("falls back on invalid values and clamps excessive overrides", () => {
    expect(
      getEvolutionExtractMaxResponseBytes({
        EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES: "0",
      }),
    ).toBe(5 * 1024 * 1024);
    expect(
      getEvolutionExtractMaxResponseBytes({
        EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES: "999999999",
      }),
    ).toBe(50 * 1024 * 1024);
  });

  it("rejects early when Content-Length exceeds the limit", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("small"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(body, {
      headers: { "content-length": "11" },
    });

    await expect(readResponseTextWithLimit(response, 10)).rejects.toMatchObject({
      name: "EvolutionResponseTooLargeError",
      maxBytes: 10,
      receivedBytes: 11,
    } satisfies Partial<EvolutionResponseTooLargeError>);
    expect(cancelled).toBe(true);
  });

  it("cancels a chunked body as soon as accumulated bytes exceed the limit", async () => {
    let cancelled = false;
    const response = chunkedResponse(
      [
        new TextEncoder().encode("123456"),
        new TextEncoder().encode("789012"),
      ],
      () => {
        cancelled = true;
      },
    );

    await expect(readResponseTextWithLimit(response, 10)).rejects.toMatchObject({
      name: "EvolutionResponseTooLargeError",
      maxBytes: 10,
      receivedBytes: 12,
    });
    expect(cancelled).toBe(true);
  });

  it("accepts a response exactly on the byte boundary", async () => {
    const response = chunkedResponse([
      new TextEncoder().encode("12345"),
      new TextEncoder().encode("67890"),
    ]);

    await expect(readResponseTextWithLimit(response, 10)).resolves.toBe("1234567890");
  });

  it("counts UTF-8 bytes rather than JavaScript characters", async () => {
    const value = "ááá";
    expect(value.length).toBe(3);
    expect(new TextEncoder().encode(value).byteLength).toBe(6);

    const response = chunkedResponse([new TextEncoder().encode(value)]);
    await expect(readResponseTextWithLimit(response, 5)).rejects.toBeInstanceOf(
      EvolutionResponseTooLargeError,
    );
  });
});
