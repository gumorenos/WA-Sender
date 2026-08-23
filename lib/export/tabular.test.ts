import { describe, expect, it } from "vitest";

import { neutralizeCsvFormula, rowsToCsv } from "@/lib/export/tabular";

describe("CSV export safety", () => {
  it("neutralizes formula-like strings including international phone numbers", () => {
    expect(neutralizeCsvFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeCsvFormula("+51999999999")).toBe("'+51999999999");
    expect(neutralizeCsvFormula("-1+2")).toBe("'-1+2");
    expect(neutralizeCsvFormula("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(neutralizeCsvFormula("  =cmd|' /C calc'!A0")).toBe(
      "'  =cmd|' /C calc'!A0",
    );
  });

  it("does not alter ordinary strings or numeric negative values", () => {
    expect(neutralizeCsvFormula("Persona")).toBe("Persona");

    const csv = rowsToCsv(
      [{ label: "Persona", amount: -10 }],
      ["label", "amount"],
    );

    expect(csv).toContain("Persona,-10");
  });

  it("keeps CSV escaping after formula neutralization", () => {
    const csv = rowsToCsv(
      [{ value: '=HYPERLINK("https://example.test","click")' }],
      ["value"],
    );

    expect(csv).toContain(
      '"\'=HYPERLINK(""https://example.test"",""click"")"',
    );
  });
});
