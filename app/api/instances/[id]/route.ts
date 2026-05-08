import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/auth/server";
import { deleteEvolutionInstance, EvolutionApiError } from "@/lib/evolution/client";
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getCurrentWorkspace();

  if (!context) {
    return jsonError("No autenticado.", 401);
  }

  try {
    enforceRateLimit({
      key: buildRateLimitKey([
        "instances:delete",
        context.workspace.id,
        context.user.id,
      ]),
      limit: 10,
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimitResponse(error);
    }

    throw error;
  }

  const { id } = await params;
  const parsedId = routeIdSchema.safeParse(id);

  if (!parsedId.success) {
    return jsonError(parsedId.error.issues[0]?.message ?? "ID invalido.", 400);
  }

  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      id: parsedId.data,
      workspaceId: context.workspace.id,
    },
    select: {
      id: true,
      providerInstanceId: true,
      name: true,
    },
  });

  if (!instance) {
    return jsonError("Instancia no encontrada.", 404);
  }

  if (instance.providerInstanceId) {
    try {
      await deleteEvolutionInstance(instance.providerInstanceId);
    } catch (error) {
      if (!(error instanceof EvolutionApiError) || error.status !== 404) {
        return jsonError("No se pudo eliminar la instancia en Evolution API.", 502);
      }
    }
  }

  await prisma.whatsAppInstance.delete({
    where: { id: instance.id },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: context.workspace.id,
      actorUserId: context.user.id,
      action: "DELETED",
      resourceType: "whatsapp_instance",
      resourceId: instance.id,
      metadata: {
        name: instance.name,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
