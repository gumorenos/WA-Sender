import { describe, expect, it } from "vitest";

import {
  containsOptOutKeyword,
  isScheduledStartDue,
  isWithinActiveWindow,
} from "./scheduling";

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
