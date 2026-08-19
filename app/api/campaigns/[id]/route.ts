import { NextResponse } from "next/server";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import { getCurrentWorkspace } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import { routeIdSchema } from "@/lib/security/schemas";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const authContext = await getCurrentWorkspace();

  if (!authContext) {
    return jsonError("No autenticado.", 401);
  }

  const { id } = await context.params;
  const parsedId = routeIdSchema.safeParse(id);

  if (!parsedId.success) {
    return jsonError(parsedId.error.issues[0]?.message ?? "ID invalido.", 400);
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: parsedId.data,
      workspaceId: authContext.workspace.id,
    },
    select: {
      id: true,
      name: true,
      status: true,
      totalCount: true,
      pendingCount: true,
      sentCount: true,
      failedCount: true,
      timezone: true,
      activeWindowStart: true,
      activeWindowEnd: true,
      scheduledStartAt: true,
      delaySeconds: true,
      createdAt: true,
      updatedAt: true,
      instance: {
        select: {
          name: true,
        },
      },
      messages: {
        orderBy: [
          { updatedAt: "desc" },
          { createdAt: "desc" },
        ],
        select: {
          id: true,
          recipientPhone: true,
          messageTemplate: true,
          status: true,
          sentAt: true,
          updatedAt: true,
          consentStatus: true,
          lastErrorMessage: true,
        },
      },
    },
  });

  if (!campaign) {
    return jsonError("Campana no encontrada.", 404);
  }

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      totalCount: campaign.totalCount,
      pendingCount: campaign.pendingCount,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      timezone: campaign.timezone,
      activeWindowStart: campaign.activeWindowStart,
      activeWindowEnd: campaign.activeWindowEnd,
      scheduledStartAt: campaign.scheduledStartAt?.toISOString() ?? null,
      delaySeconds: campaign.delaySeconds,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      instanceName: campaign.instance?.name ?? null,
      messages: campaign.messages.map((message) => ({
        id: message.id,
        recipientPhone: message.recipientPhone,
        messageTemplate: message.messageTemplate,
        status: message.status,
        sentAt: message.sentAt?.toISOString() ?? null,
        updatedAt: message.updatedAt.toISOString(),
        consentStatus: message.consentStatus,
        lastErrorMessage: message.lastErrorMessage,
      })),
    },
  });
}

export async function DELETE(_: Request, context: RouteContext) {
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return jsonError(authorization.error, authorization.status);
  }

  const authContext = authorization.context;

  try {
    enforceRateLimit({
      key: buildRateLimitKey([
        "campaigns:delete",
        authContext.workspace.id,
        authContext.user.id,
      ]),
      limit: 12,
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimitResponse(error);
    }

    throw error;
  }

  const { id } = await context.params;
  const parsedId = routeIdSchema.safeParse(id);

  if (!parsedId.success) {
    return jsonError(parsedId.error.issues[0]?.message ?? "ID invalido.", 400);
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: parsedId.data,
      workspaceId: authContext.workspace.id,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!campaign) {
    return jsonError("Campana no encontrada.", 404);
  }

  await prisma.$transaction([
    prisma.campaign.delete({
      where: {
        id: campaign.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: authContext.workspace.id,
        actorUserId: authContext.user.id,
        action: "DELETED",
        resourceType: "campaign",
        resourceId: campaign.id,
        metadata: {
          name: campaign.name,
        },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    deletedCampaignId: campaign.id,
  });
}
