const DEFAULT_MAX_BODY_BYTES = 750_000;
const DEFAULT_MAX_RAW_INPUT_BYTES = 500_000;
const DEFAULT_MAX_ROWS = 1_000;

type CampaignLimitEnv = {
  CAMPAIGN_CREATE_MAX_BODY_BYTES?: string;
  CAMPAIGN_MAX_RAW_INPUT_BYTES?: string;
  CAMPAIGN_MAX_ROWS?: string;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function runtimeEnv(): CampaignLimitEnv {
  return {
    CAMPAIGN_CREATE_MAX_BODY_BYTES: process.env.CAMPAIGN_CREATE_MAX_BODY_BYTES,
    CAMPAIGN_MAX_RAW_INPUT_BYTES: process.env.CAMPAIGN_MAX_RAW_INPUT_BYTES,
    CAMPAIGN_MAX_ROWS: process.env.CAMPAIGN_MAX_ROWS,
  };
}

export function getCampaignImportLimits(env: CampaignLimitEnv = runtimeEnv()) {
  return {
    maxBodyBytes: positiveInteger(
      env.CAMPAIGN_CREATE_MAX_BODY_BYTES,
      DEFAULT_MAX_BODY_BYTES,
    ),
    maxRawInputBytes: positiveInteger(
      env.CAMPAIGN_MAX_RAW_INPUT_BYTES,
      DEFAULT_MAX_RAW_INPUT_BYTES,
    ),
    maxRows: positiveInteger(env.CAMPAIGN_MAX_ROWS, DEFAULT_MAX_ROWS),
  };
}

export function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
