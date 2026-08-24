import { z } from "zod";

export const WEBHOOK_STATUS_PROCESSING = "PROCESSING";
export const WEBHOOK_STATUS_PROCESSED = "PROCESSED";
export const WEBHOOK_STATUS_FAILED = "FAILED";
export const WEBHOOK_STATUS_STALE_REVIEW = "STALE_REVIEW";
export const WEBHOOK_STATUS_RETRY_ALLOWED = "RETRY_ALLOWED";

export const webhookRecoveryDecisionSchema = z
  .object({
    decision: z.enum(["RETRY_ON_REDELIVERY", "MARK_PROCESSED"]),
    confirmed: z.boolean().default(false),
    reason: z
      .string()
      .trim()
      .min(3, "Indica un motivo de al menos 3 caracteres.")
      .max(240, "El motivo no puede superar 240 caracteres."),
  })
  .superRefine((value, context) => {
    if (!value.confirmed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmed"],
        message: "Debes confirmar explicitamente la decision de recovery.",
      });
    }
  });

export type WebhookRecoveryDecision = z.infer<
  typeof webhookRecoveryDecisionSchema
>;

type WebhookRecoveryEnv = {
  WEBHOOK_PROCESSING_STALE_SECONDS?: string;
};

function defaultWebhookRecoveryEnv(): WebhookRecoveryEnv {
  return {
    WEBHOOK_PROCESSING_STALE_SECONDS:
      process.env.WEBHOOK_PROCESSING_STALE_SECONDS,
  };
}

export function getWebhookProcessingStaleSeconds(
  env: WebhookRecoveryEnv = defaultWebhookRecoveryEnv(),
) {
  const parsed = Number(env.WEBHOOK_PROCESSING_STALE_SECONDS ?? 600);

  if (!Number.isFinite(parsed)) {
    return 600;
  }

  return Math.min(86_400, Math.max(60, Math.floor(parsed)));
}

export function webhookProcessingStaleCutoff(
  now = new Date(),
  staleSeconds = getWebhookProcessingStaleSeconds(),
) {
  return new Date(now.getTime() - staleSeconds * 1000);
}
