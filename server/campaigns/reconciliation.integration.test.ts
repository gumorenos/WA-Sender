import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  CampaignReconciliationError,
  reconcileUnknownCampaignMessage,
} from "@/server/campaigns/reconciliation";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function uniqueEmail() {
  return `reconciliation-${randomUUID()}@example.test`;
}

describeWithDatabase("campaign unknown provider reconciliation", () => {
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        email: uniqueEmail(),
        status: "ACTIVE",
      },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Reconciliation ${randomUUID()}`,
        slug: `reconciliation-${randomUUID()}`,
      },
    });
    workspaceId = workspace.id;
  });

  afterEach(async () => {
    await db.campaign.deleteMany({ where: { workspaceId } });
    await db.auditLog.deleteMany({
      where: {
        workspaceId,
        resourceType: "campaign_message_reconciliation",
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  async function createUnknownMessage(params?: {
    campaignStatus?: "FAILED" | "PAUSED" | "STOPPED";
    lastErrorCode?: string;
    providerMessageId?: string | null;
  }) {
    const campaign = await db.campaign.create({
      data: {
        workspaceId,
        name: `Unknown ${randomUUID()}`,
        status: params?.campaignStatus ?? "FAILED",
        totalCount: 1,
        failedCount: 1,
      },
    });

    const message = await db.campaignMessage.create({
      data: {
        workspaceId,
        campaignId: campaign.id,
        recipientPhone: "+51999999999",
        messageTemplate: "Mensaje con resultado incierto",
        idempotencyKey: `unknown-${randomUUID()}`,
        status: "FAILED",
        attemptCount: 1,
        lastErrorCode: params?.lastErrorCode ?? "UNKNOWN_PROVIDER_RESULT",
        lastErrorMessage: "No se pudo determinar el resultado del proveedor.",
        providerMessageId: params?.providerMessageId ?? null,
        consentStatus: "EXPLICITLY_GRANTED",
        optInStatus: "CONFIRMED",
      },
    });

    return { campaign, message };
  }

  const context = () => ({ userId, workspaceId });

  it("marks a verified sent result as SENT and completes a clean failed campaign", async () => {
    const { campaign, message } = await createUnknownMessage();

    const result = await reconcileUnknownCampaignMessage(
      campaign.id,
      message.id,
      {
        confirmed: true,
        resolution: "CONFIRMED_SENT",
        reason: "Verificado en el panel del proveedor.",
        providerMessageId: "provider-confirmed-123",
      },
      context(),
    );

    expect(result).toMatchObject({
      messageStatus: "SENT",
      campaignStatus: "COMPLETED",
      unresolvedCount: 0,
    });

    const [savedMessage, savedCampaign, reconciliationEvents, completionEvents, audits] =
      await Promise.all([
        db.campaignMessage.findUniqueOrThrow({ where: { id: message.id } }),
        db.campaign.findUniqueOrThrow({ where: { id: campaign.id } }),
        db.campaignEvent.count({
          where: {
            campaignId: campaign.id,
            messageId: message.id,
            type: "UNKNOWN_PROVIDER_RESULT_RECONCILED",
          },
        }),
        db.campaignEvent.count({
          where: {
            campaignId: campaign.id,
            type: "CAMPAIGN_COMPLETED_AFTER_RECONCILIATION",
          },
        }),
        db.auditLog.count({
          where: {
            workspaceId,
            actorUserId: userId,
            resourceType: "campaign_message_reconciliation",
            resourceId: message.id,
          },
        }),
      ]);

    expect(savedMessage.status).toBe("SENT");
    expect(savedMessage.sentAt).not.toBeNull();
    expect(savedMessage.providerMessageId).toBe("provider-confirmed-123");
    expect(savedMessage.lastErrorCode).toBe("RECONCILED_CONFIRMED_SENT");
    expect(savedCampaign.status).toBe("COMPLETED");
    expect(savedCampaign.sentCount).toBe(1);
    expect(savedCampaign.failedCount).toBe(0);
    expect(savedCampaign.pendingCount).toBe(0);
    expect(reconciliationEvents).toBe(1);
    expect(completionEvents).toBe(1);
    expect(audits).toBe(1);
  });

  it("returns a verified not-sent result to PENDING without restarting the campaign", async () => {
    const { campaign, message } = await createUnknownMessage();

    const result = await reconcileUnknownCampaignMessage(
      campaign.id,
      message.id,
      {
        confirmed: true,
        resolution: "CONFIRMED_NOT_SENT",
        reason: "Proveedor confirma que no acepto el mensaje.",
      },
      context(),
    );

    expect(result).toMatchObject({
      messageStatus: "PENDING",
      campaignStatus: "FAILED",
      unresolvedCount: 0,
    });

    const [savedMessage, savedCampaign] = await Promise.all([
      db.campaignMessage.findUniqueOrThrow({ where: { id: message.id } }),
      db.campaign.findUniqueOrThrow({ where: { id: campaign.id } }),
    ]);

    expect(savedMessage.status).toBe("PENDING");
    expect(savedMessage.sentAt).toBeNull();
    expect(savedMessage.lastErrorCode).toBe("RECONCILED_CONFIRMED_NOT_SENT");
    expect(savedCampaign.status).toBe("FAILED");
    expect(savedCampaign.pendingCount).toBe(1);
    expect(savedCampaign.failedCount).toBe(0);
    expect(savedCampaign.sentCount).toBe(0);
  });

  it("rejects messages that are not unresolved unknown provider results", async () => {
    const { campaign, message } = await createUnknownMessage({
      lastErrorCode: "SEND_RETRYABLE_EXHAUSTED",
    });

    await expect(
      reconcileUnknownCampaignMessage(
        campaign.id,
        message.id,
        {
          confirmed: true,
          resolution: "CONFIRMED_NOT_SENT",
          reason: "No corresponde reconciliar este fallo.",
        },
        context(),
      ),
    ).rejects.toMatchObject({ status: 409 });

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.status).toBe("FAILED");
    expect(saved.lastErrorCode).toBe("SEND_RETRYABLE_EXHAUSTED");
  });

  it("allows only one effective reconciliation under concurrent requests", async () => {
    const { campaign, message } = await createUnknownMessage();

    const payload = {
      confirmed: true as const,
      resolution: "CONFIRMED_SENT" as const,
      reason: "Verificacion concurrente del proveedor.",
    };

    const results = await Promise.allSettled([
      reconcileUnknownCampaignMessage(campaign.id, message.id, payload, context()),
      reconcileUnknownCampaignMessage(campaign.id, message.id, payload, context()),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(CampaignReconciliationError);
    expect(rejected[0].reason.status).toBe(409);

    expect(
      await db.campaignEvent.count({
        where: {
          campaignId: campaign.id,
          messageId: message.id,
          type: "UNKNOWN_PROVIDER_RESULT_RECONCILED",
        },
      }),
    ).toBe(1);
  });

  it("does not overwrite conflicting provider evidence", async () => {
    const { campaign, message } = await createUnknownMessage({
      providerMessageId: "provider-original",
    });

    await expect(
      reconcileUnknownCampaignMessage(
        campaign.id,
        message.id,
        {
          confirmed: true,
          resolution: "CONFIRMED_SENT",
          reason: "La evidencia indica otro identificador.",
          providerMessageId: "provider-different",
        },
        context(),
      ),
    ).rejects.toMatchObject({ status: 409 });

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.providerMessageId).toBe("provider-original");
    expect(saved.lastErrorCode).toBe("UNKNOWN_PROVIDER_RESULT");
  });

  it("rejects an explicit reconciliation without a meaningful reason", async () => {
    const { campaign, message } = await createUnknownMessage();

    await expect(
      reconcileUnknownCampaignMessage(
        campaign.id,
        message.id,
        {
          confirmed: true,
          resolution: "CONFIRMED_SENT",
          reason: "corto",
        },
        context(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
