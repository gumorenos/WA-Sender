import { describe, expect, it } from "vitest";

import { MockProvider } from "./mock-provider";

describe("MockProvider", () => {
  it("returns a deterministic response without external APIs", async () => {
    const provider = new MockProvider();
    const response = await provider.generateResponse({
      systemPrompt: "Eres un agente de ventas consultivo.",
      messages: [{ role: "user", content: "Cual es el precio?" }],
      temperature: 0.3,
      maxTokens: 120,
    });

    expect(response.provider).toBe("mock");
    expect(response.model).toBe("mock-agent-v1");
    expect(response.content).toContain("Respuesta mock del agente.");
    expect(response.content).toContain("Cual es el precio?");
  });
});
