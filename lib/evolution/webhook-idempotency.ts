import { createHash } from "node:crypto";

import type { ParsedEvolutionWebhookMessage } from "./webhook-parser";

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableNormalize(nested)]),
    );
  }

  return value;
}

export function stableWebhookPayload(value: unknown) {
  return JSON.stringify(stableNormalize(value));
}

export function hashWebhookPayload(value: unknown) {
  return createHash("sha256").update(stableWebhookPayload(value)).digest("hex");
}

export function getWebhookProviderEventId(
  message: ParsedEvolutionWebhookMessage,
  payload: unknown,
) {
  if (message.providerMessageId) {
    return `message:${message.providerMessageId}`;
  }

  return `payload:${hashWebhookPayload(payload)}`;
}
