import { z } from "zod";

import { prisma } from "@/lib/db";

const UNKNOWN_PROVIDER_RESULT = "UNKNOWN_PROVIDER_RESULT";
const RECONCILED_CONFIRMED_SENT = "RECONCILED_CONFIRMED_SENT";
const RECONCILED_CONFIRMED_NOT_SENT = "RECONCILED_CONFIRMED_NOT_SENT";

const RECONCILABLE_CAMPAIGN_STATUSES = ["FAILED", "PAUSED", "STOPPED"] as const;

export const campaignMessageReconciliationSchema = z.object({
  confirmed: z.literal(true, {
    error: "Debes confirmar explicitamente la reconciliacion.",
  }),
  resolution: z.enum(["CONFIRMED_SENT", "CONFIRMED_NOT_SENT"]),
  reason: z
    .string()
    .trim()
    .min(8, "El motivo debe tener al menos 8 caracteres.")
    .max(500, "El motivo no puede superar 500 caracteres."),
  providerMessageId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional(),
});

export type CampaignMessageReconciliationInput = z.infer<
  typeof campaignMessageReconciliationSchema
>;

export class CampaignReconciliationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CampaignReconciliationError";
  }
}

export async function reconcileUnknownCampaignMessage(
  campaignId: string,
  messageId: string,
  rawInput: unknown,
  context: { userId: string; workspaceId: string },
) {
  const parsed = campaignMessageReconciliationSchema.safeParse(rawInput);

  if (!parsed.success) {
    throw new CampaignReconciliationError(
      parsed.error.issues[0]?.message ?? "Datos de reconciliacion invalidos.",
      400,
    );
  }

  const input: CampaignMessageReconciliationInput = parsed.data;
  const reconciledAt = new Date();

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: {
        id: campaignId,
        workspaceId: context.workspaceId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!campaign) {
      throw new CampaignReconciliationError("Campana no encontrada.", 404);
    }

    if (!RECONCILABLE_CAMPAIGN_STATUSES.includes(campaign.status as (typeof RECONCILABLE_CAMPAIGN_STATUSES)[number])) {
      throw new CampaignReconciliationError(
        "La campana debe estar detenida, pausada o fallida antes de reconciliar un resultado incierto.",
        409,
      );
    }

    const message = await tx.campaignMessage.findFirst({
      where: {
        id: messageId,
        campaignId,
        workspaceId: context.workspaceId,
      },
      select: {
        id: true,
        status: true,
        lastErrorCode: true,
        providerMessageId: true,
      },
    });

    if (!message) {
      throw new CampaignReconciliationError("Mensaje no encontrado.", 404);
    }

    if (
      message.status !== "FAILED" ||
      message.lastErrorCode !== UNKNOWN_PROVIDER_RESULT
    ) {
      throw new CampaignReconciliationError(
        "El mensaje ya no tiene un resultado de proveedor incierto pendiente de reconciliacion.",
        409,
      );
    }

    if (
      input.providerMessageId &&
      message.providerMessageId &&
      input.providerMessageId !== message.providerMessageId
    ) {
      throw new CampaignReconciliationError(
        "El ID de proveedor indicado no coincide con la evidencia ya almacenada.",
        409,
      );
    }

    const confirmedSent = input.resolution === "CONFIRMED_SENT";
    const nextProviderMessageId = confirmedSent
      ? input.providerMessageId ?? message.providerMessageId
      : message.providerMessageId;

    const transitioned = await tx.campaignMessage.updateMany({
      where: {
        id: message.id,
        campaignId,
        workspaceId: context.workspaceId,
        status: "FAILED",
        lastErrorCode: UNKNOWN_PROVIDER_RESULT,
      },
      data: confirmedSent
        ? {
            status: "SENT",
            sentAt: reconciledAt,
            providerMessageId: nextProviderMessageId,
            lastErrorCode: RECONCILED_CONFIRMED_SENT,
            lastErrorMessage:
              "Resultado incierto reconciliado manualmente como enviado.",
          }
        : {
            status: "PENDING",
            sentAt: null,
            lastErrorCode: RECONCILED_CONFIRMED_NOT_SENT,
            lastErrorMessage:
              "Resultado incierto reconciliado manualmente como no enviado; requiere Start explicito antes de un nuevo intento.",
          },
    });

    if (transitioned.count !== 1) {
      throw new CampaignReconciliationError(
        "El mensaje cambio mientras se reconciliaba. Recarga antes de continuar.",
        409,
      );
    }

    await tx.campaignEvent.create({
      data: {
        workspaceId: context.workspaceId,
        campaignId,
        messageId: message.id,
        type: "UNKNOWN_PROVIDER_RESULT_RECONCILED",
        payload: {
          resolution: input.resolution,
          reason: input.reason,
          providerMessageId: nextProviderMessageId ?? null,
          reconciledAt: reconciledAt.toISOString(),
          actorUserId: context.userId,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        action: "UPDATED",
        resourceType: "campaign_message_reconciliation",
        resourceId: message.id,
        metadata: {
          campaignId,
          previousErrorCode: UNKNOWN_PROVIDER_RESULT,
          resolution: input.resolution,
          reason: input.reason,
          providerMessageId: nextProviderMessageId ?? null,
          reconciledAt: reconciledAt.toISOString(),
        },
      },
    });

    const [totalCount, pendingCount, sentCount, failedCount, unresolvedCount] =
      await Promise.all([
        tx.campaignMessage.count({ where: { campaignId } }),
        tx.campaignMessage.count({
          where: {
            campaignId,
            status: { in: ["PENDING", "QUEUED", "SENDING"] },
          },
        }),
        tx.campaignMessage.count({ where: { campaignId, status: "SENT" } }),
        tx.campaignMessage.count({ where: { campaignId, status: "FAILED" } }),
        tx.campaignMessage.count({
          where: {
            campaignId,
            status: "FAILED",
            lastErrorCode: UNKNOWN_PROVIDER_RESULT,
          },
        }),
      ]);

    const shouldComplete =
      campaign.status === "FAILED" &&
      unresolvedCount === 0 &&
      pendingCount === 0 &&
      failedCount === 0;

    await tx.campaign.update({
      where: { id: campaignId },
      data: {
        totalCount,
        pendingCount,
        sentCount,
        failedCount,
        ...(shouldComplete ? { status: "COMPLETED" } : {}),
      },
    });

    if (shouldComplete) {
      await tx.campaignEvent.create({
        data: {
          workspaceId: context.workspaceId,
          campaignId,
          type: "CAMPAIGN_COMPLETED_AFTER_RECONCILIATION",
          payload: {
            reconciledMessageId: message.id,
            reconciledAt: reconciledAt.toISOString(),
          },
        },
      });
    }

    return {
      ok: true as const,
      campaignId,
      messageId: message.id,
      resolution: input.resolution,
      messageStatus: confirmedSent ? ("SENT" as const) : ("PENDING" as const),
      campaignStatus: shouldComplete ? ("COMPLETED" as const) : campaign.status,
      unresolvedCount,
    };
  });
}
