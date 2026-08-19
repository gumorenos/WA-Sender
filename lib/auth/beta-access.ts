import { prisma } from "@/lib/db";

export function normalizeBetaEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isBetaInviteRequired(env: NodeJS.ProcessEnv = process.env) {
  return env.BETA_REQUIRE_INVITE !== "false";
}

export function getBetaAllowedEmails(env: NodeJS.ProcessEnv = process.env) {
  return new Set(
    (env.BETA_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((value) => normalizeBetaEmail(value))
      .filter(Boolean),
  );
}

export function isEmailBetaAllowlisted(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const normalized = normalizeBetaEmail(email);

  if (!normalized) {
    return false;
  }

  return getBetaAllowedEmails(env).has(normalized);
}

export async function canSignInToBeta(email: string | null | undefined) {
  const normalized = normalizeBetaEmail(email);

  if (!normalized) {
    return false;
  }

  if (!isBetaInviteRequired()) {
    return true;
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalized,
        mode: "insensitive",
      },
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (existingUser) {
    return true;
  }

  return isEmailBetaAllowlisted(normalized);
}
