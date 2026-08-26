const DEFAULT_EVOLUTION_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
const MIN_EVOLUTION_WEBHOOK_MAX_BODY_BYTES = 16 * 1024;
const MAX_EVOLUTION_WEBHOOK_MAX_BODY_BYTES = 2 * 1024 * 1024;

export function getEvolutionWebhookMaxBodyBytes(
  configured = process.env.EVOLUTION_WEBHOOK_MAX_BODY_BYTES,
) {
  const parsed = Number.parseInt(configured ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_EVOLUTION_WEBHOOK_MAX_BODY_BYTES;
  }

  return Math.min(
    MAX_EVOLUTION_WEBHOOK_MAX_BODY_BYTES,
    Math.max(MIN_EVOLUTION_WEBHOOK_MAX_BODY_BYTES, parsed),
  );
}

export const EVOLUTION_WEBHOOK_BODY_LIMITS = {
  defaultBytes: DEFAULT_EVOLUTION_WEBHOOK_MAX_BODY_BYTES,
  minBytes: MIN_EVOLUTION_WEBHOOK_MAX_BODY_BYTES,
  maxBytes: MAX_EVOLUTION_WEBHOOK_MAX_BODY_BYTES,
} as const;
