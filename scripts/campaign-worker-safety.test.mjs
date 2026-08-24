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
  recoverGlobalStaleSendingMessages,
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

  beforeAll(async () => {
    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `Worker QA ${runId}`,
        slug: `worker-qa-${runId}`,
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  async function createCampaignAndMessage(label, status = "RUNNING") {
    const campaignId = `campaign_${label}_${suffix()}`;
    const campaign = await db.campaign.create({
      data: {
        id: campaignId,
        workspaceId,
        name: `Campaign ${label}`,
        status,
      },
    });
    const message = await db.campaignMessage.create({
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

    return { campaign, message };
  }

  async function makeClaimStale(messageId, value = "2026-01-01T00:00:00.000Z") {
    await db.campaignMessage.update({
      where: { id: messageId },
      data: { updatedAt: new Date(value) },
    });
  }

  it("allows only one atomic claimant for the same pending message", async () => {
    const { campaign, message } = await createCampaignAndMessage("claim");

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
    const { campaign, message } = await createCampaignAndMessage("recover-safe");

    await claimNextPendingMessage(db, campaign);
    await makeClaimStale(message.id);

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

  it("cancels a stale pre-provider claim when the campaign was stopped", async () => {
    const { campaign, message } = await createCampaignAndMessage(
      "recover-stopped",
      "STOPPED",
    );

    await claimNextPendingMessage(db, campaign);
    await makeClaimStale(message.id);

    const recovered = await recoverStaleSendingMessages(db, campaign, {
      now: new Date("2026-01-01T00:20:00.000Z"),
      staleAfterMs: 10 * 60_000,
    });

    expect(recovered).toEqual([
      { id: message.id, action: "CANCELLED_STOPPED_CLAIM" },
    ]);

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.status).toBe("CANCELLED");
    expect(saved.lastErrorCode).toBe("CAMPAIGN_STOPPED");
  });

  it("quarantines stale messages after provider call started", async () => {
    const { campaign, message } = await createCampaignAndMessage(
      "recover-unknown",
    );

    const claimed = await claimNextPendingMessage(db, campaign);
    expect(claimed).not.toBeNull();
    expect(await markProviderCallStarted(db, claimed)).toBe(true);

    await makeClaimStale(message.id);

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

  it("globally recovers a stale pre-provider claim while preserving PAUSED", async () => {
    const { campaign, message } = await createCampaignAndMessage(
      "global-paused",
      "PAUSED",
    );
    await claimNextPendingMessage(db, campaign);
    await makeClaimStale(message.id);

    const result = await recoverGlobalStaleSendingMessages(db, {
      now: new Date("2026-01-01T00:20:00.000Z"),
      staleAfterMs: 10 * 60_000,
    });

    expect(result.recovered).toContainEqual({
      id: message.id,
      workspaceId,
      campaignId: campaign.id,
      campaignStatus: "PAUSED",
      action: "RESET_TO_PENDING",
    });

    const [savedMessage, savedCampaign] = await Promise.all([
      db.campaignMessage.findUniqueOrThrow({ where: { id: message.id } }),
      db.campaign.findUniqueOrThrow({ where: { id: campaign.id } }),
    ]);
    expect(savedMessage.status).toBe("PENDING");
    expect(savedMessage.lastErrorCode).toBe("CLAIM_RECOVERED");
    expect(savedCampaign.status).toBe("PAUSED");
  });

  it("globally cancels a stale pre-provider claim for STOPPED", async () => {
    const { campaign, message } = await createCampaignAndMessage(
      "global-stopped",
      "STOPPED",
    );
    await claimNextPendingMessage(db, campaign);
    await makeClaimStale(message.id);

    const result = await recoverGlobalStaleSendingMessages(db, {
      now: new Date("2026-01-01T00:20:00.000Z"),
      staleAfterMs: 10 * 60_000,
    });

    expect(result.recovered).toContainEqual({
      id: message.id,
      workspaceId,
      campaignId: campaign.id,
      campaignStatus: "STOPPED",
      action: "CANCELLED_STOPPED_CLAIM",
    });

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.status).toBe("CANCELLED");
    expect(saved.lastErrorCode).toBe("CAMPAIGN_STOPPED");
  });

  it("globally quarantines post-provider stale work while preserving FAILED", async () => {
    const { campaign, message } = await createCampaignAndMessage(
      "global-failed-unknown",
      "FAILED",
    );
    const claimed = await claimNextPendingMessage(db, campaign);
    expect(claimed).not.toBeNull();
    expect(await markProviderCallStarted(db, claimed)).toBe(true);
    await makeClaimStale(message.id);

    const result = await recoverGlobalStaleSendingMessages(db, {
      now: new Date("2026-01-01T00:20:00.000Z"),
      staleAfterMs: 10 * 60_000,
    });

    expect(result.recovered).toContainEqual({
      id: message.id,
      workspaceId,
      campaignId: campaign.id,
      campaignStatus: "FAILED",
      action: "QUARANTINED_UNKNOWN",
    });

    const [savedMessage, savedCampaign] = await Promise.all([
      db.campaignMessage.findUniqueOrThrow({ where: { id: message.id } }),
      db.campaign.findUniqueOrThrow({ where: { id: campaign.id } }),
    ]);
    expect(savedMessage.status).toBe("FAILED");
    expect(savedMessage.lastErrorCode).toBe(UNKNOWN_PROVIDER_RESULT);
    expect(savedCampaign.status).toBe("FAILED");
  });

  it("global sweep leaves fresh and excluded campaign states untouched", async () => {
    const paused = await createCampaignAndMessage("global-fresh", "PAUSED");
    const completed = await createCampaignAndMessage(
      "global-completed",
      "COMPLETED",
    );
    const draft = await createCampaignAndMessage("global-draft", "DRAFT");

    await claimNextPendingMessage(db, paused.campaign);
    await claimNextPendingMessage(db, completed.campaign);
    await claimNextPendingMessage(db, draft.campaign);
    await makeClaimStale(completed.message.id);
    await makeClaimStale(draft.message.id);

    const result = await recoverGlobalStaleSendingMessages(db, {
      now: new Date("2026-01-01T00:20:00.000Z"),
      staleAfterMs: 10 * 60_000,
    });

    expect(result.recovered.some((item) => item.id === paused.message.id)).toBe(false);
    expect(result.recovered.some((item) => item.id === completed.message.id)).toBe(false);
    expect(result.recovered.some((item) => item.id === draft.message.id)).toBe(false);

    const messages = await db.campaignMessage.findMany({
      where: {
        id: { in: [paused.message.id, completed.message.id, draft.message.id] },
      },
      select: { id: true, status: true },
    });
    expect(messages.every((item) => item.status === "SENDING")).toBe(true);
  });

  it("allows only one effective transition across concurrent global sweeps", async () => {
    const { campaign, message } = await createCampaignAndMessage(
      "global-concurrent",
      "PAUSED",
    );
    await claimNextPendingMessage(db, campaign);
    await makeClaimStale(message.id);

    const results = await Promise.all([
      recoverGlobalStaleSendingMessages(db, {
        now: new Date("2026-01-01T00:20:00.000Z"),
        staleAfterMs: 10 * 60_000,
      }),
      recoverGlobalStaleSendingMessages(db, {
        now: new Date("2026-01-01T00:20:00.000Z"),
        staleAfterMs: 10 * 60_000,
      }),
    ]);

    const wins = results
      .flatMap((result) => result.recovered)
      .filter((item) => item.id === message.id);
    expect(wins).toHaveLength(1);

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.status).toBe("PENDING");
    expect(saved.lastErrorCode).toBe("CLAIM_RECOVERED");
  });
});
