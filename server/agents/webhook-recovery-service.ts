import { prisma } from "@/lib/db";
import {
  WEBHOOK_STATUS_PROCESSING,
  WEBHOOK_STATUS_PROCESSED,
  WEBHOOK_STATUS_RETRY_ALLOWED,
  WEBHOOK_STATUS_STALE_REVIEW,
  webhookProcessingStaleCutoff,
  webhookRecoveryDecisionSchema,
  type WebhookRecoveryDecision,
} from "@/lib/evolution/webhook-recovery";

type RecoveryContext = {
  userId: string;
  workspaceId: string;
};

export class WebhookRecoveryError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "WebhookRecoveryError";
  }
}

export async function markStaleWebhookEventsForReview(params: {
  workspaceId: string;
  userId: string;
  now?: Date;
  limit?: number;
}) {
  const cutoff = webhookProcessingStaleCutoff(params.now);
  const limit = Math.min(500, Math.max(1, params.limit ?? 200));

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.webhookEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        status: WEBHOOK_STATUS_PROCESSING,
        updatedAt: { lte: cutoff },
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: { id: true },
    });

    if (candidates.length === 0) {
      return { markedCount: 0, cutoff: cutoff.toISOString() };
    }

    const transitioned = await tx.webhookEvent.updateMany({
      where: {
        id: { in: candidates.map((event) => event.id) },
        workspaceId: params.workspaceId,
        status: WEBHOOK_STATUS_PROCESSING,
        updatedAt: { lte: cutoff },
      },
      data: {
        status: WEBHOOK_STATUS_STALE_REVIEW,
        action: "stale_processing_requires_review",
        errorMessage:
          "El procesamiento quedo stale. No se reintentara automaticamente porque pueden existir efectos externos inciertos.",
        processedAt: null,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        actorUserId: params.userId,
        action: "UPDATED",
        resourceType: "webhook_recovery_sweep",
        metadata: {
          event: "WEBHOOK_STALE_REVIEW_MARKED",
          markedCount: transitioned.count,
          cutoff: cutoff.toISOString(),
        },
      },
    });

    return {
      markedCount: transitioned.count,
      cutoff: cutoff.toISOString(),
    };
  });
}

export async function decideWebhookRecovery(
  eventId: string,
  rawInput: unknown,
  context: RecoveryContext,
) {
  const parsed = webhookRecoveryDecisionSchema.safeParse(rawInput);

  if (!parsed.success) {
    throw new WebhookRecoveryError(
      parsed.error.issues[0]?.message ?? "Decision invalida.",
      400,
    );
  }

  const input: WebhookRecoveryDecision = parsed.data;
  const existing = await prisma.webhookEvent.findFirst({
    where: {
      id: eventId,
      workspaceId: context.workspaceId,
    },
    select: {
      id: true,
      status: true,
      payloadHash: true,
      provider: true,
      providerEventId: true,
      instanceId: true,
      updatedAt: true,
    },
  });

  if (!existing) {
    throw new WebhookRecoveryError("Evento webhook no encontrado.", 404);
  }

  const allowedStatuses =
    input.decision === "RETRY_ON_REDELIVERY"
      ? [WEBHOOK_STATUS_STALE_REVIEW]
      : [WEBHOOK_STATUS_STALE_REVIEW, WEBHOOK_STATUS_RETRY_ALLOWED];

  if (!allowedStatuses.includes(existing.status)) {
    throw new WebhookRecoveryError(
      "El evento ya no esta en un estado que admita esa decision de recovery.",
      409,
    );
  }

  const targetStatus =
    input.decision === "RETRY_ON_REDELIVERY"
      ? WEBHOOK_STATUS_RETRY_ALLOWED
      : WEBHOOK_STATUS_PROCESSED;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const transitioned = await tx.webhookEvent.updateMany({
      where: {
        id: existing.id,
        workspaceId: context.workspaceId,
        status: { in: allowedStatuses },
        updatedAt: existing.updatedAt,
      },
      data: {
        status: targetStatus,
        action:
          input.decision === "RETRY_ON_REDELIVERY"
            ? "retry_authorized_waiting_redelivery"
            : "manually_confirmed_processed",
        errorMessage:
          input.decision === "RETRY_ON_REDELIVERY"
            ? "Retry autorizado por operador. Solo una reentrega con el mismo payload hash puede recuperar el claim."
            : null,
        processedAt:
          input.decision === "MARK_PROCESSED" ? now : null,
      },
    });

    if (transitioned.count !== 1) {
      throw new WebhookRecoveryError(
        "El evento cambio mientras procesabamos la decision. Recarga e intenta nuevamente.",
        409,
      );
    }

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        action: "UPDATED",
        resourceType: "webhook_event_recovery",
        resourceId: existing.id,
        metadata: {
          event:
            input.decision === "RETRY_ON_REDELIVERY"
              ? "WEBHOOK_RETRY_ON_REDELIVERY_AUTHORIZED"
              : "WEBHOOK_MANUALLY_MARKED_PROCESSED",
          reason: input.reason,
          provider: existing.provider,
          instanceId: existing.instanceId,
          payloadHashPrefix: existing.payloadHash.slice(0, 12),
        },
      },
    });

    return {
      event: {
        id: existing.id,
        status: targetStatus,
      },
      decision: input.decision,
    };
  });
}

export async function listWebhookRecoveryEvents(workspaceId: string) {
  const events = await prisma.webhookEvent.findMany({
    where: {
      workspaceId,
      status: {
        in: [
          WEBHOOK_STATUS_STALE_REVIEW,
          WEBHOOK_STATUS_RETRY_ALLOWED,
          WEBHOOK_STATUS_PROCESSING,
        ],
      },
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: {
      id: true,
      provider: true,
      providerEventId: true,
      payloadHash: true,
      status: true,
      action: true,
      duplicateCount: true,
      lastDuplicateAt: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      instance: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return events.map((event) => ({
    id: event.id,
    provider: event.provider,
    providerEventId: event.providerEventId,
    payloadHashPrefix: event.payloadHash.slice(0, 12),
    status: event.status,
    action: event.action,
    duplicateCount: event.duplicateCount,
    lastDuplicateAt: event.lastDuplicateAt?.toISOString() ?? null,
    errorMessage: event.errorMessage,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    instanceId: event.instance.id,
    instanceName: event.instance.name,
  }));
}
