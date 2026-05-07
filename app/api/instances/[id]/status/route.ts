import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/auth/server";
import { getEvolutionStatus } from "@/lib/evolution/client";
import { evolutionStateToDbStatus, toPublicInstanceStatus } from "@/lib/instances/status";

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

  const { id } = await params;
  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      id,
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
