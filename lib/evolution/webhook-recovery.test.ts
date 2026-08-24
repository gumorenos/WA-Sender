import { describe, expect, it } from "vitest";

import {
  getWebhookProcessingStaleSeconds,
  webhookProcessingStaleCutoff,
  webhookRecoveryDecisionSchema,
} from "@/lib/evolution/webhook-recovery";

describe("webhook recovery policy", () => {
  it("uses a conservative 10 minute stale default and clamps unsafe values", () => {
    expect(getWebhookProcessingStaleSeconds({} as NodeJS.ProcessEnv)).toBe(600);
    expect(
      getWebhookProcessingStaleSeconds({
        WEBHOOK_PROCESSING_STALE_SECONDS: "5",
      } as NodeJS.ProcessEnv),
    ).toBe(60);
    expect(
      getWebhookProcessingStaleSeconds({
        WEBHOOK_PROCESSING_STALE_SECONDS: "999999",
      } as NodeJS.ProcessEnv),
    ).toBe(86_400);
  });

  it("computes the stale cutoff from the selected threshold", () => {
    const now = new Date("2026-08-24T04:00:00.000Z");
    expect(webhookProcessingStaleCutoff(now, 600).toISOString()).toBe(
      "2026-08-24T03:50:00.000Z",
    );
  });

  it("requires confirmation and a reason for operator decisions", () => {
    expect(
      webhookRecoveryDecisionSchema.safeParse({
        decision: "RETRY_ON_REDELIVERY",
        confirmed: false,
        reason: "Proveedor reintentara",
      }).success,
    ).toBe(false);
    expect(
      webhookRecoveryDecisionSchema.safeParse({
        decision: "MARK_PROCESSED",
        confirmed: true,
        reason: "Se verifico externamente",
      }).success,
    ).toBe(true);
  });
});
