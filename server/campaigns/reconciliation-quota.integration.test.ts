import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reconcileUnknownCampaignMessage } from "@/server/campaigns/reconciliation";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function uniqueEmail() {
  return `reconciliation-quota-${randomUUID()}@example.test`;
}

describeWithDatabase("unknown reconciliation daily quota semantics", () => {
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: { email: uniqueEmail(), status: "ACTIVE" },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Reconciliation quota ${randomUUID()}`,
        slug: `reconciliation-quota-${randomUUID()}`,
        timezone: "America/Lima",
      },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  async function createReservedUnknown(label: string, releasedAt: Date | null = null) {
    const campaign = await db.campaign.create({
      data: {
        workspaceId,
        name: `Quota reconcile ${label}`,
        status: "FAILED",
        totalCount: 1,
        failedCount: 1,
      },
    });
    const message = await db.campaignMessage.create({
      data: {
        workspaceId,
        campaignId: campaign.id,
        recipientPhone: "+51999999999",
        messageTemplate: "Resultado incierto con cuota",
        idempotencyKey: `quota-reconcile-${label}-${randomUUID()}`,
        status: "FAILED",
        attemptCount: 1,
        lastErrorCode: "UNKNOWN_PROVIDER_RESULT",
        lastErrorMessage: "Resultado incierto.",
        consentStatus: "EXPLICITLY_GRANTED",
        optInStatus: "CONFIRMED",
        dailyQuotaDate: "2026-08-24",
        dailyQuotaReservedAt: new Date("2026-08-24T18:00:00.000Z"),
        dailyQuotaReleasedAt: releasedAt,
      },
    });
    return { campaign, message };
  }

  const context = () => ({ userId, workspaceId });

  it("releases an active quota reservation when operator confirms NOT_SENT", async () => {
    const { campaign, message } = await createReservedUnknown("not-sent");

    const result = await reconcileUnknownCampaignMessage(
      campaign.id,
      message.id,
      {
        confirmed: true,
        resolution: "CONFIRMED_NOT_SENT",
        reason: "Proveedor confirma que el request no fue aceptado.",
      },
      context(),
    );

    expect(result).toMatchObject({
      resolution: "CONFIRMED_NOT_SENT",
      messageStatus: "PENDING",
      quotaReleased: true,
      quotaReconsumed: false,
    });

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.dailyQuotaReservedAt).not.toBeNull();
    expect(saved.dailyQuotaReleasedAt).not.toBeNull();
  });

  it("keeps an active quota reservation consumed when operator confirms SENT", async () => {
    const { campaign, message } = await createReservedUnknown("sent");

    const result = await reconcileUnknownCampaignMessage(
      campaign.id,
      message.id,
      {
        confirmed: true,
        resolution: "CONFIRMED_SENT",
        reason: "Proveedor confirma entrega del mensaje incierto.",
        providerMessageId: "provider-quota-confirmed",
      },
      context(),
    );

    expect(result).toMatchObject({
      resolution: "CONFIRMED_SENT",
      messageStatus: "SENT",
      quotaReleased: false,
      quotaReconsumed: false,
    });

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.dailyQuotaReservedAt).not.toBeNull();
    expect(saved.dailyQuotaReleasedAt).toBeNull();
  });

  it("re-consumes a defensively released reservation when evidence confirms SENT", async () => {
    const { campaign, message } = await createReservedUnknown(
      "sent-reconsume",
      new Date("2026-08-24T18:01:00.000Z"),
    );

    const result = await reconcileUnknownCampaignMessage(
      campaign.id,
      message.id,
      {
        confirmed: true,
        resolution: "CONFIRMED_SENT",
        reason: "Evidencia posterior confirma que el proveedor si envio.",
      },
      context(),
    );

    expect(result).toMatchObject({
      quotaReleased: false,
      quotaReconsumed: true,
    });

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.dailyQuotaReleasedAt).toBeNull();
  });
});
