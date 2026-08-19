type CampaignLimitEnv = {
  CAMPAIGN_MAX_RAW_INPUT_BYTES?: string;
  CAMPAIGN_MAX_ROWS?: string;
  CAMPAIGN_MAX_REQUEST_BYTES?: string;
};

export type CampaignTechnicalLimits = {
  maxRawInputBytes: number;
  maxRows: number;
  maxRequestBytes: number;
};

const DEFAULT_MAX_RAW_INPUT_BYTES = 256 * 1024;
const DEFAULT_MAX_ROWS = 500;
const DEFAULT_MAX_REQUEST_BYTES = 512 * 1024;

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function currentLimitEnv(): CampaignLimitEnv {
  return {
    CAMPAIGN_MAX_RAW_INPUT_BYTES: process.env.CAMPAIGN_MAX_RAW_INPUT_BYTES,
    CAMPAIGN_MAX_ROWS: process.env.CAMPAIGN_MAX_ROWS,
    CAMPAIGN_MAX_REQUEST_BYTES: process.env.CAMPAIGN_MAX_REQUEST_BYTES,
  };
}

export function getCampaignTechnicalLimits(
  env: CampaignLimitEnv = currentLimitEnv(),
): CampaignTechnicalLimits {
  const maxRawInputBytes = positiveInteger(
    env.CAMPAIGN_MAX_RAW_INPUT_BYTES,
    DEFAULT_MAX_RAW_INPUT_BYTES,
  );
  const maxRows = positiveInteger(env.CAMPAIGN_MAX_ROWS, DEFAULT_MAX_ROWS);
  const configuredRequestBytes = positiveInteger(
    env.CAMPAIGN_MAX_REQUEST_BYTES,
    DEFAULT_MAX_REQUEST_BYTES,
  );

  return {
    maxRawInputBytes,
    maxRows,
    maxRequestBytes: Math.max(configuredRequestBytes, maxRawInputBytes),
  };
}

export function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function countNonEmptyCampaignLines(value: string) {
  let count = 0;
  let hasContent = false;

  for (let index = 0; index <= value.length; index += 1) {
    const character = value[index];

    if (character === "\n" || index === value.length) {
      if (hasContent) {
        count += 1;
      }
      hasContent = false;
      continue;
    }

    if (character !== "\r" && character?.trim()) {
      hasContent = true;
    }
  }

  return count;
}

export type CampaignTechnicalLimitViolation =
  | {
      code: "RAW_INPUT_TOO_LARGE";
      actual: number;
      limit: number;
    }
  | {
      code: "TOO_MANY_ROWS";
      actual: number;
      limit: number;
    };

export function validateCampaignTechnicalLimits(
  rawInput: string,
  limits = getCampaignTechnicalLimits(),
): CampaignTechnicalLimitViolation | null {
  const bytes = utf8ByteLength(rawInput);

  if (bytes > limits.maxRawInputBytes) {
    return {
      code: "RAW_INPUT_TOO_LARGE",
      actual: bytes,
      limit: limits.maxRawInputBytes,
    };
  }

  const rows = countNonEmptyCampaignLines(rawInput);

  if (rows > limits.maxRows) {
    return {
      code: "TOO_MANY_ROWS",
      actual: rows,
      limit: limits.maxRows,
    };
  }

  return null;
}
