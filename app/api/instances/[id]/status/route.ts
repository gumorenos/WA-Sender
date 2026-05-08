import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/auth/server";
import { getEvolutionStatus } from "@/lib/evolution/client";
import { evolutionStateToDbStatus, toPublicInstanceStatus } from "@/lib/instances/status";
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

export async function GET(
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
        "instances:status",
        context.workspace.id,
        context.user.id,
      ]),
      limit: 60,
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
  });

  if (!instance) {
    return jsonError("Instancia no encontrada.", 404);
  }

  if (!instance.providerInstanceId) {
    return jsonError("La instancia no tiene identificador de proveedor.", 409);
  }

  try {
    const providerStatus = await getEvolutionStatus(instance.providerInstanceId);
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: evolutionStateToDbStatus(providerStatus.state),
        lastStatusAt: new Date(),
      },
    });

    return NextResponse.json({
      status: toPublicInstanceStatus(updated.status),
      checkedAt: updated.lastStatusAt?.toISOString() ?? new Date().toISOString(),
    });
  } catch {
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "ERROR",
        lastStatusAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        status: toPublicInstanceStatus(updated.status),
        checkedAt: updated.lastStatusAt?.toISOString() ?? new Date().toISOString(),
        error: "No se pudo consultar Evolution API.",
      },
      { status: 502 },
    );
  }
}
