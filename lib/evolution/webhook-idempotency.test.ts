import { describe, expect, it } from "vitest";

import {
  getWebhookProviderEventId,
  hashWebhookPayload,
  stableWebhookPayload,
} from "./webhook-idempotency";
import type { ParsedEvolutionWebhookMessage } from "./webhook-parser";

function message(
  providerMessageId: string | null,
): ParsedEvolutionWebhookMessage {
  return {
    providerInstanceId: "instance-a",
    remoteJid: "51999999999@s.whatsapp.net",
    phone: "+51999999999",
    text: "Hola",
    fromMe: false,
    isGroup: false,
    pushName: "Cliente",
    providerMessageId,
  };
}

describe("webhook idempotency identity", () => {
  it("uses the provider message id when available", () => {
    expect(getWebhookProviderEventId(message("ABC123"), { any: "payload" })).toBe(
      "message:ABC123",
    );
  });

  it("uses a payload hash fallback when the provider id is missing", () => {
    const payload = { event: "messages.upsert", data: { message: "Hola" } };
    const id = getWebhookProviderEventId(message(null), payload);

    expect(id).toBe(`payload:${hashWebhookPayload(payload)}`);
  });

  it("produces the same fallback hash regardless of object key order", () => {
    const left = { b: 2, a: { y: 2, x: 1 } };
    const right = { a: { x: 1, y: 2 }, b: 2 };

    expect(stableWebhookPayload(left)).toBe(stableWebhookPayload(right));
    expect(hashWebhookPayload(left)).toBe(hashWebhookPayload(right));
  });

  it("changes the fallback identity when the payload content changes", () => {
    const left = getWebhookProviderEventId(message(null), { text: "uno" });
    const right = getWebhookProviderEventId(message(null), { text: "dos" });

    expect(left).not.toBe(right);
  });
});
