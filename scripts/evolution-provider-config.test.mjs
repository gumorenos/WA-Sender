import { describe, expect, it } from "vitest";

import {
  isEvolutionMockSendMode,
  validateEvolutionSendConfiguration,
} from "./evolution-provider-config.mjs";

describe("worker Evolution provider configuration", () => {
  it("keeps mock mode safe by default", () => {
    expect(isEvolutionMockSendMode({ REAL_SENDING_ENABLED: "false" })).toBe(true);
    expect(validateEvolutionSendConfiguration({ REAL_SENDING_ENABLED: "false" })).toEqual({
      ok: true,
      mode: "mock",
    });
  });

  it("rejects missing credentials before real provider calls", () => {
    expect(
      validateEvolutionSendConfiguration({
        REAL_SENDING_ENABLED: "true",
        EVOLUTION_API_BASE_URL: "https://evo.example.com",
      }),
    ).toMatchObject({ ok: false, code: "PROVIDER_CONFIG_ERROR" });
  });

  it("rejects invalid or non-HTTP URLs", () => {
    expect(
      validateEvolutionSendConfiguration({
        REAL_SENDING_ENABLED: "true",
        EVOLUTION_API_BASE_URL: "not-a-url",
        EVOLUTION_API_KEY: "secret",
      }).ok,
    ).toBe(false);
    expect(
      validateEvolutionSendConfiguration({
        REAL_SENDING_ENABLED: "true",
        EVOLUTION_API_BASE_URL: "ftp://evo.example.com",
        EVOLUTION_API_KEY: "secret",
      }).ok,
    ).toBe(false);
  });

  it("returns normalized credentials only for valid real configuration", () => {
    expect(
      validateEvolutionSendConfiguration({
        REAL_SENDING_ENABLED: "true",
        EVOLUTION_API_BASE_URL: "https://evo.example.com///",
        EVOLUTION_API_KEY: " secret ",
      }),
    ).toEqual({
      ok: true,
      mode: "real",
      baseUrl: "https://evo.example.com",
      apiKey: "secret",
    });
  });
});
