import { describe, expect, it } from "vitest";

import {
  isEvolutionMockSendMode,
  validateEvolutionSendConfiguration,
} from "@/lib/evolution/provider-config";

describe("Evolution send configuration", () => {
  it("treats disabled real sending and explicit mocks as mock mode", () => {
    expect(isEvolutionMockSendMode({ REAL_SENDING_ENABLED: "false" })).toBe(true);
    expect(
      isEvolutionMockSendMode({
        REAL_SENDING_ENABLED: "true",
        EVOLUTION_MOCK: "true",
      }),
    ).toBe(true);
    expect(
      isEvolutionMockSendMode({
        REAL_SENDING_ENABLED: "true",
        MOCK_WHATSAPP_ENABLED: "true",
      }),
    ).toBe(true);
  });

  it("accepts mock mode without provider credentials", () => {
    expect(validateEvolutionSendConfiguration({ REAL_SENDING_ENABLED: "false" })).toEqual({
      ok: true,
      mode: "mock",
    });
  });

  it("rejects missing URL or API key for real sending", () => {
    expect(
      validateEvolutionSendConfiguration({
        REAL_SENDING_ENABLED: "true",
        EVOLUTION_API_BASE_URL: "https://evo.example.com",
      }).ok,
    ).toBe(false);
    expect(
      validateEvolutionSendConfiguration({
        REAL_SENDING_ENABLED: "true",
        EVOLUTION_API_KEY: "secret",
      }).ok,
    ).toBe(false);
  });

  it("rejects invalid and non-HTTP provider URLs", () => {
    const invalid = validateEvolutionSendConfiguration({
      REAL_SENDING_ENABLED: "true",
      EVOLUTION_API_BASE_URL: "not-a-url",
      EVOLUTION_API_KEY: "secret",
    });
    const ftp = validateEvolutionSendConfiguration({
      REAL_SENDING_ENABLED: "true",
      EVOLUTION_API_BASE_URL: "ftp://evo.example.com",
      EVOLUTION_API_KEY: "secret",
    });

    expect(invalid.ok).toBe(false);
    expect(ftp.ok).toBe(false);
  });

  it("accepts syntactically valid real provider configuration", () => {
    expect(
      validateEvolutionSendConfiguration({
        REAL_SENDING_ENABLED: "true",
        EVOLUTION_API_BASE_URL: "https://evo.example.com/api",
        EVOLUTION_API_KEY: "secret",
      }),
    ).toEqual({ ok: true, mode: "real" });
  });
});
