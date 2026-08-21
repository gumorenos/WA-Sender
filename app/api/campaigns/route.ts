import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import { getCurrentWorkspace } from "@/lib/auth/server";
import { parseCampaignInput } from "@/lib/campaign-parser";
import { getCampaignImportLimits, utf8ByteLength } from "@/lib/campaigns/limits";
import { createCampaignSchema } from "@/lib/campaigns/schemas";
import { prisma } from "@/lib/db";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import {
  readJsonBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/security/request-body";

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

export async function GET() {
  const context = await getCurrentWorkspace();

  if (!context) {
    return jsonError("No autenticado.", 401);
  }

  const campaigns = await prisma.campaign.findMany({
    where: {
      workspaceId: context.workspace.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      name: true,
      status: true,
      totalCount: true,
      pendingCount: true,
      sentCount: true,
      failedCount: true,
      instanceId: true,
      scheduledStartAt: true,
      timezone: true,
      activeWindowStart: true,
      activeWindowEnd: true,
      delaySeconds: true,
      createdAt: true,
      updatedAt: true,
      instance: {
        select: {
          name: true,
        },
      },
    },
  });

  return NextResponse.json({
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      totalCount: campaign.totalCount,
      pendingCount: campaign.pendingCount,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      instanceId: campaign.instanceId,
      scheduledStartAt: campaign.scheduledStartAt?.toISOString() ?? null,
      timezone: campaign.timezone,
      activeWindowStart: campaign.activeWindowStart,
      activeWindowEnd: campaign.activeWindowEnd,
      delaySeconds: campaign.delaySeconds,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      instanceName: campaign.instance?.name ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return jsonError(authorization.error, authorization.status);
  }

  const context = authorization.context;

  try {
    enforceRateLimit({
      key: buildRateLimitKey([
        "campaigns:create",
        context.workspace.id,
        context.user.id,
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

  const limits = getCampaignImportLimits();
  let body: unknown | null;

  try {
    body = await readJsonBodyWithLimit(request, limits.maxBodyBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError(
        `La solicitud supera el limite tecnico de ${limits.maxBodyBytes} bytes.`,
        413,
      );
    }

    throw error;
  }

  const parsed = createCampaignSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Datos invalidos.",
      400,
      parsed.error.flatten(),
    );
  }

  const rawInputBytes = utf8ByteLength(parsed.data.rawInput);

  if (rawInputBytes > limits.maxRawInputBytes) {
    return jsonError(
      `La importacion supera el limite tecnico de ${limits.maxRawInputBytes} bytes.`,
      413,
    );
  }

  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      id: parsed.data.instanceId,
      workspaceId: context.workspace.id,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!instance) {
    return jsonError(
      "La instancia seleccionada no existe, no te pertenece o no esta activa.",
      403,
    );
  }

  const parseResult = parseCampaignInput(parsed.data.rawInput);

  if (parseResult.processedLines > limits.maxRows) {
    return jsonError(
      `La campana supera el limite tecnico de ${limits.maxRows} filas.`,
      413,
      {
        processedLines: parseResult.processedLines,
        maxRows: limits.maxRows,
      },
    );
  }

  if (parseResult.rows.length === 0) {
    return jsonError("No hay filas validas para guardar.", 400, parseResult);
  }

  if (parseResult.errors.length > 0) {
    return jsonError(
      "Corrige las filas invalidas antes de guardar la campana.",
      400,
      parseResult,
    );
  }

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: context.workspace.id,
      instanceId: instance.id,
      name: parsed.data.name.trim(),
      status: "DRAFT",
      totalCount: parseResult.rows.length,
      pendingCount: parseResult.rows.length,
      sentCount: 0,
      failedCount: 0,
      messages: {
        createMany: {
          data: parseResult.rows.map((row, index) => ({
            workspaceId: context.workspace.id,
            recipientPhone: row.phone,
            messageTemplate: row.message,
            renderedMessage: row.message,
            status: "PENDING",
            idempotencyKey: `${context.workspace.id}:${instance.id}:${index}:${randomUUID()}`,
            variables: {},
          })),
        },
      },
    },
    select: {
      id: true,
      name: true,
      totalCount: true,
      pendingCount: true,
      status: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: context.workspace.id,
      actorUserId: context.user.id,
      action: "CREATED",
      resourceType: "campaign",
      resourceId: campaign.id,
      metadata: {
        instanceId: instance.id,
        totalRows: parseResult.rows.length,
      },
    },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
