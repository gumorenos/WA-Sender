import { describe, expect, it } from "vitest";

import { getEvolutionWebhookMaxBodyBytes } from "@/lib/evolution/webhook-limits";

describe("Evolution webhook body limit", () => {
  it("defaults to 1 MiB and accepts a positive override", () => {
    expect(getEvolutionWebhookMaxBodyBytes({})).toBe(1024 * 1024);
    expect(
      getEvolutionWebhookMaxBodyBytes({
        EVOLUTION_WEBHOOK_MAX_BODY_BYTES: "262144",
      }),
    ).toBe(262144);
  });

  it("falls back on invalid values and clamps excessive overrides", () => {
    expect(
      getEvolutionWebhookMaxBodyBytes({
        EVOLUTION_WEBHOOK_MAX_BODY_BYTES: "0",
      }),
    ).toBe(1024 * 1024);
    expect(
      getEvolutionWebhookMaxBodyBytes({
        EVOLUTION_WEBHOOK_MAX_BODY_BYTES: "not-a-number",
      }),
    ).toBe(1024 * 1024);
    expect(
      getEvolutionWebhookMaxBodyBytes({
        EVOLUTION_WEBHOOK_MAX_BODY_BYTES: "999999999",
      }),
    ).toBe(10 * 1024 * 1024);
  });
});
