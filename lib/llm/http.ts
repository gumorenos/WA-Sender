import { LlmProviderError } from "@/lib/llm/types";

export async function postJson<TResponse>(
  url: string,
  params: {
    apiKey: string;
    body: unknown;
    timeoutMs?: number;
  },
): Promise<TResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? 30000,
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    });

    const json = (await response.json().catch(() => null)) as
      | { error?: { message?: string }; message?: string }
      | null;

    if (!response.ok) {
      throw new LlmProviderError(
        json?.error?.message ?? json?.message ?? "El proveedor LLM rechazo la solicitud.",
        response.status,
        "LLM_PROVIDER_HTTP_ERROR",
      );
    }

    return json as TResponse;
  } catch (error) {
    if (error instanceof LlmProviderError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LlmProviderError(
        "El proveedor LLM no respondio a tiempo.",
        504,
        "LLM_PROVIDER_TIMEOUT",
      );
    }

    throw new LlmProviderError(
      "No se pudo contactar al proveedor LLM.",
      502,
      "LLM_PROVIDER_NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
}
