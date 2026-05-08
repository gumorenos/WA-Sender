export type LlmProviderName = "mock" | "deepseek" | "openai";

export type LlmMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateResponseInput = {
  systemPrompt: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string | null;
};

export type GenerateResponseResult = {
  content: string;
  provider: LlmProviderName;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export interface LLMProvider {
  generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult>;
}

export class LlmProviderError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly code = "LLM_PROVIDER_ERROR",
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}
