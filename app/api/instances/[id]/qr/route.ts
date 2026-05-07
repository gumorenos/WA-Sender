import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/auth/server";
import { getEvolutionQr } from "@/lib/evolution/client";
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
    const qr = await getEvolutionQr(instance.providerInstanceId);
    const nextStatus = qr.state
      ? evolutionStateToDbStatus(qr.state)
      : instance.status;

    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: nextStatus,
        lastQrAt: qr.qrBase64 ? new Date() : instance.lastQrAt,
        lastStatusAt: new Date(),
      },
    });

    return NextResponse.json({
      qrBase64: qr.qrBase64,
      pairingCode: qr.pairingCode,
      status: toPublicInstanceStatus(updated.status),
    });
  } catch {
    return jsonError("No se pudo obtener el QR desde Evolution API.", 502);
  }
}
