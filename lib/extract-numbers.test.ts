import { describe, expect, it } from "vitest";

import {
  normalizeExtractedNumbers,
  normalizePhoneNumber,
} from "./extract-numbers";

describe("normalizePhoneNumber", () => {
  it("normalizes international phones from formatted input", () => {
    expect(normalizePhoneNumber("+51 999-888-777")).toEqual({
      number: "+51999888777",
      isGroup: false,
    });
  });

  it("extracts numbers from WhatsApp JIDs", () => {
    expect(normalizePhoneNumber("51999888777@s.whatsapp.net")).toEqual({
      number: "+51999888777",
      isGroup: false,
    });
  });

  it("detects group JIDs without treating them as valid recipients", () => {
    expect(normalizePhoneNumber("120363000000000000@g.us")).toEqual({
      number: null,
      isGroup: true,
    });
  });
});

describe("normalizeExtractedNumbers", () => {
  it("deduplicates records and preserves useful metadata", () => {
    const result = normalizeExtractedNumbers(
      [
        {
          id: "51999888777@s.whatsapp.net",
          pushName: "Cliente Peru",
          isMyContact: true,
          lastMessageTimestamp: 1_700_000_000,
        },
        {
          number: "+51 999 888 777",
          name: "Duplicado",
        },
      ],
      {
        source: "chats",
        omitGroups: true,
        omitMissingPhones: true,
        dedupe: true,
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      number: "+51999888777",
      displayName: "Cliente Peru",
      source: "chats",
      isSaved: true,
    });
    expect(result[0]?.lastSeenOrUpdatedAt).toBe("2023-11-14T22:13:20.000Z");
  });
});
