import { DeepSeekProvider } from "@/lib/llm/deepseek-provider";
import { MockProvider } from "@/lib/llm/mock-provider";
import { OpenAIProvider } from "@/lib/llm/openai-provider";
import {
  type LLMProvider,
  type LlmProviderName,
  LlmProviderError,
} from "@/lib/llm/types";

function normalizeProvider(value?: string | null): LlmProviderName {
  const normalized = (value ?? "mock").toLowerCase();

  if (normalized === "mock" || normalized === "deepseek" || normalized === "openai") {
    return normalized;
  }

  if (normalized === "gemini" || normalized === "groq") {
    throw new LlmProviderError(
      `El proveedor ${normalized} esta reservado para una fase posterior.`,
      400,
      "LLM_PROVIDER_NOT_IMPLEMENTED",
    );
  }

  throw new LlmProviderError(
    `Proveedor LLM no soportado: ${value}.`,
    400,
    "LLM_PROVIDER_UNSUPPORTED",
  );
}

export function getLlmProvider(agentProvider?: string | null): {
  name: LlmProviderName;
  provider: LLMProvider;
} {
  const name = normalizeProvider(process.env.LLM_PROVIDER || agentProvider);

  if (name === "deepseek") {
    return { name, provider: new DeepSeekProvider() };
  }

  if (name === "openai") {
    return { name, provider: new OpenAIProvider() };
  }

  return { name, provider: new MockProvider() };
}

export type {
  GenerateResponseInput,
  GenerateResponseResult,
  LLMProvider,
  LlmMessage,
  LlmProviderName,
} from "@/lib/llm/types";
export { LlmProviderError } from "@/lib/llm/types";
