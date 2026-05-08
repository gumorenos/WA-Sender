import { postJson } from "@/lib/llm/http";
import {
  type GenerateResponseInput,
  type GenerateResponseResult,
  type LLMProvider,
  LlmProviderError,
} from "@/lib/llm/types";

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export class OpenAIProvider implements LLMProvider {
  async generateResponse(
    input: GenerateResponseInput,
  ): Promise<GenerateResponseResult> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new LlmProviderError(
        "OPENAI_API_KEY is missing.",
        400,
        "LLM_CONFIG_ERROR",
      );
    }

    const model = input.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const response = await postJson<OpenAiChatResponse>(
      "https://api.openai.com/v1/chat/completions",
      {
        apiKey,
        body: {
          model,
          messages: [
            { role: "system", content: input.systemPrompt },
            ...input.messages,
          ],
          temperature: input.temperature ?? 0.4,
          max_tokens: input.maxTokens ?? 500,
        },
      },
    );
    const content = response.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new LlmProviderError(
        "OpenAI no devolvio una respuesta valida.",
        502,
        "LLM_EMPTY_RESPONSE",
      );
    }

    return {
      provider: "openai",
      model,
      content,
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    };
  }
}
