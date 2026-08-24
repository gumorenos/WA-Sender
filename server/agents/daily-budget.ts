import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

const DEFAULT_DAILY_LLM_LIMIT = 50;
const DEFAULT_DAILY_PROVIDER_CALL_LIMIT = 50;
const MAX_DAILY_AGENT_LIMIT = 100_000;

export type AgentDailyBudgetEnv = {
  AGENT_DAILY_LLM_LIMIT?: string;
  AGENT_DAILY_PROVIDER_CALL_LIMIT?: string;
};

export type AgentBudgetReservation =
  | {
      reserved: true;
      usageDate: string;
      timezone: string;
      limit: number;
      usedBefore: number;
      usedAfter: number;
    }
  | {
      reserved: false;
      reason: "WORKSPACE_NOT_FOUND" | "DAILY_LIMIT_REACHED";
      usageDate?: string;
      timezone?: string;
      limit: number;
      usedBefore?: number;
    };

function safeDailyLimit(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.min(MAX_DAILY_AGENT_LIMIT, Math.floor(parsed));
}

export function getAgentDailyBudgetLimits(env?: AgentDailyBudgetEnv) {
  const source =
    env ??
    ({
      AGENT_DAILY_LLM_LIMIT: process.env.AGENT_DAILY_LLM_LIMIT,
      AGENT_DAILY_PROVIDER_CALL_LIMIT: process.env.AGENT_DAILY_PROVIDER_CALL_LIMIT,
    } satisfies AgentDailyBudgetEnv);

  return {
    llmAttempts: safeDailyLimit(
      source.AGENT_DAILY_LLM_LIMIT,
      DEFAULT_DAILY_LLM_LIMIT,
    ),
    providerStarts: safeDailyLimit(
      source.AGENT_DAILY_PROVIDER_CALL_LIMIT,
      DEFAULT_DAILY_PROVIDER_CALL_LIMIT,
    ),
  };
}

export function getAgentBudgetDateKey(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function acquireAgentDailyBudgetLock(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  await tx.$queryRawUnsafe(
    "SELECT 1 AS lock FROM (SELECT pg_advisory_xact_lock(hashtext($1))) AS acquired",
    `agent-daily-budget:${workspaceId}`,
  );
}

async function getUsageContext(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  now: Date,
) {
  const workspace = await tx.workspace.findFirst({
    where: { id: workspaceId, status: "ACTIVE" },
    select: { id: true, timezone: true },
  });

  if (!workspace) {
    return null;
  }

  const usageDate = getAgentBudgetDateKey(now, workspace.timezone);
  const usage = await tx.agentDailyUsage.upsert({
    where: {
      workspaceId_usageDate: {
        workspaceId,
        usageDate,
      },
    },
    create: {
      workspaceId,
      usageDate,
      timezone: workspace.timezone,
    },
    update: {
      timezone: workspace.timezone,
    },
  });

  return {
    usage,
    usageDate,
    timezone: workspace.timezone,
  };
}

async function reserveCounter(
  tx: Prisma.TransactionClient,
  params: {
    workspaceId: string;
    now: Date;
    limit: number;
    counter: "llmAttempts" | "providerStarts";
    deniedCounter: "llmDenied" | "providerDenied";
  },
): Promise<AgentBudgetReservation> {
  await acquireAgentDailyBudgetLock(tx, params.workspaceId);
  const context = await getUsageContext(tx, params.workspaceId, params.now);

  if (!context) {
    return {
      reserved: false,
      reason: "WORKSPACE_NOT_FOUND",
      limit: params.limit,
    };
  }

  const usedBefore = context.usage[params.counter];
  const reserved = await tx.agentDailyUsage.updateMany({
    where: {
      id: context.usage.id,
      [params.counter]: { lt: params.limit },
    },
    data: {
      [params.counter]: { increment: 1 },
    },
  });

  if (reserved.count === 1) {
    return {
      reserved: true,
      usageDate: context.usageDate,
      timezone: context.timezone,
      limit: params.limit,
      usedBefore,
      usedAfter: usedBefore + 1,
    };
  }

  await tx.agentDailyUsage.update({
    where: { id: context.usage.id },
    data: {
      [params.deniedCounter]: { increment: 1 },
    },
  });

  return {
    reserved: false,
    reason: "DAILY_LIMIT_REACHED",
    usageDate: context.usageDate,
    timezone: context.timezone,
    limit: params.limit,
    usedBefore,
  };
}

export async function reserveAgentLlmAttempt(params: {
  workspaceId: string;
  now?: Date;
  env?: AgentDailyBudgetEnv;
}) {
  const limits = getAgentDailyBudgetLimits(params.env);

  return prisma.$transaction((tx) =>
    reserveCounter(tx, {
      workspaceId: params.workspaceId,
      now: params.now ?? new Date(),
      limit: limits.llmAttempts,
      counter: "llmAttempts",
      deniedCounter: "llmDenied",
    }),
  );
}

export async function reserveAgentProviderStartInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    workspaceId: string;
    now?: Date;
    env?: AgentDailyBudgetEnv;
  },
) {
  const limits = getAgentDailyBudgetLimits(params.env);

  return reserveCounter(tx, {
    workspaceId: params.workspaceId,
    now: params.now ?? new Date(),
    limit: limits.providerStarts,
    counter: "providerStarts",
    deniedCounter: "providerDenied",
  });
}
