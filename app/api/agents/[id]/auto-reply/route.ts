import { NextResponse } from "next/server";

import { updateAgentAutoReplySchema } from "@/lib/agents/schemas";
import { getCurrentWorkspace } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import { routeIdSchema } from "@/lib/security/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const authContext = await getCurrentWorkspace();

  if (!authContext) {
    return jsonError("No autenticado.", 401);
  }

  try {
    enforceRateLimit({
      key: buildRateLimitKey([
        "agents:auto-reply",
        authContext.workspace.id,
        authContext.user.id,
      ]),
      limit: 20,
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

  const parsed = updateAgentAutoReplySchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Datos invalidos.",
      400,
      parsed.error.flatten(),
    );
  }

  const agent = await prisma.agent.findFirst({
    where: {
      id: parsedId.data,
      workspaceId: authContext.workspace.id,
    },
    select: {
      id: true,
      name: true,
      status: true,
      activeAgentVersionId: true,
    },
  });

  if (!agent) {
    return jsonError("Agente no encontrado.", 404);
  }

  if (parsed.data.enabled && agent.status !== "ACTIVE") {
    return jsonError(
      "Activa primero el agente antes de habilitar respuestas automaticas.",
      409,
    );
  }

  if (parsed.data.enabled && !agent.activeAgentVersionId) {
    return jsonError(
      "El agente necesita una version activa antes de habilitar respuestas automaticas.",
      409,
    );
  }

  const settings = await prisma.$transaction(async (tx) => {
    const saved = await tx.agentSetting.upsert({
      where: {
        agentId: agent.id,
      },
      create: {
        workspaceId: authContext.workspace.id,
        agentId: agent.id,
        autoReplyEnabled: parsed.data.enabled,
      },
      update: {
        autoReplyEnabled: parsed.data.enabled,
      },
      select: {
        autoReplyEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        handoffKeywords: true,
        updatedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: authContext.workspace.id,
        actorUserId: authContext.user.id,
        action: "UPDATED",
        resourceType: "agent_auto_reply",
        resourceId: agent.id,
        metadata: {
          agentName: agent.name,
          enabled: parsed.data.enabled,
          explicitlyConfirmed: parsed.data.enabled ? parsed.data.confirmed : false,
        },
      },
    });

    return saved;
  });

  return NextResponse.json({
    settings: {
      ...settings,
      updatedAt: settings.updatedAt.toISOString(),
    },
  });
}
