import { postJson } from "@/lib/llm/http";
import {
  type GenerateResponseInput,
  type GenerateResponseResult,
  type LLMProvider,
  LlmProviderError,
} from "@/lib/llm/types";

type DeepSeekChatResponse = {
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

export class DeepSeekProvider implements LLMProvider {
  async generateResponse(
    input: GenerateResponseInput,
  ): Promise<GenerateResponseResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      throw new LlmProviderError(
        "DEEPSEEK_API_KEY is missing.",
        400,
        "LLM_CONFIG_ERROR",
      );
    }

    const model = input.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const response = await postJson<DeepSeekChatResponse>(
      "https://api.deepseek.com/chat/completions",
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
        "DeepSeek no devolvio una respuesta valida.",
        502,
        "LLM_EMPTY_RESPONSE",
      );
    }

    return {
      provider: "deepseek",
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
