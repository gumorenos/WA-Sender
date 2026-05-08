import type {
  GenerateResponseInput,
  GenerateResponseResult,
  LLMProvider,
} from "@/lib/llm/types";

function compact(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}...`
    : normalized;
}

export class MockProvider implements LLMProvider {
  async generateResponse(
    input: GenerateResponseInput,
  ): Promise<GenerateResponseResult> {
    const lastUserMessage =
      [...input.messages].reverse().find((message) => message.role === "user")
        ?.content ?? "";
    const promptHint = compact(input.systemPrompt, 180);
    const userHint = compact(lastUserMessage, 180);

    return {
      provider: "mock",
      model: "mock-agent-v1",
      content: [
        "Respuesta mock del agente.",
        "",
        `Entendi tu mensaje: "${userHint}".`,
        "",
        "Responderia siguiendo estas instrucciones base:",
        promptHint,
      ].join("\n"),
      usage: {
        promptTokens: Math.ceil(input.systemPrompt.length / 4),
        completionTokens: 70,
        totalTokens: Math.ceil(input.systemPrompt.length / 4) + 70,
      },
    };
  }
}
