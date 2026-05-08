import { NextResponse } from "next/server";

import { agentInstanceAssignmentSchema } from "@/lib/agents/schemas";
import { getCurrentWorkspace } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

function serializeAssignment(assignment: {
  id: string;
  active: boolean;
  agentId: string;
  instanceId: string;
  updatedAt: Date;
  agent: {
    id: string;
    name: string;
    status: string;
  };
  instance: {
    id: string;
    name: string;
    status: string;
  };
}) {
  return {
    id: assignment.id,
    active: assignment.active,
    agentId: assignment.agentId,
    instanceId: assignment.instanceId,
    updatedAt: assignment.updatedAt.toISOString(),
    agent: assignment.agent,
    instance: assignment.instance,
  };
}

export async function GET() {
  const context = await getCurrentWorkspace();

  if (!context) {
    return jsonError("No autenticado.", 401);
  }

  const assignments = await prisma.agentInstanceAssignment.findMany({
    where: {
      workspaceId: context.workspace.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      instance: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return NextResponse.json({
    assignments: assignments.map(serializeAssignment),
  });
}

export async function PUT(request: Request) {
  const context = await getCurrentWorkspace();

  if (!context) {
    return jsonError("No autenticado.", 401);
  }

  try {
    enforceRateLimit({
      key: buildRateLimitKey([
        "agents:assignments",
        context.workspace.id,
        context.user.id,
      ]),
      limit: 30,
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimitResponse(error);
    }

    throw error;
  }

  const parsed = agentInstanceAssignmentSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Datos invalidos.",
      400,
      parsed.error.flatten(),
    );
  }

  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      id: parsed.data.instanceId,
      workspaceId: context.workspace.id,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!instance) {
    return jsonError("Instancia no encontrada.", 404);
  }

  if (!parsed.data.agentId) {
    await prisma.$transaction([
      prisma.agentInstanceAssignment.deleteMany({
        where: {
          workspaceId: context.workspace.id,
          instanceId: instance.id,
        },
      }),
      prisma.auditLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorUserId: context.user.id,
          action: "UPDATED",
          resourceType: "agent_instance_assignment",
          resourceId: instance.id,
          metadata: {
            instanceName: instance.name,
            agentId: null,
          },
        },
      }),
    ]);

    return NextResponse.json({
      assignment: null,
    });
  }

  const agent = await prisma.agent.findFirst({
    where: {
      id: parsed.data.agentId,
      workspaceId: context.workspace.id,
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!agent) {
    return jsonError("Agente no encontrado.", 404);
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const saved = await tx.agentInstanceAssignment.upsert({
      where: {
        workspaceId_instanceId: {
          workspaceId: context.workspace.id,
          instanceId: instance.id,
        },
      },
      create: {
        workspaceId: context.workspace.id,
        instanceId: instance.id,
        agentId: agent.id,
        active: parsed.data.active,
      },
      update: {
        agentId: agent.id,
        active: parsed.data.active,
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        instance: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    await tx.agentSetting.updateMany({
      where: {
        workspaceId: context.workspace.id,
        agentId: agent.id,
      },
      data: {
        autoReplyEnabled: true,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorUserId: context.user.id,
        action: "UPDATED",
        resourceType: "agent_instance_assignment",
        resourceId: saved.id,
        metadata: {
          instanceId: instance.id,
          instanceName: instance.name,
          agentId: agent.id,
          agentName: agent.name,
          active: saved.active,
        },
      },
    });

    return saved;
  });

  return NextResponse.json({
    assignment: serializeAssignment(assignment),
  });
}
