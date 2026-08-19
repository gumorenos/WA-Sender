import type { Prisma } from "@prisma/client";

export class WorkspacePlanLimitError extends Error {
  constructor(
    message: string,
    public readonly status = 403,
    public readonly code = "PLAN_LIMIT_REACHED",
  ) {
    super(message);
    this.name = "WorkspacePlanLimitError";
  }
}

export async function acquireWorkspaceLimitLock(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  scope: string,
) {
  const lockKey = `wa-sender:${scope}:${workspaceId}`;

  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}

export async function assertActiveCampaignLimit(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  excludeCampaignId?: string,
) {
  await acquireWorkspaceLimitLock(tx, workspaceId, "active-campaigns");

  const [subscription, activeCount] = await Promise.all([
    tx.subscription.findUnique({
      where: { workspaceId },
      select: {
        plan: {
          select: {
            maxActiveCampaigns: true,
          },
        },
      },
    }),
    tx.campaign.count({
      where: {
        workspaceId,
        ...(excludeCampaignId ? { id: { not: excludeCampaignId } } : {}),
        status: { in: ["SCHEDULED", "RUNNING", "PAUSED"] },
      },
    }),
  ]);

  const limit = subscription?.plan.maxActiveCampaigns ?? 1;

  if (activeCount >= limit) {
    throw new WorkspacePlanLimitError(
      `Tu plan permite como maximo ${limit} campana${limit === 1 ? "" : "s"} activa${limit === 1 ? "" : "s"} a la vez.`,
      403,
      "MAX_ACTIVE_CAMPAIGNS_REACHED",
    );
  }

  return { activeCount, limit };
}

export async function assertAgentLimit(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  await acquireWorkspaceLimitLock(tx, workspaceId, "agents");

  const [subscription, currentAgents] = await Promise.all([
    tx.subscription.findUnique({
      where: { workspaceId },
      select: {
        plan: {
          select: {
            maxAgents: true,
          },
        },
      },
    }),
    tx.agent.count({ where: { workspaceId } }),
  ]);

  const limit = subscription?.plan.maxAgents ?? 2;

  if (currentAgents >= limit) {
    throw new WorkspacePlanLimitError(
      `Tu plan permite como maximo ${limit} agente${limit === 1 ? "" : "s"}.`,
      403,
      "MAX_AGENTS_REACHED",
    );
  }

  return { currentAgents, limit };
}

export async function assertInstanceLimit(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  await acquireWorkspaceLimitLock(tx, workspaceId, "instances");

  const [subscription, currentInstances] = await Promise.all([
    tx.subscription.findUnique({
      where: { workspaceId },
      select: {
        plan: {
          select: {
            maxInstances: true,
          },
        },
      },
    }),
    tx.whatsAppInstance.count({ where: { workspaceId } }),
  ]);

  const limit = subscription?.plan.maxInstances ?? 1;

  if (currentInstances >= limit) {
    throw new WorkspacePlanLimitError(
      `Tu plan permite como maximo ${limit} instancia${limit === 1 ? "" : "s"}.`,
      403,
      "MAX_INSTANCES_REACHED",
    );
  }

  return { currentInstances, limit };
}
