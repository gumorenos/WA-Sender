import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  canSignInToBeta,
  getBetaAllowedEmails,
  isBetaInviteRequired,
  isEmailBetaAllowlisted,
  normalizeBetaEmail,
} from "@/lib/auth/beta-access";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const originalRequireInvite = process.env.BETA_REQUIRE_INVITE;
const originalAllowedEmails = process.env.BETA_ALLOWED_EMAILS;
const createdEmails = new Set<string>();

function testEmail(label: string) {
  const email = `${label}-${randomUUID()}@example.test`.toLowerCase();
  createdEmails.add(email);
  return email;
}

function restoreEnv() {
  if (originalRequireInvite === undefined) {
    delete process.env.BETA_REQUIRE_INVITE;
  } else {
    process.env.BETA_REQUIRE_INVITE = originalRequireInvite;
  }

  if (originalAllowedEmails === undefined) {
    delete process.env.BETA_ALLOWED_EMAILS;
  } else {
    process.env.BETA_ALLOWED_EMAILS = originalAllowedEmails;
  }
}

describe("closed beta config helpers", () => {
  it("normalizes emails and parses allowlist values", () => {
    const env = {
      BETA_ALLOWED_EMAILS: " First@Example.com,second@example.com ,, ",
    };

    expect(normalizeBetaEmail("  First@Example.com ")).toBe("first@example.com");
    expect(getBetaAllowedEmails(env)).toEqual(
      new Set(["first@example.com", "second@example.com"]),
    );
    expect(isEmailBetaAllowlisted("FIRST@example.com", env)).toBe(true);
  });

  it("requires an invite unless explicitly disabled", () => {
    expect(isBetaInviteRequired({})).toBe(true);
    expect(isBetaInviteRequired({ BETA_REQUIRE_INVITE: "false" })).toBe(false);
  });
});

describeWithDatabase("closed beta database policy", () => {
  beforeEach(() => {
    process.env.BETA_REQUIRE_INVITE = "true";
    process.env.BETA_ALLOWED_EMAILS = "";
  });

  afterEach(async () => {
    if (createdEmails.size > 0) {
      await db.user.deleteMany({
        where: {
          email: { in: [...createdEmails] },
        },
      });
      createdEmails.clear();
    }
    restoreEnv();
  });

  afterAll(async () => {
    restoreEnv();
    await db.$disconnect();
  });

  it("allows an existing ACTIVE user even when not allowlisted", async () => {
    const email = testEmail("active");
    await db.user.create({ data: { email, status: "ACTIVE" } });

    await expect(canSignInToBeta(email)).resolves.toBe(true);
  });

  it("denies an existing SUSPENDED user even when allowlisted", async () => {
    const email = testEmail("suspended");
    await db.user.create({ data: { email, status: "SUSPENDED" } });
    process.env.BETA_ALLOWED_EMAILS = email;

    await expect(canSignInToBeta(email)).resolves.toBe(false);
  });

  it("denies a new account that is not allowlisted", async () => {
    const email = testEmail("unknown");

    await expect(canSignInToBeta(email)).resolves.toBe(false);
  });

  it("allows a new account that is explicitly allowlisted", async () => {
    const email = testEmail("allowed");
    process.env.BETA_ALLOWED_EMAILS = email.toUpperCase();

    await expect(canSignInToBeta(email)).resolves.toBe(true);
  });

  it("allows a new account when the beta gate is deliberately disabled", async () => {
    const email = testEmail("open");
    process.env.BETA_REQUIRE_INVITE = "false";

    await expect(canSignInToBeta(email)).resolves.toBe(true);
  });
});
