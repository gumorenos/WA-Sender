import { describe, expect, it } from "vitest";

import { getExtractNumbersMaxRecords } from "@/lib/extract-numbers-limits";

describe("extracted number limits", () => {
  it("uses the conservative default", () => {
    expect(getExtractNumbersMaxRecords({})).toBe(5_000);
  });

  it("accepts a positive override", () => {
    expect(
      getExtractNumbersMaxRecords({ EXTRACT_NUMBERS_MAX_RECORDS: "250" }),
    ).toBe(250);
  });

  it("falls back for invalid overrides", () => {
    expect(
      getExtractNumbersMaxRecords({ EXTRACT_NUMBERS_MAX_RECORDS: "0" }),
    ).toBe(5_000);
    expect(
      getExtractNumbersMaxRecords({ EXTRACT_NUMBERS_MAX_RECORDS: "nope" }),
    ).toBe(5_000);
  });
});
