import { NextResponse } from "next/server";

import { getCurrentWorkspace } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

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

  const campaign = await prisma.campaign.findFirst({
    where: {
      id,
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
        lastErrorMessage: message.lastErrorMessage,
      })),
    },
  });
}

export async function DELETE(_: Request, context: RouteContext) {
  const authContext = await getCurrentWorkspace();

  if (!authContext) {
    return jsonError("No autenticado.", 401);
  }

  const { id } = await context.params;

  const campaign = await prisma.campaign.findFirst({
    where: {
      id,
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
