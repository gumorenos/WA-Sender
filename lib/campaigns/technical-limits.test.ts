import { describe, expect, it } from "vitest";

import {
  countNonEmptyCampaignLines,
  getCampaignTechnicalLimits,
  utf8ByteLength,
  validateCampaignTechnicalLimits,
} from "@/lib/campaigns/technical-limits";

describe("campaign technical limits", () => {
  it("uses conservative defaults", () => {
    expect(getCampaignTechnicalLimits({})).toEqual({
      maxRawInputBytes: 256 * 1024,
      maxRows: 500,
      maxRequestBytes: 512 * 1024,
    });
  });

  it("uses positive overrides and never makes request cap smaller than raw input cap", () => {
    expect(
      getCampaignTechnicalLimits({
        CAMPAIGN_MAX_RAW_INPUT_BYTES: "1000",
        CAMPAIGN_MAX_ROWS: "25",
        CAMPAIGN_MAX_REQUEST_BYTES: "500",
      }),
    ).toEqual({
      maxRawInputBytes: 1000,
      maxRows: 25,
      maxRequestBytes: 1000,
    });
  });

  it("falls back when overrides are invalid", () => {
    expect(
      getCampaignTechnicalLimits({
        CAMPAIGN_MAX_RAW_INPUT_BYTES: "0",
        CAMPAIGN_MAX_ROWS: "abc",
        CAMPAIGN_MAX_REQUEST_BYTES: "-1",
      }),
    ).toEqual({
      maxRawInputBytes: 256 * 1024,
      maxRows: 500,
      maxRequestBytes: 512 * 1024,
    });
  });

  it("counts UTF-8 bytes rather than JavaScript characters", () => {
    expect(utf8ByteLength("a")).toBe(1);
    expect(utf8ByteLength("ñ")).toBe(2);
  });

  it("counts only non-empty campaign lines", () => {
    expect(
      countNonEmptyCampaignLines(
        "+51999999999,uno\n\n   \r\n+51988888888,dos\n",
      ),
    ).toBe(2);
  });

  it("rejects raw input over the byte cap before row validation", () => {
    expect(
      validateCampaignTechnicalLimits("123456", {
        maxRawInputBytes: 5,
        maxRows: 100,
        maxRequestBytes: 100,
      }),
    ).toEqual({
      code: "RAW_INPUT_TOO_LARGE",
      actual: 6,
      limit: 5,
    });
  });

  it("rejects too many non-empty rows", () => {
    expect(
      validateCampaignTechnicalLimits("a\nb\nc", {
        maxRawInputBytes: 100,
        maxRows: 2,
        maxRequestBytes: 100,
      }),
    ).toEqual({
      code: "TOO_MANY_ROWS",
      actual: 3,
      limit: 2,
    });
  });
});
