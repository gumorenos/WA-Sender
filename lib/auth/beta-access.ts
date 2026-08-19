import { prisma } from "@/lib/db";

type BetaAccessEnv = {
  BETA_REQUIRE_INVITE?: string;
  BETA_ALLOWED_EMAILS?: string;
};

export function normalizeBetaEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isBetaInviteRequired(env: BetaAccessEnv = process.env) {
  return env.BETA_REQUIRE_INVITE !== "false";
}

export function getBetaAllowedEmails(env: BetaAccessEnv = process.env) {
  return new Set(
    (env.BETA_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((value) => normalizeBetaEmail(value))
      .filter(Boolean),
  );
}

export function isEmailBetaAllowlisted(
  email: string | null | undefined,
  env: BetaAccessEnv = process.env,
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

  const existingUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalized,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existingUser) {
    return existingUser.status === "ACTIVE";
  }

  if (!isBetaInviteRequired()) {
    return true;
  }

  return isEmailBetaAllowlisted(normalized);
}
