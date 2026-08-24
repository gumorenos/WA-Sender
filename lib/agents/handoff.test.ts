import { describe, expect, it } from "vitest";

import {
  conversationHandoffSchema,
  findMatchingHandoffKeyword,
  handoffKeywordsSchema,
  normalizeHandoffKeywords,
} from "@/lib/agents/handoff";

describe("human handoff helpers", () => {
  it("matches configured phrases ignoring case, accents and repeated spaces", () => {
    expect(
      findMatchingHandoffKeyword(
        "Quiero hablar   con un ASESÓR humano, por favor",
        ["asesor humano"],
      ),
    ).toBe("asesor humano");
  });

  it("does not match a keyword embedded inside another word", () => {
    expect(findMatchingHandoffKeyword("Necesito un agenteamiento", ["agente"])).toBeNull();
    expect(findMatchingHandoffKeyword("Necesito un agente", ["agente"])).toBe("agente");
  });

  it("normalizes and deduplicates configured keywords", () => {
    expect(
      normalizeHandoffKeywords([" Asesor ", "asesor", "HUMANO", 4, "x"]),
    ).toEqual(["Asesor", "HUMANO"]);
  });

  it("limits keyword configuration", () => {
    expect(
      handoffKeywordsSchema.safeParse({ keywords: ["a"] }).success,
    ).toBe(false);
    expect(
      handoffKeywordsSchema.safeParse({
        keywords: Array.from({ length: 21 }, (_, index) => `keyword-${index}`),
      }).success,
    ).toBe(false);
  });

  it("requires explicit confirmation and a reason for state changes", () => {
    expect(
      conversationHandoffSchema.safeParse({
        active: true,
        confirmed: false,
        reason: "Cliente solicita humano",
      }).success,
    ).toBe(false);
    expect(
      conversationHandoffSchema.safeParse({
        active: false,
        confirmed: true,
        reason: "Atencion humana finalizada",
      }).success,
    ).toBe(true);
  });
});
