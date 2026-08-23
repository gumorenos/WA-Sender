const DEFAULT_MAX_EXTRACTED_RECORDS = 5_000;

type ExtractNumberLimitEnv = {
  EXTRACT_NUMBERS_MAX_RECORDS?: string;
};

function runtimeEnv(): ExtractNumberLimitEnv {
  return {
    EXTRACT_NUMBERS_MAX_RECORDS: process.env.EXTRACT_NUMBERS_MAX_RECORDS,
  };
}

export function getExtractNumbersMaxRecords(
  env: ExtractNumberLimitEnv = runtimeEnv(),
) {
  const parsed = Number.parseInt(env.EXTRACT_NUMBERS_MAX_RECORDS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_EXTRACTED_RECORDS;
}
