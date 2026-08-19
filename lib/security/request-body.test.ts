import { describe, expect, it } from "vitest";

import {
  InvalidJsonBodyError,
  readJsonBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/security/request-body";

describe("readJsonBodyWithLimit", () => {
  it("parses a JSON body within the limit", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonBodyWithLimit(request, 1024)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects immediately when Content-Length exceeds the limit", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        "content-length": "2048",
      },
    });

    await expect(readJsonBodyWithLimit(request, 1024)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects a streamed body that grows beyond the limit without relying on Content-Length", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(200) }),
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonBodyWithLimit(request, 64)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonBodyWithLimit(request, 1024)).rejects.toBeInstanceOf(
      InvalidJsonBodyError,
    );
  });
});
