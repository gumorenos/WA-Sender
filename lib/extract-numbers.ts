export type ExtractionSource = "contacts" | "chats";

export type ExtractedNumberResult = {
  number: string;
  displayName: string | null;
  source: ExtractionSource;
  isSaved: boolean;
  lastSeenOrUpdatedAt: string | null;
  isGroup: boolean;
};

export type NormalizeExtractOptions = {
  source: ExtractionSource;
  omitGroups: boolean;
  omitMissingPhones: boolean;
  dedupe: boolean;
};

type RawRecord = Record<string, unknown>;

function readString(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readBoolean(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.toLowerCase();

      if (normalized === "true") {
        return true;
      }

      if (normalized === "false") {
        return false;
      }
    }
  }

  return false;
}

function readDate(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
      const parsed = new Date(timestamp);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  return null;
}

function extractPhoneCandidate(record: RawRecord) {
  return readString(record, [
    "number",
    "phone",
    "waId",
    "jid",
    "id",
    "remoteJid",
    "participant",
  ]);
}

export function normalizePhoneNumber(input: string | null | undefined): {
  number: string | null;
  isGroup: boolean;
} {
  const raw = input?.trim() ?? "";

  if (!raw) {
    return { number: null, isGroup: false };
  }

  const isGroup = raw.includes("@g.us");
  const withoutJid = raw.split("@")[0]?.split(":")[0] ?? raw;
  const digits = withoutJid.replace(/[^\d]/g, "");

  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) {
    return { number: null, isGroup };
  }

  return {
    number: `+${digits}`,
    isGroup,
  };
}

export function normalizeExtractedNumbers(
  rawRecords: unknown[],
  options: NormalizeExtractOptions,
): ExtractedNumberResult[] {
  const seen = new Set<string>();
  const results: ExtractedNumberResult[] = [];

  for (const rawRecord of rawRecords) {
    if (
      rawRecord === null ||
      typeof rawRecord !== "object" ||
      Array.isArray(rawRecord)
    ) {
      continue;
    }

    const record = rawRecord as RawRecord;
    const normalizedPhone = normalizePhoneNumber(extractPhoneCandidate(record));

    if (options.omitGroups && normalizedPhone.isGroup) {
      continue;
    }

    if (options.omitMissingPhones && !normalizedPhone.number) {
      continue;
    }

    if (!normalizedPhone.number) {
      continue;
    }

    if (options.dedupe && seen.has(normalizedPhone.number)) {
      continue;
    }

    seen.add(normalizedPhone.number);
    results.push({
      number: normalizedPhone.number,
      displayName: readString(record, [
        "displayName",
        "pushName",
        "name",
        "notify",
        "subject",
      ]),
      source: options.source,
      isSaved: readBoolean(record, [
        "isSaved",
        "isMyContact",
        "isContact",
        "saved",
      ]),
      lastSeenOrUpdatedAt: readDate(record, [
        "lastSeen",
        "lastSeenAt",
        "updatedAt",
        "lastMessageTimestamp",
        "messageTimestamp",
      ]),
      isGroup: normalizedPhone.isGroup,
    });
  }

  return results;
}
