export type ParsedCampaignRow = {
  line: number;
  phone: string;
  message: string;
};

export type CampaignParseErrorCode =
  | "MISSING_SEPARATOR"
  | "MISSING_PHONE"
  | "INVALID_PHONE"
  | "MISSING_MESSAGE";

export type CampaignParseError = {
  line: number;
  raw: string;
  code: CampaignParseErrorCode;
  message: string;
};

export type CampaignParseResult = {
  rows: ParsedCampaignRow[];
  errors: CampaignParseError[];
  totalLines: number;
  processedLines: number;
};

const MULTI_SPACE_SEPARATOR = /\s{2,}/;

function splitLine(rawLine: string) {
  if (rawLine.includes("\t")) {
    const index = rawLine.indexOf("\t");
    return [rawLine.slice(0, index), rawLine.slice(index + 1)] as const;
  }

  if (rawLine.includes(",")) {
    const index = rawLine.indexOf(",");
    return [rawLine.slice(0, index), rawLine.slice(index + 1)] as const;
  }

  const multiSpace = rawLine.match(MULTI_SPACE_SEPARATOR);

  if (multiSpace?.index !== undefined) {
    const index = multiSpace.index;
    const length = multiSpace[0].length;
    return [rawLine.slice(0, index), rawLine.slice(index + length)] as const;
  }

  return null;
}

export function normalizeCampaignPhone(value: string) {
  const digits = value.replace(/[^\d+]/g, "");
  const hasPlus = digits.startsWith("+");
  const normalizedDigits = digits.replace(/\D/g, "");

  if (!normalizedDigits) {
    return null;
  }

  if (normalizedDigits.startsWith("0")) {
    return null;
  }

  if (normalizedDigits.length < 11 || normalizedDigits.length > 15) {
    return null;
  }

  return hasPlus ? `+${normalizedDigits}` : `+${normalizedDigits}`;
}

export function parseCampaignInput(input: string): CampaignParseResult {
  const rawLines = input.split(/\r?\n/);
  const rows: ParsedCampaignRow[] = [];
  const errors: CampaignParseError[] = [];
  let processedLines = 0;

  rawLines.forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();

    if (!trimmed) {
      return;
    }

    processedLines += 1;

    const pieces = splitLine(rawLine);

    if (!pieces) {
      errors.push({
        line,
        raw: rawLine,
        code: "MISSING_SEPARATOR",
        message:
          "No se encontro separador valido. Usa tab, coma o espacios multiples.",
      });
      return;
    }

    const [rawPhone, rawMessage] = pieces;
    const phoneCandidate = rawPhone.trim();
    const message = rawMessage.trim();

    if (!phoneCandidate) {
      errors.push({
        line,
        raw: rawLine,
        code: "MISSING_PHONE",
        message: "Falta el numero de WhatsApp.",
      });
      return;
    }

    const phone = normalizeCampaignPhone(phoneCandidate);

    if (!phone) {
      errors.push({
        line,
        raw: rawLine,
        code: "INVALID_PHONE",
        message:
          "El numero debe incluir codigo internacional y quedar entre 11 y 15 digitos.",
      });
      return;
    }

    if (!message) {
      errors.push({
        line,
        raw: rawLine,
        code: "MISSING_MESSAGE",
        message: "Falta el mensaje.",
      });
      return;
    }

    rows.push({
      line,
      phone,
      message,
    });
  });

  return {
    rows,
    errors,
    totalLines: rawLines.length,
    processedLines,
  };
}
