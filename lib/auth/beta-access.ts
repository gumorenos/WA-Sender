import { prisma } from "@/lib/db";

type BetaAccessEnv = {
  BETA_REQUIRE_INVITE?: string;
  BETA_ALLOWED_EMAILS?: string;
};

function currentBetaAccessEnv(): BetaAccessEnv {
  return {
    BETA_REQUIRE_INVITE: process.env.BETA_REQUIRE_INVITE,
    BETA_ALLOWED_EMAILS: process.env.BETA_ALLOWED_EMAILS,
  };
}

export function normalizeBetaEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isBetaInviteRequired(env?: BetaAccessEnv) {
  const resolvedEnv = env ?? currentBetaAccessEnv();
  return resolvedEnv.BETA_REQUIRE_INVITE !== "false";
}

export function getBetaAllowedEmails(env?: BetaAccessEnv) {
  const resolvedEnv = env ?? currentBetaAccessEnv();

  return new Set(
    (resolvedEnv.BETA_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((value) => normalizeBetaEmail(value))
      .filter(Boolean),
  );
}

export function isEmailBetaAllowlisted(
  email: string | null | undefined,
  env?: BetaAccessEnv,
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
