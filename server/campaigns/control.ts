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

const UNKNOWN_PROVIDER_RESULT = "UNKNOWN_PROVIDER_RESULT";
const SAFE_RETRY_EXHAUSTED = "SEND_RETRYABLE_EXHAUSTED";

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
      updatedAt: true,
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

function concurrentTransitionError() {
  return new CampaignControlError(
    "La campana cambio mientras procesabamos la solicitud. Recarga e intenta nuevamente.",
    409,
  );
}

async function assertNoUnknownProviderResult(
  campaignId: string,
  workspaceId: string,
) {
  const unresolved = await prisma.campaignMessage.count({
    where: {
      campaignId,
      workspaceId,
      status: "FAILED",
      lastErrorCode: UNKNOWN_PROVIDER_RESULT,
    },
  });

  if (unresolved > 0) {
    throw new CampaignControlError(
      "La campana tiene envios con resultado incierto. Debes reconciliarlos antes de continuar.",
      409,
    );
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

  await assertNoUnknownProviderResult(campaignId, context.workspaceId);

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
      OR: [
        { status: "PENDING" },
        { status: "FAILED", lastErrorCode: SAFE_RETRY_EXHAUSTED },
      ],
    },
  });

  if (messageCount === 0) {
    throw new CampaignControlError(
      "La campana no tiene mensajes pendientes o reintentos seguros.",
      409,
    );
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
  const consentConfirmedAt = new Date();

  const { newlyGrantedCount, retryResetCount } = await prisma.$transaction(
    async (tx) => {
      const transitioned = await tx.campaign.updateMany({
        where: {
          id: campaign.id,
          workspaceId: context.workspaceId,
          status: campaign.status,
          updatedAt: campaign.updatedAt,
        },
        data: {
          activeWindowEnd: input.activeWindowEnd,
          activeWindowStart: input.activeWindowStart,
          consentConfirmedAt,
          delaySeconds: input.delaySeconds,
          instanceId: input.instanceId,
          scheduledStartAt,
          status: nextStatus,
          timezone: input.timezone,
        },
      });

      if (transitioned.count !== 1) {
        throw concurrentTransitionError();
      }

      const retryReset = await tx.campaignMessage.updateMany({
        where: {
          campaignId,
          workspaceId: context.workspaceId,
          status: "FAILED",
          lastErrorCode: SAFE_RETRY_EXHAUSTED,
        },
        data: {
          status: "PENDING",
          lastErrorCode: "RETRY_MANUALLY_CONFIRMED",
          lastErrorMessage:
            "Reintento confirmado por el operador despues de un fallo conocido como no enviado.",
        },
      });

      const granted = await tx.campaignMessage.updateMany({
        where: {
          campaignId,
          workspaceId: context.workspaceId,
          status: "PENDING",
          consentStatus: { in: ["UNKNOWN", "NOT_REQUIRED_FOR_MOCK"] },
        },
        data: {
          consentStatus: "EXPLICITLY_GRANTED",
          optInStatus: "CONFIRMED",
        },
      });

      await tx.campaignEvent.create({
        data: {
          workspaceId: context.workspaceId,
          campaignId,
          type: "CAMPAIGN_CONSENT_ATTESTED",
          payload: {
            actorUserId: context.userId,
            attestedAt: consentConfirmedAt.toISOString(),
            source: input.consentSource,
            reference: input.consentReference,
            newlyGrantedCount: granted.count,
          },
        },
      });

      await tx.campaignEvent.create({
        data: {
          workspaceId: context.workspaceId,
          campaignId,
          type: "CAMPAIGN_STARTED",
          payload: {
            actorUserId: context.userId,
            status: nextStatus,
            scheduledStartAt: scheduledStartAt.toISOString(),
            retryResetCount: retryReset.count,
          },
        },
      });

      await tx.auditLog.create({
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
            retryResetCount: retryReset.count,
            consent: {
              attestedAt: consentConfirmedAt.toISOString(),
              source: input.consentSource,
              reference: input.consentReference,
              newlyGrantedCount: granted.count,
            },
          },
        },
      });

      return {
        newlyGrantedCount: granted.count,
        retryResetCount: retryReset.count,
      };
    },
  );

  const updated = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    select: {
      id: true,
      status: true,
      scheduledStartAt: true,
    },
  });

  const delayMs = Math.max(0, scheduledStartAt.getTime() - Date.now());
  const queue = await enqueueCampaign(campaignId, delayMs);

  return {
    campaign: updated,
    consent: {
      attestedAt: consentConfirmedAt.toISOString(),
      source: input.consentSource,
      reference: input.consentReference,
      newlyGrantedCount,
    },
    retryResetCount,
    queue,
  };
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

  await prisma.$transaction(async (tx) => {
    const transitioned = await tx.campaign.updateMany({
      where: {
        id: campaign.id,
        workspaceId: context.workspaceId,
        status: campaign.status,
        updatedAt: campaign.updatedAt,
      },
      data: { status: "PAUSED" },
    });

    if (transitioned.count !== 1) {
      throw concurrentTransitionError();
    }

    await tx.campaignEvent.create({
      data: {
        workspaceId: context.workspaceId,
        campaignId,
        type: "CAMPAIGN_PAUSED",
        payload: { actorUserId: context.userId },
      },
    });
  });

  return { campaign: { id: campaign.id, status: "PAUSED" as const } };
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

  await assertNoUnknownProviderResult(campaignId, context.workspaceId);

  const nextStatus = isScheduledStartDue(campaign.scheduledStartAt)
    ? "RUNNING"
    : "SCHEDULED";

  await prisma.$transaction(async (tx) => {
    const transitioned = await tx.campaign.updateMany({
      where: {
        id: campaign.id,
        workspaceId: context.workspaceId,
        status: campaign.status,
        updatedAt: campaign.updatedAt,
      },
      data: { status: nextStatus },
    });

    if (transitioned.count !== 1) {
      throw concurrentTransitionError();
    }

    await tx.campaignEvent.create({
      data: {
        workspaceId: context.workspaceId,
        campaignId,
        type: "CAMPAIGN_RESUMED",
        payload: { actorUserId: context.userId, status: nextStatus },
      },
    });
  });

  const delayMs = campaign.scheduledStartAt
    ? Math.max(0, campaign.scheduledStartAt.getTime() - Date.now())
    : 0;
  const queue = await enqueueCampaign(campaignId, delayMs);

  return {
    campaign: {
      id: campaign.id,
      status: nextStatus,
      scheduledStartAt: campaign.scheduledStartAt,
    },
    queue,
  };
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

  await prisma.$transaction(async (tx) => {
    const transitioned = await tx.campaign.updateMany({
      where: {
        id: campaign.id,
        workspaceId: context.workspaceId,
        status: campaign.status,
        updatedAt: campaign.updatedAt,
      },
      data: { status: "STOPPED" },
    });

    if (transitioned.count !== 1) {
      throw concurrentTransitionError();
    }

    await tx.campaignMessage.updateMany({
      where: {
        campaignId,
        workspaceId: context.workspaceId,
        status: { in: ["PENDING", "QUEUED"] },
      },
      data: {
        status: "CANCELLED",
        lastErrorCode: "CAMPAIGN_STOPPED",
        lastErrorMessage: "Campana detenida por el operador.",
      },
    });

    await tx.campaignEvent.create({
      data: {
        workspaceId: context.workspaceId,
        campaignId,
        type: "CAMPAIGN_STOPPED",
        payload: { actorUserId: context.userId },
      },
    });
  });

  const updated = await syncCampaignCounters(prisma, campaignId);

  return { campaign: { id: updated.id, status: updated.status } };
}
