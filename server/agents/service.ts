import type {
  AgentSource,
  AgentStatus,
  LlmProvider,
  Prisma,
} from "@prisma/client";

import {
  buildBuilderPrompt,
  buildManualPrompt,
  estimateTokenCount,
} from "@/lib/agents/prompt-builder";
import type {
  BuilderAgentInput,
  CreateAgentInput,
  ManualAgentInput,
  UpdateAgentInput,
} from "@/lib/agents/schemas";
import { prisma } from "@/lib/db";
import {
  assertAgentLimit,
  WorkspacePlanLimitError,
} from "@/server/limits/workspace-plan";

type AgentContext = {
  userId: string;
  workspaceId: string;
};

export class AgentServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AgentServiceError";
  }
}

function toNullableString(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function buildAgentDraft(input: ManualAgentInput | BuilderAgentInput) {
  if (input.source === "MANUAL") {
    const built = buildManualPrompt(input);
    return {
      name: input.name.trim(),
      source: "MANUAL" as const,
      generatedPrompt: built.prompt,
      systemPrompt: built.prompt,
      builderInput: undefined,
      config: built.config satisfies Prisma.InputJsonValue,
      llmProvider: input.llmProvider,
      modelName: toNullableString(input.modelName),
    };
  }

  const built = buildBuilderPrompt(input);
  return {
    name: input.identity.assistantName.trim(),
    source: "BUILDER" as const,
    generatedPrompt: built.prompt,
    systemPrompt: built.prompt,
    builderInput: input satisfies Prisma.InputJsonValue,
    config: built.config satisfies Prisma.InputJsonValue,
    llmProvider: input.llmProvider,
    modelName: toNullableString(input.modelName),
  };
}

async function writeAuditLog(params: {
  action: "CREATED" | "UPDATED";
  actorUserId: string;
  resourceId: string;
  workspaceId: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      actorUserId: params.actorUserId,
      action: params.action,
      resourceType: "agent",
      resourceId: params.resourceId,
      metadata: params.metadata,
    },
  });
}

async function getOwnedAgent(agentId: string, workspaceId: string) {
  const agent = await prisma.agent.findFirst({
    where: {
      id: agentId,
      workspaceId,
    },
    include: {
      activeVersion: true,
      settings: true,
      versions: {
        orderBy: {
          versionNumber: "desc",
        },
      },
    },
  });

  if (!agent) {
    throw new AgentServiceError("Agente no encontrado.", 404);
  }

  return agent;
}

export async function createAgent(input: CreateAgentInput, context: AgentContext) {
  const draft = buildAgentDraft(input);

  try {
    return await prisma.$transaction(async (tx) => {
      await assertAgentLimit(tx, context.workspaceId);

      const agent = await tx.agent.create({
        data: {
          workspaceId: context.workspaceId,
          name: draft.name,
          source: draft.source,
          llmProvider: draft.llmProvider,
          modelName: draft.modelName,
          status: "DRAFT",
        },
      });

      const version = await tx.agentVersion.create({
        data: {
          workspaceId: context.workspaceId,
          agentId: agent.id,
          versionNumber: 1,
          source: draft.source,
          ...(draft.builderInput !== undefined
            ? { builderInput: draft.builderInput }
            : {}),
          generatedPrompt: draft.generatedPrompt,
          systemPrompt: draft.systemPrompt,
          config: draft.config,
        },
      });

      await tx.agentSetting.create({
        data: {
          workspaceId: context.workspaceId,
          agentId: agent.id,
        },
      });

      const created = await tx.agent.update({
        where: { id: agent.id },
        data: {
          activeAgentVersionId: version.id,
        },
        include: {
          activeVersion: true,
          settings: true,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          action: "CREATED",
          resourceType: "agent",
          resourceId: created.id,
          metadata: {
            source: draft.source,
          },
        },
      });

      return created;
    });
  } catch (error) {
    if (error instanceof WorkspacePlanLimitError) {
      throw new AgentServiceError(error.message, error.status);
    }

    throw error;
  }
}

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
  context: AgentContext,
) {
  const agent = await getOwnedAgent(agentId, context.workspaceId);
  const draft = buildAgentDraft(input);

  const updated = await prisma.$transaction(async (tx) => {
    const nextVersionNumber =
      (agent.versions[0]?.versionNumber ?? 0) + 1;

    const version = await tx.agentVersion.create({
      data: {
        workspaceId: context.workspaceId,
        agentId: agent.id,
        versionNumber: nextVersionNumber,
        source: draft.source,
        ...(draft.builderInput !== undefined
          ? { builderInput: draft.builderInput }
          : {}),
        generatedPrompt: draft.generatedPrompt,
        systemPrompt: draft.systemPrompt,
        config: draft.config,
      },
    });

    return tx.agent.update({
      where: { id: agent.id },
      data: {
        name: draft.name,
        source: draft.source,
        llmProvider: draft.llmProvider,
        modelName: draft.modelName,
        activeAgentVersionId: version.id,
      },
      include: {
        activeVersion: true,
        settings: true,
        versions: {
          orderBy: {
            versionNumber: "desc",
          },
        },
      },
    });
  });

  await writeAuditLog({
    action: "UPDATED",
    actorUserId: context.userId,
    resourceId: agent.id,
    workspaceId: context.workspaceId,
    metadata: {
      versionCreated: true,
      source: draft.source,
    },
  });

  return updated;
}

export async function updateAgentStatus(
  agentId: string,
  status: AgentStatus,
  context: AgentContext,
) {
  const agent = await getOwnedAgent(agentId, context.workspaceId);

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { status },
    include: {
      activeVersion: true,
      settings: true,
    },
  });

  await writeAuditLog({
    action: "UPDATED",
    actorUserId: context.userId,
    resourceId: agent.id,
    workspaceId: context.workspaceId,
    metadata: {
      event:
        status === "ACTIVE"
          ? "AGENT_ACTIVATED"
          : status === "INACTIVE"
            ? "AGENT_DEACTIVATED"
            : "AGENT_STATUS_UPDATED",
      status,
    },
  });

  return updated;
}

export function serializeAgent(agent: {
  id: string;
  name: string;
  source: AgentSource;
  status: AgentStatus;
  llmProvider: LlmProvider;
  modelName: string | null;
  createdAt: Date;
  updatedAt: Date;
  versions?: Array<{
    id: string;
    versionNumber: number;
    source: AgentSource;
    generatedPrompt: string;
    systemPrompt: string;
    config: Prisma.JsonValue | null;
    builderInput: Prisma.JsonValue | null;
    createdAt: Date;
  }>;
  activeVersion?: {
    id: string;
    versionNumber: number;
    source: AgentSource;
    generatedPrompt: string;
    systemPrompt: string;
    config: Prisma.JsonValue | null;
    builderInput: Prisma.JsonValue | null;
    createdAt: Date;
  } | null;
  settings?: {
    autoReplyEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    handoffKeywords: Prisma.JsonValue | null;
  } | null;
}) {
  function serializeVersion(version: {
    id: string;
    versionNumber: number;
    source: AgentSource;
    generatedPrompt: string;
    systemPrompt: string;
    config: Prisma.JsonValue | null;
    builderInput: Prisma.JsonValue | null;
    createdAt: Date;
  }) {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      source: version.source,
      generatedPrompt: version.generatedPrompt,
      systemPrompt: version.systemPrompt,
      config: version.config,
      builderInput: version.builderInput,
      createdAt: version.createdAt.toISOString(),
      tokenEstimate: estimateTokenCount(version.generatedPrompt),
      promptExcerpt:
        version.generatedPrompt.length > 180
          ? `${version.generatedPrompt.slice(0, 180).trim()}...`
          : version.generatedPrompt,
    };
  }

  return {
    id: agent.id,
    name: agent.name,
    source: agent.source,
    status: agent.status,
    llmProvider: agent.llmProvider,
    modelName: agent.modelName,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    activeVersion: agent.activeVersion
      ? serializeVersion(agent.activeVersion)
      : null,
    versions: agent.versions?.map(serializeVersion),
    settings: agent.settings
      ? {
          autoReplyEnabled: agent.settings.autoReplyEnabled,
          quietHoursStart: agent.settings.quietHoursStart,
          quietHoursEnd: agent.settings.quietHoursEnd,
          handoffKeywords: agent.settings.handoffKeywords,
        }
      : null,
  };
}

export async function listAgents(workspaceId: string) {
  const agents = await prisma.agent.findMany({
    where: { workspaceId },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      activeVersion: true,
      settings: true,
      versions: {
        orderBy: {
          versionNumber: "desc",
        },
        take: 1,
      },
    },
  });

  return agents.map(serializeAgent);
}

export async function getAgent(agentId: string, workspaceId: string) {
  const agent = await getOwnedAgent(agentId, workspaceId);
  return serializeAgent(agent);
}

export async function getAgentVersions(agentId: string, workspaceId: string) {
  const agent = await getOwnedAgent(agentId, workspaceId);

  return serializeAgent(agent).versions ?? [];
}
