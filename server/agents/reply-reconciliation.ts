import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { acquireConversationReplyLock } from "@/server/agents/conversation-reply-lock";
import { AUTOMATION_REPLY_UNKNOWN_ROLE } from "@/server/agents/reply-delivery";

export const AUTOMATION_REPLY_NOT_SENT_ROLE = "assistant_not_sent";

export const automationReplyReconciliationSchema = z.object({
  confirmed: z.literal(true, {
    error: "Debes confirmar explicitamente la reconciliacion.",
  }),
  resolution: z.enum(["CONFIRMED_SENT", "CONFIRMED_NOT_SENT"]),
  reason: z
    .string()
    .trim()
    .min(8, "El motivo debe tener al menos 8 caracteres.")
    .max(500, "El motivo no puede superar 500 caracteres."),
  providerMessageId: z.string().trim().min(1).max(200).optional(),
});

export type AutomationReplyReconciliationInput = z.infer<
  typeof automationReplyReconciliationSchema
>;

export class AutomationReplyReconciliationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AutomationReplyReconciliationError";
  }
}

function contactAuditMetadata(phone: string) {
  return {
    phoneLast4: phone.slice(-4),
    phoneHash: createHash("sha256").update(phone).digest("hex").slice(0, 16),
  };
}

function metadataObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as Record<string, Prisma.JsonValue>;
}

export async function reconcileUnknownAutomationReply(
  conversationId: string,
  messageId: string,
  rawInput: unknown,
  context: { userId: string; workspaceId: string },
) {
  const parsed = automationReplyReconciliationSchema.safeParse(rawInput);

  if (!parsed.success) {
    throw new AutomationReplyReconciliationError(
      parsed.error.issues[0]?.message ?? "Datos de reconciliacion invalidos.",
      400,
    );
  }

  const input: AutomationReplyReconciliationInput = parsed.data;
  const reconciledAt = new Date();

  return prisma.$transaction(async (tx) => {
    await acquireConversationReplyLock(tx, context.workspaceId, conversationId);

    const conversation = await tx.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: context.workspaceId,
      },
      select: {
        id: true,
        contactPhone: true,
      },
    });

    if (!conversation) {
      throw new AutomationReplyReconciliationError(
        "Conversacion no encontrada.",
        404,
      );
    }

    const message = await tx.conversationMessage.findFirst({
      where: {
        id: messageId,
        conversationId: conversation.id,
        workspaceId: context.workspaceId,
      },
      select: {
        id: true,
        role: true,
        direction: true,
        providerMessageId: true,
        metadata: true,
      },
    });

    if (!message) {
      throw new AutomationReplyReconciliationError("Mensaje no encontrado.", 404);
    }

    if (
      message.role !== AUTOMATION_REPLY_UNKNOWN_ROLE ||
      message.direction !== "outbound"
    ) {
      throw new AutomationReplyReconciliationError(
        "El mensaje ya no tiene un resultado automatico incierto pendiente de reconciliacion.",
        409,
      );
    }

    if (
      input.providerMessageId &&
      message.providerMessageId &&
      input.providerMessageId !== message.providerMessageId
    ) {
      throw new AutomationReplyReconciliationError(
        "El ID de proveedor indicado no coincide con la evidencia ya almacenada.",
        409,
      );
    }

    const confirmedSent = input.resolution === "CONFIRMED_SENT";
    const nextProviderMessageId = confirmedSent
      ? input.providerMessageId ?? message.providerMessageId
      : message.providerMessageId;
    const previousMetadata = metadataObject(message.metadata);

    const transitioned = await tx.conversationMessage.updateMany({
      where: {
        id: message.id,
        conversationId: conversation.id,
        workspaceId: context.workspaceId,
        role: AUTOMATION_REPLY_UNKNOWN_ROLE,
        direction: "outbound",
      },
      data: {
        role: confirmedSent ? "assistant" : AUTOMATION_REPLY_NOT_SENT_ROLE,
        providerMessageId: nextProviderMessageId,
        metadata: {
          ...previousMetadata,
          automationReply: true,
          deliveryState: confirmedSent
            ? "RECONCILED_CONFIRMED_SENT"
            : "RECONCILED_CONFIRMED_NOT_SENT",
          reconciledAt: reconciledAt.toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    if (transitioned.count !== 1) {
      throw new AutomationReplyReconciliationError(
        "El mensaje cambio mientras se reconciliaba. Recarga antes de continuar.",
        409,
      );
    }

    if (confirmedSent) {
      await tx.conversation.updateMany({
        where: {
          id: conversation.id,
          workspaceId: context.workspaceId,
        },
        data: { lastMessageAt: reconciledAt },
      });
    }

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        action: "UPDATED",
        resourceType: "agent_reply_reconciliation",
        resourceId: message.id,
        metadata: {
          conversationId: conversation.id,
          previousDeliveryState: "UNKNOWN_PROVIDER_RESULT",
          resolution: input.resolution,
          reason: input.reason,
          providerMessageId: nextProviderMessageId ?? null,
          reconciledAt: reconciledAt.toISOString(),
          ...contactAuditMetadata(conversation.contactPhone),
        },
      },
    });

    return {
      ok: true as const,
      conversationId: conversation.id,
      messageId: message.id,
      resolution: input.resolution,
      messageRole: confirmedSent ? "assistant" : AUTOMATION_REPLY_NOT_SENT_ROLE,
      providerMessageId: nextProviderMessageId ?? null,
      reconciledAt: reconciledAt.toISOString(),
    };
  });
}
