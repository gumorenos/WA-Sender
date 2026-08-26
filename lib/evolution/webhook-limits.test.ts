import { describe, expect, it } from "vitest";

import {
  EVOLUTION_WEBHOOK_BODY_LIMITS,
  getEvolutionWebhookMaxBodyBytes,
} from "@/lib/evolution/webhook-limits";

describe("Evolution webhook body limits", () => {
  it("uses a conservative 256 KiB default", () => {
    expect(getEvolutionWebhookMaxBodyBytes(undefined)).toBe(256 * 1024);
  });

  it("accepts a configured value within the safe range", () => {
    expect(getEvolutionWebhookMaxBodyBytes("524288")).toBe(524288);
  });

  it("clamps values below and above the supported range", () => {
    expect(getEvolutionWebhookMaxBodyBytes("1")).toBe(
      EVOLUTION_WEBHOOK_BODY_LIMITS.minBytes,
    );
    expect(getEvolutionWebhookMaxBodyBytes("99999999")).toBe(
      EVOLUTION_WEBHOOK_BODY_LIMITS.maxBytes,
    );
  });

  it("falls back for invalid or non-positive configuration", () => {
    expect(getEvolutionWebhookMaxBodyBytes("invalid")).toBe(
      EVOLUTION_WEBHOOK_BODY_LIMITS.defaultBytes,
    );
    expect(getEvolutionWebhookMaxBodyBytes("0")).toBe(
      EVOLUTION_WEBHOOK_BODY_LIMITS.defaultBytes,
    );
  });
});
