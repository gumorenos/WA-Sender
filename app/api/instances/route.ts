import { NextResponse } from "next/server";
import type { InstanceProvider, InstanceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/auth/server";
import {
  buildProviderInstanceName,
  createEvolutionInstance,
  getEvolutionRuntimeMode,
} from "@/lib/evolution/client";
import { createInstanceSchema, instanceStatusFilterSchema } from "@/lib/instances/schemas";
import { evolutionStateToDbStatus, toPublicInstanceStatus } from "@/lib/instances/status";
import type { PublicWhatsAppInstance } from "@/lib/instances/types";

function serializeInstance(instance: {
  id: string;
  name: string;
  provider: InstanceProvider;
  status: InstanceStatus;
  createdAt: Date;
  updatedAt: Date;
  lastQrAt: Date | null;
  lastStatusAt: Date | null;
}): PublicWhatsAppInstance {
  return {
    id: instance.id,
    name: instance.name,
    provider: instance.provider,
    status: toPublicInstanceStatus(instance.status),
    createdAt: instance.createdAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
    lastQrAt: instance.lastQrAt?.toISOString() ?? null,
    lastStatusAt: instance.lastStatusAt?.toISOString() ?? null,
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const context = await getCurrentWorkspace();

  if (!context) {
    return jsonError("No autenticado.", 401);
  }

  const url = new URL(request.url);
  const filter = instanceStatusFilterSchema.parse(
    url.searchParams.get("status") ?? "all",
  );

  const dbStatus =
    filter === "active"
      ? "ACTIVE"
      : filter === "connecting"
        ? "CONNECTING"
        : filter === "disconnected"
          ? "DISCONNECTED"
          : undefined;

  const [instances, used] = await Promise.all([
    prisma.whatsAppInstance.findMany({
      where: {
        workspaceId: context.workspace.id,
        ...(dbStatus ? { status: dbStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.whatsAppInstance.count({
      where: { workspaceId: context.workspace.id },
    }),
  ]);

  const plan = context.workspace.subscription?.plan;
  const limit = plan?.maxInstances ?? 1;

  return NextResponse.json({
    instances: instances.map(serializeInstance),
    usage: {
      used,
      limit,
      remaining: Math.max(0, limit - used),
    },
    plan: {
      code: plan?.code ?? "demo",
      name: plan?.name ?? "Demo",
    },
  });
}

export async function POST(request: Request) {
  const context = await getCurrentWorkspace();

  if (!context) {
    return jsonError("No autenticado.", 401);
  }

  const parsed = createInstanceSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos invalidos.", 400);
  }

  const plan = context.workspace.subscription?.plan;
  const limit = plan?.maxInstances ?? 1;
  const used = await prisma.whatsAppInstance.count({
    where: { workspaceId: context.workspace.id },
  });

  if (used >= limit) {
    return jsonError("Tu plan no permite crear mas instancias.", 403);
  }

  const existing = await prisma.whatsAppInstance.findFirst({
    where: {
      workspaceId: context.workspace.id,
      name: parsed.data.name,
    },
    select: { id: true },
  });

  if (existing) {
    return jsonError("Ya existe una instancia con ese nombre.", 409);
  }

  const provider = getEvolutionRuntimeMode() === "mock" ? "MOCK" : "EVOLUTION";
  const providerInstanceName = buildProviderInstanceName(
    context.workspace.id,
    parsed.data.name,
  );

  const localInstance = await prisma.whatsAppInstance.create({
    data: {
      workspaceId: context.workspace.id,
      name: parsed.data.name,
      provider,
      providerInstanceId: providerInstanceName,
      status: "CONNECTING",
      capabilities: {
        qr: true,
        cloudApiReady: false,
        provider: "evolution-api",
      },
    },
  });

  try {
    const evolutionInstance = await createEvolutionInstance(providerInstanceName);
    const status = evolutionStateToDbStatus(evolutionInstance.state);
    const updated = await prisma.whatsAppInstance.update({
      where: { id: localInstance.id },
      data: {
        providerInstanceId: evolutionInstance.providerInstanceName,
        status,
        lastStatusAt: new Date(),
        metadata: {
          evolutionInstanceId: evolutionInstance.providerInstanceId,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorUserId: context.user.id,
        action: "CREATED",
        resourceType: "whatsapp_instance",
        resourceId: updated.id,
        metadata: {
          provider,
        },
      },
    });

    return NextResponse.json({ instance: serializeInstance(updated) }, { status: 201 });
  } catch {
    await prisma.whatsAppInstance.delete({
      where: { id: localInstance.id },
    });

    return jsonError("No se pudo crear la instancia en Evolution API.", 502);
  }
}
