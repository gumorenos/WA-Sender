import { NextResponse } from "next/server";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import { prisma } from "@/lib/db";
import { getEvolutionQr } from "@/lib/evolution/client";
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
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return jsonError(authorization.error, authorization.status);
  }

  const context = authorization.context;

  try {
    enforceRateLimit({
      key: buildRateLimitKey([
        "instances:qr",
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
