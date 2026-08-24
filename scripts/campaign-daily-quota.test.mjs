import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import {
  CLAIMED_NOT_SENT,
  DAILY_LIMIT_REACHED,
  PROVIDER_CALL_STARTED,
  UNKNOWN_PROVIDER_RESULT,
  claimNextPendingMessage,
  getZonedDateKey,
  reserveDailyQuotaAndMarkProviderCallStarted,
} from "./campaign-worker-safety.mjs";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const MOCK_ENV = {
  REAL_SENDING_ENABLED: "false",
  EVOLUTION_MOCK: "false",
  MOCK_WHATSAPP_ENABLED: "true",
};

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

async function createWorkspace(label, timezone = "America/Lima") {
  const id = `ws_quota_${label}_${suffix()}`;
  const workspace = await db.workspace.create({
    data: {
      id,
      name: `Quota ${label}`,
      slug: `quota-${label}-${suffix()}`,
      timezone,
    },
  });
  return workspace;
}

async function createCampaignAndMessage(workspaceId, label) {
  const campaign = await db.campaign.create({
    data: {
      workspaceId,
      name: `Quota campaign ${label}`,
      status: "RUNNING",
    },
  });
  const message = await db.campaignMessage.create({
    data: {
      workspaceId,
      campaignId: campaign.id,
      recipientPhone: `+519${Math.floor(10000000 + Math.random() * 89999999)}`,
      messageTemplate: `Quota ${label}`,
      idempotencyKey: `quota-${label}-${randomUUID()}`,
      consentStatus: "EXPLICITLY_GRANTED",
      optInStatus: "CONFIRMED",
      status: "PENDING",
    },
  });
  return { campaign, message };
}

describe("daily quota date keys", () => {
  it("uses the workspace local calendar date", () => {
    const instant = new Date("2026-08-24T04:30:00.000Z");
    expect(getZonedDateKey(instant, "America/Lima")).toBe("2026-08-23");
    expect(getZonedDateKey(instant, "UTC")).toBe("2026-08-24");
  });

  it("remains calendar-correct around New York DST", () => {
    expect(
      getZonedDateKey(new Date("2026-03-08T04:30:00.000Z"), "America/New_York"),
    ).toBe("2026-03-07");
    expect(
      getZonedDateKey(new Date("2026-03-08T07:30:00.000Z"), "America/New_York"),
    ).toBe("2026-03-08");
  });
});

describeWithDatabase("atomic daily campaign quota", () => {
  const workspaceIds = [];

  afterAll(async () => {
    if (workspaceIds.length > 0) {
      await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }
    await db.$disconnect();
  });

  async function workspace(label, timezone) {
    const created = await createWorkspace(label, timezone);
    workspaceIds.push(created.id);
    return created;
  }

  it("allows exactly one of two campaigns to reserve the last daily slot", async () => {
    const ws = await workspace("concurrent");
    const first = await createCampaignAndMessage(ws.id, "concurrent-a");
    const second = await createCampaignAndMessage(ws.id, "concurrent-b");
    const firstClaim = await claimNextPendingMessage(db, first.campaign);
    const secondClaim = await claimNextPendingMessage(db, second.campaign);
    expect(firstClaim).not.toBeNull();
    expect(secondClaim).not.toBeNull();

    const now = new Date("2026-08-24T18:00:00.000Z");
    const results = await Promise.all([
      reserveDailyQuotaAndMarkProviderCallStarted(db, firstClaim, {
        dailyLimit: 1,
        quotaTimezone: ws.timezone,
        now,
        env: MOCK_ENV,
      }),
      reserveDailyQuotaAndMarkProviderCallStarted(db, secondClaim, {
        dailyLimit: 1,
        quotaTimezone: ws.timezone,
        now,
        env: MOCK_ENV,
      }),
    ]);

    expect(results.filter((result) => result.started)).toHaveLength(1);
    expect(results.filter((result) => result.reason === DAILY_LIMIT_REACHED)).toHaveLength(1);

    const messages = await db.campaignMessage.findMany({
      where: { workspaceId: ws.id },
      orderBy: { createdAt: "asc" },
    });
    expect(messages.filter((item) => item.lastErrorCode === PROVIDER_CALL_STARTED)).toHaveLength(1);
    expect(messages.filter((item) => item.lastErrorCode === DAILY_LIMIT_REACHED)).toHaveLength(1);
    expect(messages.filter((item) => item.dailyQuotaReservedAt && !item.dailyQuotaReleasedAt)).toHaveLength(1);
    expect(messages.find((item) => item.lastErrorCode === DAILY_LIMIT_REACHED)?.attemptCount).toBe(0);
  });

  it("counts legacy SENT rows without reservations during migration", async () => {
    const ws = await workspace("legacy");
    const legacy = await createCampaignAndMessage(ws.id, "legacy-sent");
    await db.campaignMessage.update({
      where: { id: legacy.message.id },
      data: {
        status: "SENT",
        sentAt: new Date("2026-08-24T16:00:00.000Z"),
      },
    });

    const next = await createCampaignAndMessage(ws.id, "legacy-next");
    const claim = await claimNextPendingMessage(db, next.campaign);
    const result = await reserveDailyQuotaAndMarkProviderCallStarted(db, claim, {
      dailyLimit: 1,
      quotaTimezone: ws.timezone,
      now: new Date("2026-08-24T18:00:00.000Z"),
      env: MOCK_ENV,
    });

    expect(result).toMatchObject({
      started: false,
      reason: DAILY_LIMIT_REACHED,
      usedBefore: 1,
    });
  });

  it("a released known-NOT_SENT reservation makes the slot available again", async () => {
    const ws = await workspace("release");
    const first = await createCampaignAndMessage(ws.id, "release-first");
    const firstClaim = await claimNextPendingMessage(db, first.campaign);
    const now = new Date("2026-08-24T18:00:00.000Z");
    const reserved = await reserveDailyQuotaAndMarkProviderCallStarted(db, firstClaim, {
      dailyLimit: 1,
      quotaTimezone: ws.timezone,
      now,
      env: MOCK_ENV,
    });
    expect(reserved.started).toBe(true);

    await db.campaignMessage.update({
      where: { id: first.message.id },
      data: {
        status: "FAILED",
        lastErrorCode: "PROVIDER_REJECTED",
        dailyQuotaReleasedAt: new Date("2026-08-24T18:01:00.000Z"),
      },
    });

    const second = await createCampaignAndMessage(ws.id, "release-second");
    const secondClaim = await claimNextPendingMessage(db, second.campaign);
    const secondReservation = await reserveDailyQuotaAndMarkProviderCallStarted(
      db,
      secondClaim,
      {
        dailyLimit: 1,
        quotaTimezone: ws.timezone,
        now: new Date("2026-08-24T18:02:00.000Z"),
        env: MOCK_ENV,
      },
    );

    expect(secondReservation).toMatchObject({ started: true, usedBefore: 0 });
  });

  it("keeps an UNKNOWN provider result consuming its reserved slot", async () => {
    const ws = await workspace("unknown-held");
    const first = await createCampaignAndMessage(ws.id, "unknown-first");
    const firstClaim = await claimNextPendingMessage(db, first.campaign);
    const now = new Date("2026-08-24T18:00:00.000Z");
    expect(
      (
        await reserveDailyQuotaAndMarkProviderCallStarted(db, firstClaim, {
          dailyLimit: 1,
          quotaTimezone: ws.timezone,
          now,
          env: MOCK_ENV,
        })
      ).started,
    ).toBe(true);

    await db.campaignMessage.update({
      where: { id: first.message.id },
      data: {
        status: "FAILED",
        lastErrorCode: UNKNOWN_PROVIDER_RESULT,
      },
    });

    const second = await createCampaignAndMessage(ws.id, "unknown-second");
    const secondClaim = await claimNextPendingMessage(db, second.campaign);
    const result = await reserveDailyQuotaAndMarkProviderCallStarted(db, secondClaim, {
      dailyLimit: 1,
      quotaTimezone: ws.timezone,
      now: new Date("2026-08-24T18:02:00.000Z"),
      env: MOCK_ENV,
    });

    expect(result).toMatchObject({
      started: false,
      reason: DAILY_LIMIT_REACHED,
      usedBefore: 1,
    });
  });

  it("starts a fresh quota bucket on the next workspace-local day", async () => {
    const ws = await workspace("next-day");
    const first = await createCampaignAndMessage(ws.id, "day-one");
    const firstClaim = await claimNextPendingMessage(db, first.campaign);
    expect(
      (
        await reserveDailyQuotaAndMarkProviderCallStarted(db, firstClaim, {
          dailyLimit: 1,
          quotaTimezone: ws.timezone,
          now: new Date("2026-08-24T23:00:00.000Z"),
          env: MOCK_ENV,
        })
      ).started,
    ).toBe(true);

    const second = await createCampaignAndMessage(ws.id, "day-two");
    const secondClaim = await claimNextPendingMessage(db, second.campaign);
    const nextDay = await reserveDailyQuotaAndMarkProviderCallStarted(db, secondClaim, {
      dailyLimit: 1,
      quotaTimezone: ws.timezone,
      now: new Date("2026-08-25T06:00:00.000Z"),
      env: MOCK_ENV,
    });

    expect(nextDay).toMatchObject({
      started: true,
      quotaDate: "2026-08-25",
      usedBefore: 0,
    });
  });

  it("never creates a quota reservation when provider config fails preflight", async () => {
    const ws = await workspace("config-failure");
    const target = await createCampaignAndMessage(ws.id, "config-failure");
    const claim = await claimNextPendingMessage(db, target.campaign);
    expect(claim.lastErrorCode).toBe(CLAIMED_NOT_SENT);

    const result = await reserveDailyQuotaAndMarkProviderCallStarted(db, claim, {
      dailyLimit: 1,
      quotaTimezone: ws.timezone,
      now: new Date("2026-08-24T18:00:00.000Z"),
      env: {
        REAL_SENDING_ENABLED: "true",
        EVOLUTION_MOCK: "false",
        MOCK_WHATSAPP_ENABLED: "false",
        EVOLUTION_API_BASE_URL: "",
        EVOLUTION_API_KEY: "",
      },
    });

    expect(result).toMatchObject({ started: false, reason: "PROVIDER_CONFIG_ERROR" });
    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: target.message.id },
    });
    expect(saved.status).toBe("FAILED");
    expect(saved.attemptCount).toBe(0);
    expect(saved.dailyQuotaDate).toBeNull();
    expect(saved.dailyQuotaReservedAt).toBeNull();
    expect(saved.dailyQuotaReleasedAt).toBeNull();
  });
});
