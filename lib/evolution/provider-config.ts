export type EvolutionProviderConfigEnv = {
  REAL_SENDING_ENABLED?: string;
  EVOLUTION_MOCK?: string;
  MOCK_WHATSAPP_ENABLED?: string;
  EVOLUTION_API_BASE_URL?: string;
  EVOLUTION_API_KEY?: string;
};

export type EvolutionProviderConfigValidation =
  | { ok: true; mode: "mock" | "real" }
  | {
      ok: false;
      mode: "real";
      code: "PROVIDER_CONFIG_ERROR";
      message: string;
    };

function defaultEnv(): EvolutionProviderConfigEnv {
  return {
    REAL_SENDING_ENABLED: process.env.REAL_SENDING_ENABLED,
    EVOLUTION_MOCK: process.env.EVOLUTION_MOCK,
    MOCK_WHATSAPP_ENABLED: process.env.MOCK_WHATSAPP_ENABLED,
    EVOLUTION_API_BASE_URL: process.env.EVOLUTION_API_BASE_URL,
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  };
}

export function isEvolutionMockSendMode(
  env: EvolutionProviderConfigEnv = defaultEnv(),
) {
  return (
    env.EVOLUTION_MOCK === "true" ||
    env.MOCK_WHATSAPP_ENABLED === "true" ||
    env.REAL_SENDING_ENABLED !== "true"
  );
}

export function validateEvolutionSendConfiguration(
  env: EvolutionProviderConfigEnv = defaultEnv(),
): EvolutionProviderConfigValidation {
  if (isEvolutionMockSendMode(env)) {
    return { ok: true, mode: "mock" };
  }

  const baseUrl = env.EVOLUTION_API_BASE_URL?.trim() ?? "";
  const apiKey = env.EVOLUTION_API_KEY?.trim() ?? "";

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      mode: "real",
      code: "PROVIDER_CONFIG_ERROR",
      message: "Evolution API requiere URL base y API key antes de enviar en modo real.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return {
      ok: false,
      mode: "real",
      code: "PROVIDER_CONFIG_ERROR",
      message: "Evolution API base URL no es una URL valida.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      mode: "real",
      code: "PROVIDER_CONFIG_ERROR",
      message: "Evolution API base URL debe usar HTTP o HTTPS.",
    };
  }

  return { ok: true, mode: "real" };
}
