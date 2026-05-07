import { describe, expect, it } from "vitest";

import {
  DEFAULT_MESSAGE_PREVIEW_VARIABLES,
  messagePreviewToPlainText,
  parseMessagePreview,
} from "./message-preview";

describe("messagePreviewToPlainText", () => {
  it("normalizes literal line break markers", () => {
    expect(messagePreviewToPlainText("Linea 1\\nLinea 2")).toBe("Linea 1\nLinea 2");
  });
});

describe("parseMessagePreview", () => {
  it("parses WhatsApp formatting and variables", () => {
    const result = parseMessagePreview(
      "*Hola, {nombre}*\nTu codigo es _WA-2048_ y ~vence pronto~.\nUsa ```ABC-1```",
      DEFAULT_MESSAGE_PREVIEW_VARIABLES,
    );

    expect(result.lines).toHaveLength(3);
    expect(result.lines[0].segments[0]).toEqual({ type: "bold", value: "Hola, {nombre}" });
    expect(result.lines[1].segments[0]).toEqual({ type: "text", value: "Tu codigo es " });
    expect(result.lines[1].segments[1]).toEqual({ type: "italic", value: "WA-2048" });
    expect(result.lines[1].segments[3]).toEqual({ type: "strike", value: "vence pronto" });
    expect(result.lines[2].segments[1]).toEqual({ type: "mono", value: "ABC-1" });
  });

  it("leaves unmatched markers as literal text", () => {
    const result = parseMessagePreview("*Hola sin cierre", DEFAULT_MESSAGE_PREVIEW_VARIABLES);

    expect(result.lines[0].segments).toEqual([{ type: "text", value: "*Hola sin cierre" }]);
  });

  it("keeps emojis and blank lines", () => {
    const result = parseMessagePreview("Hola \u{1F60A}\n\nSigue aqui", DEFAULT_MESSAGE_PREVIEW_VARIABLES);

    expect(result.lines[0].segments[0]).toEqual({ type: "text", value: "Hola \u{1F60A}" });
    expect(result.lines[1].segments).toEqual([]);
    expect(result.lines[2].segments[0]).toEqual({ type: "text", value: "Sigue aqui" });
  });

  it("renders variables as resolved values when provided", () => {
    const result = parseMessagePreview("Hola {empresa}", {
      empresa: "WA Sender",
    });

    expect(result.lines[0].segments[1]).toEqual({
      type: "variable",
      name: "empresa",
      value: "WA Sender",
    });
  });
});
