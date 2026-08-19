import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CLAIMED_NOT_SENT,
  PROVIDER_CALL_STARTED,
  UNKNOWN_PROVIDER_RESULT,
  campaignJobId,
  claimNextPendingMessage,
  getZonedDayRange,
  markProviderCallStarted,
  recoverStaleSendingMessages,
} from "./campaign-worker-safety.mjs";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describe("campaign worker pure safety helpers", () => {
  it("uses a stable queue job id", () => {
    expect(campaignJobId("abc123")).toBe("campaign-abc123");
    expect(campaignJobId("abc123")).toBe(campaignJobId("abc123"));
  });

  it("computes a Lima local day as UTC 05:00 boundaries", () => {
    const range = getZonedDayRange(
      new Date("2026-08-18T18:00:00.000Z"),
      "America/Lima",
    );

    expect(range.start.toISOString()).toBe("2026-08-18T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-19T05:00:00.000Z");
  });

  it("honors daylight saving changes for New York", () => {
    const summer = getZonedDayRange(
      new Date("2026-07-01T16:00:00.000Z"),
      "America/New_York",
    );
    const winter = getZonedDayRange(
      new Date("2026-01-15T16:00:00.000Z"),
      "America/New_York",
    );

    expect(summer.start.toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(summer.end.toISOString()).toBe("2026-07-02T04:00:00.000Z");
    expect(winter.start.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(winter.end.toISOString()).toBe("2026-01-16T05:00:00.000Z");
  });
});

describeWithDatabase("campaign worker database safety", () => {
  const runId = suffix();
  const workspaceId = `ws_worker_${runId}`;
  const campaignId = `campaign_worker_${runId}`;

  beforeAll(async () => {
    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `Worker QA ${runId}`,
        slug: `worker-qa-${runId}`,
      },
    });

    await db.campaign.create({
      data: {
        id: campaignId,
        workspaceId,
        name: `Campaign worker QA ${runId}`,
        status: "RUNNING",
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  async function createMessage(label) {
    return db.campaignMessage.create({
      data: {
        workspaceId,
        campaignId,
        recipientPhone: `+519${Math.floor(10000000 + Math.random() * 89999999)}`,
        messageTemplate: `Mensaje ${label}`,
        idempotencyKey: `worker-${runId}-${label}-${randomUUID()}`,
        consentStatus: "EXPLICITLY_GRANTED",
        optInStatus: "CONFIRMED",
        status: "PENDING",
      },
    });
  }

  it("allows only one atomic claimant for the same pending message", async () => {
    const message = await createMessage("claim");
    const campaign = { id: campaignId, workspaceId };

    const results = await Promise.all([
      claimNextPendingMessage(db, campaign),
      claimNextPendingMessage(db, campaign),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.status).toBe("SENDING");
    expect(saved.lastErrorCode).toBe(CLAIMED_NOT_SENT);
  });

  it("recovers a stale claim only when provider was not started", async () => {
    const message = await createMessage("recover-safe");
    const campaign = { id: campaignId, workspaceId };

    await claimNextPendingMessage(db, campaign);
    await db.campaignMessage.update({
      where: { id: message.id },
      data: { updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    const recovered = await recoverStaleSendingMessages(db, campaign, {
      now: new Date("2026-01-01T00:20:00.000Z"),
      staleAfterMs: 10 * 60_000,
    });

    expect(recovered).toEqual([
      { id: message.id, action: "RESET_TO_PENDING" },
    ]);

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.status).toBe("PENDING");
    expect(saved.lastErrorCode).toBe("CLAIM_RECOVERED");
  });

  it("quarantines stale messages after provider call started", async () => {
    const message = await createMessage("recover-unknown");
    const campaign = { id: campaignId, workspaceId };

    const claimed = await claimNextPendingMessage(db, campaign);
    expect(claimed).not.toBeNull();
    expect(await markProviderCallStarted(db, claimed)).toBe(true);

    await db.campaignMessage.update({
      where: { id: message.id },
      data: { updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    const recovered = await recoverStaleSendingMessages(db, campaign, {
      now: new Date("2026-01-01T00:20:00.000Z"),
      staleAfterMs: 10 * 60_000,
    });

    expect(recovered).toEqual([
      { id: message.id, action: "QUARANTINED_UNKNOWN" },
    ]);

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.status).toBe("FAILED");
    expect(saved.lastErrorCode).toBe(UNKNOWN_PROVIDER_RESULT);
    expect(saved.attemptCount).toBe(1);
    expect(saved.lastErrorCode).not.toBe(PROVIDER_CALL_STARTED);
  });
});
