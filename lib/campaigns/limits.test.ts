import { describe, expect, it } from "vitest";

import { getCampaignImportLimits, utf8ByteLength } from "@/lib/campaigns/limits";

describe("campaign import limits", () => {
  it("uses conservative defaults", () => {
    expect(getCampaignImportLimits({})).toEqual({
      maxBodyBytes: 750_000,
      maxRawInputBytes: 500_000,
      maxRows: 1_000,
    });
  });

  it("accepts positive integer overrides", () => {
    expect(
      getCampaignImportLimits({
        CAMPAIGN_CREATE_MAX_BODY_BYTES: "2000",
        CAMPAIGN_MAX_RAW_INPUT_BYTES: "1500",
        CAMPAIGN_MAX_ROWS: "25",
      }),
    ).toEqual({
      maxBodyBytes: 2_000,
      maxRawInputBytes: 1_500,
      maxRows: 25,
    });
  });

  it("falls back for invalid overrides", () => {
    expect(
      getCampaignImportLimits({
        CAMPAIGN_CREATE_MAX_BODY_BYTES: "0",
        CAMPAIGN_MAX_RAW_INPUT_BYTES: "nope",
        CAMPAIGN_MAX_ROWS: "-1",
      }),
    ).toEqual({
      maxBodyBytes: 750_000,
      maxRawInputBytes: 500_000,
      maxRows: 1_000,
    });
  });

  it("measures UTF-8 bytes rather than JavaScript character count", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("á")).toBe(2);
    expect(utf8ByteLength("🙂")).toBe(4);
  });
});
