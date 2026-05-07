import { describe, expect, it } from "vitest";
import {
  normalizeCampaignPhone,
  parseCampaignInput,
} from "../../../../lib/campaign-parser";

describe("normalizeCampaignPhone", () => {
  it("normalizes formatted international numbers", () => {
    expect(normalizeCampaignPhone("+51 999 888 777")).toBe("+51999888777");
    expect(normalizeCampaignPhone("(+57) 300-123-4567")).toBe("+573001234567");
  });

  it("rejects local numbers without international format", () => {
    expect(normalizeCampaignPhone("999888777")).toBeNull();
    expect(normalizeCampaignPhone("051999888777")).toBeNull();
  });
});

describe("parseCampaignInput", () => {
  it("parses tab, comma and multiple spaces", () => {
    const result = parseCampaignInput(
      [
        "+51 999 888 777\tHola {nombre}",
        "+52 55 1234 5678,Seguimos tu solicitud",
        "+54 9 11 2345 6789    Mensaje con espacios y emojis 😎",
      ].join("\n"),
    );

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toEqual([
      { line: 1, phone: "+51999888777", message: "Hola {nombre}" },
      { line: 2, phone: "+525512345678", message: "Seguimos tu solicitud" },
      {
        line: 3,
        phone: "+5491123456789",
        message: "Mensaje con espacios y emojis 😎",
      },
    ]);
  });

  it("skips empty lines and reports invalid rows", () => {
    const result = parseCampaignInput(
      [
        "",
        "   ",
        "51999888777 sin separador claro",
        "+57 300 123 4567\t",
        "+57 300 123 4567\tHola Colombia",
      ].join("\n"),
    );

    expect(result.rows).toEqual([
      { line: 5, phone: "+573001234567", message: "Hola Colombia" },
    ]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]?.code).toBe("MISSING_SEPARATOR");
    expect(result.errors[1]?.code).toBe("MISSING_MESSAGE");
  });
});
