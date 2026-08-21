import { describe, expect, it } from "vitest";

import {
  readJsonBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/security/request-body";

describe("readJsonBodyWithLimit", () => {
  it("parses JSON bodies within the limit", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ ok: true, value: "hola" }),
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonBodyWithLimit(request, 1_000)).resolves.toEqual({
      ok: true,
      value: "hola",
    });
  });

  it("returns null for malformed JSON", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{not-json",
    });

    await expect(readJsonBodyWithLimit(request, 1_000)).resolves.toBeNull();
  });

  it("rejects an oversized Content-Length before consuming the body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "5000" },
    });

    await expect(readJsonBodyWithLimit(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects a body that exceeds the limit while reading", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ payload: "x".repeat(200) }),
    });

    await expect(readJsonBodyWithLimit(request, 50)).rejects.toMatchObject({
      maxBytes: 50,
    });
  });
});
