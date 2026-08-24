export function isEvolutionMockSendMode(env = process.env) {
  return (
    env.EVOLUTION_MOCK === "true" ||
    env.MOCK_WHATSAPP_ENABLED === "true" ||
    env.REAL_SENDING_ENABLED !== "true"
  );
}

export function validateEvolutionSendConfiguration(env = process.env) {
  if (isEvolutionMockSendMode(env)) {
    return { ok: true, mode: "mock" };
  }

  const baseUrl = String(env.EVOLUTION_API_BASE_URL ?? "").trim();
  const apiKey = String(env.EVOLUTION_API_KEY ?? "").trim();

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      mode: "real",
      code: "PROVIDER_CONFIG_ERROR",
      message: "Evolution API requires a base URL and API key before real sending.",
    };
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return {
      ok: false,
      mode: "real",
      code: "PROVIDER_CONFIG_ERROR",
      message: "Evolution API base URL is invalid.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      mode: "real",
      code: "PROVIDER_CONFIG_ERROR",
      message: "Evolution API base URL must use HTTP or HTTPS.",
    };
  }

  return {
    ok: true,
    mode: "real",
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
  };
}
