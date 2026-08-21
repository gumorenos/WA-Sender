import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { closeCampaignQueue, getCampaignJobId, getCampaignQueue } from "@/lib/campaigns/queue";
import {
  CampaignControlError,
  startCampaign,
} from "@/server/campaigns/control";

const db = new PrismaClient();
const describeWithServices =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

function uniqueEmail() {
  return `worker-${randomUUID()}@example.test`;
}

describeWithServices("campaign control concurrency", () => {
  let workspaceId: string;
  let userId: string;
  let instanceId: string;
  let planId: string;

  beforeAll(async () => {
    process.env.REAL_SENDING_ENABLED = "false";

    const user = await db.user.create({
      data: {
        email: uniqueEmail(),
        status: "ACTIVE",
      },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Campaign control ${randomUUID()}`,
        slug: `campaign-control-${randomUUID()}`,
      },
    });
    workspaceId = workspace.id;

    const plan = await db.plan.create({
      data: {
        code: `campaign-control-${randomUUID()}`,
        name: "Campaign control QA",
        maxActiveCampaigns: 10,
        minDelaySeconds: 45,
        allowRealSending: false,
      },
    });
    planId = plan.id;

    await db.subscription.create({
      data: {
        workspaceId,
        planId,
        status: "ACTIVE",
      },
    });

    const instance = await db.whatsAppInstance.create({
      data: {
        workspaceId,
        name: "Evolution QA",
        provider: "EVOLUTION",
        providerInstanceId: `evo-${randomUUID()}`,
        status: "ACTIVE",
      },
    });
    instanceId = instance.id;
  });

  afterEach(async () => {
    await db.plan.update({
      where: { id: planId },
      data: { maxActiveCampaigns: 10 },
    });
    await db.campaign.updateMany({
      where: {
        workspaceId,
        status: { in: ["RUNNING", "SCHEDULED", "PAUSED"] },
      },
      data: { status: "STOPPED" },
    });

    const queue = getCampaignQueue();
    if (queue) {
      const jobs = await queue.getJobs(["waiting", "delayed", "active", "completed", "failed"]);
      await Promise.all(
        jobs
          .filter((job) => String(job.id).startsWith("campaign-"))
          .map((job) => job.remove().catch(() => undefined)),
      );
    }
  });

  afterAll(async () => {
    await closeCampaignQueue();
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.plan.deleteMany({ where: { id: planId } });
    await db.$disconnect();
  });

  const startInput = () => ({
    instanceId,
    scheduledStartAt: new Date(Date.now() - 1000).toISOString(),
    activeWindowStart: "09:00",
    activeWindowEnd: "18:00",
    timezone: "America/Lima",
    delaySeconds: 45,
    consentAttested: true,
    consentSource: "CRM_IMPORT" as const,
    consentReference: "QA consentimiento concurrente",
  });

  async function createCampaignWithMessage(params?: {
    campaignStatus?: "DRAFT" | "FAILED";
    messageStatus?: "PENDING" | "FAILED";
    lastErrorCode?: string;
  }) {
    const campaign = await db.campaign.create({
      data: {
        workspaceId,
        name: `Campaign ${randomUUID()}`,
        status: params?.campaignStatus ?? "DRAFT",
      },
    });

    const message = await db.campaignMessage.create({
      data: {
        workspaceId,
        campaignId: campaign.id,
        recipientPhone: "+51999999999",
        messageTemplate: "Mensaje de QA",
        idempotencyKey: `control-${randomUUID()}`,
        consentStatus: "UNKNOWN",
        optInStatus: "UNKNOWN",
        status: params?.messageStatus ?? "PENDING",
        lastErrorCode: params?.lastErrorCode,
      },
    });

    return { campaign, message };
  }

  it("allows only one effective start under concurrent requests", async () => {
    const { campaign, message } = await createCampaignWithMessage();
    const context = { userId, workspaceId };

    const results = await Promise.allSettled([
      startCampaign(campaign.id, startInput(), context),
      startCampaign(campaign.id, startInput(), context),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      CampaignControlError,
    );
    expect((rejected[0] as PromiseRejectedResult).reason.status).toBe(409);

    const [savedCampaign, savedMessage, startedEvents, consentEvents] =
      await Promise.all([
        db.campaign.findUniqueOrThrow({ where: { id: campaign.id } }),
        db.campaignMessage.findUniqueOrThrow({ where: { id: message.id } }),
        db.campaignEvent.count({
          where: { campaignId: campaign.id, type: "CAMPAIGN_STARTED" },
        }),
        db.campaignEvent.count({
          where: {
            campaignId: campaign.id,
            type: "CAMPAIGN_CONSENT_ATTESTED",
          },
        }),
      ]);

    expect(savedCampaign.status).toBe("RUNNING");
    expect(savedMessage.consentStatus).toBe("EXPLICITLY_GRANTED");
    expect(startedEvents).toBe(1);
    expect(consentEvents).toBe(1);

    const queued = await getCampaignQueue()?.getJob(getCampaignJobId(campaign.id));
    expect(queued).toBeDefined();
  });

  it("enforces maxActiveCampaigns across concurrent campaigns", async () => {
    await db.plan.update({
      where: { id: planId },
      data: { maxActiveCampaigns: 1 },
    });

    const [{ campaign: first }, { campaign: second }] = await Promise.all([
      createCampaignWithMessage(),
      createCampaignWithMessage(),
    ]);
    const context = { userId, workspaceId };

    const results = await Promise.allSettled([
      startCampaign(first.id, startInput(), context),
      startCampaign(second.id, startInput(), context),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 403,
    });

    expect(
      await db.campaign.count({
        where: {
          workspaceId,
          status: { in: ["RUNNING", "SCHEDULED", "PAUSED"] },
        },
      }),
    ).toBe(1);
  });

  it("blocks restart when a previous provider result is unresolved", async () => {
    const { campaign } = await createCampaignWithMessage({
      campaignStatus: "FAILED",
      messageStatus: "FAILED",
      lastErrorCode: "UNKNOWN_PROVIDER_RESULT",
    });

    await expect(
      startCampaign(campaign.id, startInput(), { userId, workspaceId }),
    ).rejects.toMatchObject({
      status: 409,
    });

    expect(
      await db.campaignEvent.count({
        where: { campaignId: campaign.id, type: "CAMPAIGN_STARTED" },
      }),
    ).toBe(0);
  });

  it("resets only explicitly safe exhausted retries", async () => {
    const { campaign, message } = await createCampaignWithMessage({
      campaignStatus: "FAILED",
      messageStatus: "FAILED",
      lastErrorCode: "SEND_RETRYABLE_EXHAUSTED",
    });

    const result = await startCampaign(campaign.id, startInput(), {
      userId,
      workspaceId,
    });

    expect(result.retryResetCount).toBe(1);

    const saved = await db.campaignMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(saved.status).toBe("PENDING");
    expect(saved.lastErrorCode).toBe("RETRY_MANUALLY_CONFIRMED");
  });
});
