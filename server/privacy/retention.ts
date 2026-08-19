import type { Prisma } from "@prisma/client";

type RetentionEnv = {
  EXTRACTED_NUMBER_RETENTION_DAYS?: string;
};

const DEFAULT_EXTRACTED_NUMBER_RETENTION_DAYS = 30;

function currentRetentionEnv(): RetentionEnv {
  return {
    EXTRACTED_NUMBER_RETENTION_DAYS:
      process.env.EXTRACTED_NUMBER_RETENTION_DAYS,
  };
}

export function getExtractedNumberRetentionDays(
  env: RetentionEnv = currentRetentionEnv(),
) {
  const parsed = Number(env.EXTRACTED_NUMBER_RETENTION_DAYS);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_EXTRACTED_NUMBER_RETENTION_DAYS;
  }

  return parsed;
}

export function getRetentionCutoff(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export async function purgeExpiredExtractedNumbers(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  {
    now = new Date(),
    retentionDays = getExtractedNumberRetentionDays(),
  }: {
    now?: Date;
    retentionDays?: number;
  } = {},
) {
  const cutoff = getRetentionCutoff(now, retentionDays);
  const deleted = await tx.extractedNumber.deleteMany({
    where: {
      workspaceId,
      extractedAt: { lt: cutoff },
    },
  });

  return {
    cutoff,
    deletedCount: deleted.count,
    retentionDays,
  };
}
