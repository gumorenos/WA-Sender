import type { CampaignStatus, Prisma } from "@prisma/client";

import { enqueueCampaign } from "@/lib/campaigns/queue";
import {
  campaignStartSchema,
  isScheduledStartDue,
  type CampaignStartInput,
} from "@/lib/campaigns/scheduling";
import { prisma } from "@/lib/db";
import { syncCampaignCounters } from "@/server/campaigns/counters";

type CampaignControlContext = {
  userId: string;
  workspaceId: string;
};

export class CampaignControlError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CampaignControlError";
  }
}

async function writeCampaignEvent({
  campaignId,
  payload,
  type,
  workspaceId,
}: {
  workspaceId: string;
  campaignId: string;
  type: string;
  payload?: Prisma.InputJsonValue;
}) {
  await prisma.campaignEvent.create({
    data: {
      workspaceId,
      campaignId,
      type,
      payload,
    },
  });
}

async function getOwnedCampaign(campaignId: string, workspaceId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      workspaceId,
    },
    select: {
      id: true,
      status: true,
      totalCount: true,
      pendingCount: true,
      instanceId: true,
      scheduledStartAt: true,
    },
  });

  if (!campaign) {
    throw new CampaignControlError("Campana no encontrada.", 404);
  }

  return campaign;
}

function assertStatus(
  status: CampaignStatus,
  allowed: CampaignStatus[],
  message: string,
) {
  if (!allowed.includes(status)) {
    throw new CampaignControlError(message, 409);
  }
}

export async function startCampaign(
  campaignId: string,
  rawInput: unknown,
  context: CampaignControlContext,
) {
  const parsed = campaignStartSchema.safeParse(rawInput);

  if (!parsed.success) {
    throw new CampaignControlError(
      parsed.error.issues[0]?.message ?? "Datos invalidos.",
      400,
    );
  }

  const input: CampaignStartInput = parsed.data;
  const campaign = await getOwnedCampaign(campaignId, context.workspaceId);
  assertStatus(
    campaign.status,
    ["DRAFT", "SCHEDULED", "PAUSED", "FAILED"],
    "La campana no puede iniciarse desde su estado actual.",
  );

  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      id: input.instanceId,
      workspaceId: context.workspaceId,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  if (!instance) {
    throw new CampaignControlError(
      "La instancia seleccionada no existe, no te pertenece o no esta activa.",
      403,
    );
  }

  const messageCount = await prisma.campaignMessage.count({
    where: {
      campaignId,
      workspaceId: context.workspaceId,
      status: { in: ["PENDING", "FAILED"] },
    },
  });

  if (messageCount === 0) {
    throw new CampaignControlError("La campana no tiene mensajes pendientes.", 409);
  }

  const plan =
    (
      await prisma.subscription.findUnique({
        where: { workspaceId: context.workspaceId },
        select: {
          plan: {
            select: {
              allowRealSending: true,
              minDelaySeconds: true,
            },
          },
        },
      })
    )?.plan ?? null;
  const planMinDelay = plan?.minDelaySeconds ?? 45;

  if (input.delaySeconds < planMinDelay) {
    throw new CampaignControlError(
      `El delay minimo de tu plan es ${planMinDelay} segundos.`,
      403,
    );
  }

  if (process.env.REAL_SENDING_ENABLED === "true" && !plan?.allowRealSending) {
    throw new CampaignControlError(
      "Tu plan no tiene habilitado el envio real.",
      403,
    );
  }

  const scheduledStartAt = new Date(input.scheduledStartAt);
  const nextStatus = isScheduledStartDue(scheduledStartAt) ? "RUNNING" : "SCHEDULED";

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      activeWindowEnd: input.activeWindowEnd,
      activeWindowStart: input.activeWindowStart,
      consentConfirmedAt: new Date(),
      delaySeconds: input.delaySeconds,
      instanceId: input.instanceId,
      scheduledStartAt,
      status: nextStatus,
      timezone: input.timezone,
    },
    select: {
      id: true,
      status: true,
      scheduledStartAt: true,
    },
  });

  await writeCampaignEvent({
    workspaceId: context.workspaceId,
    campaignId,
    type: "CAMPAIGN_STARTED",
    payload: {
      actorUserId: context.userId,
      status: nextStatus,
      scheduledStartAt: scheduledStartAt.toISOString(),
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      action: "STARTED",
      resourceType: "campaign",
      resourceId: campaign.id,
      metadata: {
        instanceId: input.instanceId,
        status: nextStatus,
        scheduledStartAt: scheduledStartAt.toISOString(),
        timezone: input.timezone,
        delaySeconds: input.delaySeconds,
      },
    },
  });

  const delayMs = Math.max(0, scheduledStartAt.getTime() - Date.now());
  const queue = await enqueueCampaign(campaignId, delayMs);

  return { campaign: updated, queue };
}

export async function pauseCampaign(
  campaignId: string,
  context: CampaignControlContext,
) {
  const campaign = await getOwnedCampaign(campaignId, context.workspaceId);
  assertStatus(
    campaign.status,
    ["RUNNING", "SCHEDULED"],
    "La campana no puede pausarse desde su estado actual.",
  );

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "PAUSED" },
    select: { id: true, status: true },
  });

  await writeCampaignEvent({
    workspaceId: context.workspaceId,
    campaignId,
    type: "CAMPAIGN_PAUSED",
    payload: { actorUserId: context.userId },
  });

  return { campaign: updated };
}

export async function resumeCampaign(
  campaignId: string,
  context: CampaignControlContext,
) {
  const campaign = await getOwnedCampaign(campaignId, context.workspaceId);
  assertStatus(
    campaign.status,
    ["PAUSED"],
    "La campana no puede reanudarse desde su estado actual.",
  );

  const nextStatus = isScheduledStartDue(campaign.scheduledStartAt)
    ? "RUNNING"
    : "SCHEDULED";

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: nextStatus },
    select: { id: true, status: true, scheduledStartAt: true },
  });

  await writeCampaignEvent({
    workspaceId: context.workspaceId,
    campaignId,
    type: "CAMPAIGN_RESUMED",
    payload: { actorUserId: context.userId, status: nextStatus },
  });

  const delayMs = updated.scheduledStartAt
    ? Math.max(0, updated.scheduledStartAt.getTime() - Date.now())
    : 0;
  const queue = await enqueueCampaign(campaignId, delayMs);

  return { campaign: updated, queue };
}

export async function stopCampaign(
  campaignId: string,
  context: CampaignControlContext,
) {
  const campaign = await getOwnedCampaign(campaignId, context.workspaceId);
  assertStatus(
    campaign.status,
    ["RUNNING", "SCHEDULED", "PAUSED"],
    "La campana no puede detenerse desde su estado actual.",
  );

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "STOPPED" },
    }),
    prisma.campaignMessage.updateMany({
      where: {
        campaignId,
        workspaceId: context.workspaceId,
        status: { in: ["PENDING", "QUEUED", "SENDING"] },
      },
      data: {
        status: "CANCELLED",
        lastErrorCode: "CAMPAIGN_STOPPED",
        lastErrorMessage: "Campana detenida por el operador.",
      },
    }),
    prisma.campaignEvent.create({
      data: {
        workspaceId: context.workspaceId,
        campaignId,
        type: "CAMPAIGN_STOPPED",
        payload: { actorUserId: context.userId },
      },
    }),
  ]);

  const updated = await syncCampaignCounters(prisma, campaignId);

  return { campaign: { id: updated.id, status: updated.status } };
}
