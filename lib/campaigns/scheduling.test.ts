import { describe, expect, it } from "vitest";

import {
  campaignStartSchema,
  containsOptOutKeyword,
  isScheduledStartDue,
  isWithinActiveWindow,
} from "./scheduling";

const validStart = {
  instanceId: "cm12345678901234567890123",
  scheduledStartAt: "2026-08-19T14:00:00.000Z",
  activeWindowStart: "09:00",
  activeWindowEnd: "18:00",
  timezone: "America/Lima",
  delaySeconds: 45,
  consentAttested: true,
  consentSource: "CRM_IMPORT" as const,
  consentReference: "CRM lote agosto 2026",
};

describe("campaignStartSchema consent attestation", () => {
  it("accepts a complete consent attestation", () => {
    const result = campaignStartSchema.safeParse(validStart);

    expect(result.success).toBe(true);
  });

  it("rejects a missing consent attestation", () => {
    const result = campaignStartSchema.safeParse({
      ...validStart,
      consentAttested: undefined,
    });

    expect(result.success).toBe(false);
  });

  it("rejects consentAttested=false", () => {
    const result = campaignStartSchema.safeParse({
      ...validStart,
      consentAttested: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unsupported consent source", () => {
    const result = campaignStartSchema.safeParse({
      ...validStart,
      consentSource: "UNVERIFIED_IMPORT",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a short consent reference", () => {
    const result = campaignStartSchema.safeParse({
      ...validStart,
      consentReference: "x",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a consent reference longer than 240 characters", () => {
    const result = campaignStartSchema.safeParse({
      ...validStart,
      consentReference: "x".repeat(241),
    });

    expect(result.success).toBe(false);
  });
});

describe("isScheduledStartDue", () => {
  it("detects future scheduled starts", () => {
    const now = new Date("2026-05-07T15:00:00.000Z");

    expect(isScheduledStartDue("2026-05-07T14:59:00.000Z", now)).toBe(true);
    expect(isScheduledStartDue("2026-05-07T15:01:00.000Z", now)).toBe(false);
  });
});

describe("isWithinActiveWindow", () => {
  it("supports same-day active windows", () => {
    expect(
      isWithinActiveWindow({
        activeWindowStart: "09:00",
        activeWindowEnd: "18:00",
        now: new Date("2026-05-07T15:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toBe(true);
  });

  it("supports windows crossing midnight", () => {
    expect(
      isWithinActiveWindow({
        activeWindowStart: "22:00",
        activeWindowEnd: "06:00",
        now: new Date("2026-05-07T23:30:00.000Z"),
        timezone: "UTC",
      }),
    ).toBe(true);
  });
});

describe("containsOptOutKeyword", () => {
  it("detects common opt-out words", () => {
    expect(containsOptOutKeyword("Por favor CANCELAR mis mensajes")).toBe(true);
    expect(containsOptOutKeyword("Por favor no enviar mas mensajes")).toBe(true);
    expect(containsOptOutKeyword("Seguimos conversando manana")).toBe(false);
  });
});
