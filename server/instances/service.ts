import type { InstanceProvider } from "@prisma/client";

import { prisma } from "@/lib/db";

export class InstanceReservationError extends Error {
  constructor(
    message: string,
    public readonly status: 403 | 409,
  ) {
    super(message);
    this.name = "InstanceReservationError";
  }
}

export async function reserveWhatsAppInstance(params: {
  workspaceId: string;
  name: string;
  provider: InstanceProvider;
  providerInstanceName: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ lock: number }>>`
      SELECT 1 AS lock
      FROM (SELECT pg_advisory_xact_lock(hashtext(${`instance-limit:${params.workspaceId}`}))) AS acquired
    `;

    const [subscription, used, existing] = await Promise.all([
      tx.subscription.findUnique({
        where: { workspaceId: params.workspaceId },
        select: {
          plan: {
            select: { maxInstances: true },
          },
        },
      }),
      tx.whatsAppInstance.count({
        where: { workspaceId: params.workspaceId },
      }),
      tx.whatsAppInstance.findFirst({
        where: {
          workspaceId: params.workspaceId,
          name: params.name,
        },
        select: { id: true },
      }),
    ]);

    const limit = subscription?.plan.maxInstances ?? 1;

    if (used >= limit) {
      throw new InstanceReservationError(
        "Tu plan no permite crear mas instancias.",
        403,
      );
    }

    if (existing) {
      throw new InstanceReservationError(
        "Ya existe una instancia con ese nombre.",
        409,
      );
    }

    return tx.whatsAppInstance.create({
      data: {
        workspaceId: params.workspaceId,
        name: params.name,
        provider: params.provider,
        providerInstanceId: params.providerInstanceName,
        status: "CONNECTING",
        capabilities: {
          qr: true,
          cloudApiReady: false,
          provider: "evolution-api",
        },
      },
    });
  });
}
