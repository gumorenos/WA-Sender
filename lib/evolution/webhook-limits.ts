type EvolutionWebhookLimitEnv = Readonly<Record<string, string | undefined>>;

const DEFAULT_EVOLUTION_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024;
const MAX_EVOLUTION_WEBHOOK_MAX_BODY_BYTES = 10 * 1024 * 1024;

export function getEvolutionWebhookMaxBodyBytes(
  env: EvolutionWebhookLimitEnv = process.env,
) {
  const parsed = Number(env.EVOLUTION_WEBHOOK_MAX_BODY_BYTES);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_EVOLUTION_WEBHOOK_MAX_BODY_BYTES;
  }

  return Math.min(parsed, MAX_EVOLUTION_WEBHOOK_MAX_BODY_BYTES);
}
