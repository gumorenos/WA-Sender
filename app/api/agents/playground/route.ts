import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import { prisma } from "@/lib/db";
import { getLlmProvider, LlmProviderError, type LlmMessage } from "@/lib/llm";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import { reserveAgentLlmAttempt } from "@/server/agents/daily-budget";

const MAX_STORED_MESSAGES = 40;
const MAX_CONTEXT_MESSAGES = 20;

const playgroundRequestSchema = z.object({
  agentId: z.string().cuid("Selecciona un agente valido."),
  sessionId: z.string().cuid().optional().nullable(),
  message: z
    .string()
    .trim()
    .min(1, "Escribe un mensaje para probar el agente.")
    .max(1200, "El mensaje no puede superar 1200 caracteres."),
});

type PlaygroundStoredMessage = LlmMessage & {
  id: string;
  createdAt: string;
  provider?: string;
  model?: string;
};

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

function toStoredMessages(value: Prisma.JsonValue): PlaygroundStoredMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<PlaygroundStoredMessage[]>((messages, item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return messages;
    }

    const data = item as Record<string, unknown>;
    const role: PlaygroundStoredMessage["role"] =
      data.role === "assistant" ? "assistant" : "user";

    const storedMessage = {
      id: typeof data.id === "string" ? data.id : crypto.randomUUID(),
      role,
      content:
        typeof data.content === "string" ? data.content.slice(0, 4000) : "",
      createdAt:
        typeof data.createdAt === "string"
          ? data.createdAt
          : new Date().toISOString(),
      provider: typeof data.provider === "string" ? data.provider : undefined,
      model: typeof data.model === "string" ? data.model : undefined,
    };

    if (storedMessage.content.trim().length > 0) {
      messages.push(storedMessage);
    }

    return messages;
  }, []);
}

function toLlmMessages(messages: PlaygroundStoredMessage[]): LlmMessage[] {
  return messages.slice(-MAX_CONTEXT_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export async function POST(request: Request) {
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return jsonError(authorization.error, authorization.status);
  }

  const context = authorization.context;

  try {
    await enforceRateLimit({
      key: buildRateLimitKey([
        "agents:playground",
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

  const parsed = playgroundRequestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Datos invalidos.",
      400,
      parsed.error.flatten(),
    );
  }

  const { agentId, message, sessionId } = parsed.data;

  const agent = await prisma.agent.findFirst({
    where: {
      id: agentId,
      workspaceId: context.workspace.id,
    },
    include: {
      activeVersion: true,
    },
  });

  if (!agent) {
    return jsonError("Agente no encontrado.", 404);
  }

  if (!agent.activeVersion) {
    return jsonError("El agente no tiene una version activa para probar.", 409);
  }

  const llmBudget = await reserveAgentLlmAttempt({
    workspaceId: context.workspace.id,
  });

  if (!llmBudget.reserved) {
    if (llmBudget.reason === "WORKSPACE_NOT_FOUND") {
      return jsonError("El workspace ya no esta disponible.", 409, {
        code: "WORKSPACE_DISABLED",
      });
    }

    return jsonError(
      "Se alcanzo el limite diario de llamadas LLM del workspace.",
      429,
      {
        code: "AGENT_DAILY_LLM_LIMIT",
        usageDate: llmBudget.usageDate,
        limit: llmBudget.limit,
        used: llmBudget.usedBefore ?? llmBudget.limit,
      },
    );
  }

  const session = sessionId
    ? await prisma.playgroundSession.findFirst({
        where: {
          id: sessionId,
          agentId: agent.id,
          workspaceId: context.workspace.id,
        },
      })
    : await prisma.playgroundSession.create({
        data: {
          workspaceId: context.workspace.id,
          agentId: agent.id,
          title: `Playground - ${agent.name}`,
          messages: [],
        },
      });

  if (!session) {
    return jsonError("Sesion de playground no encontrada.", 404);
  }

  const now = new Date().toISOString();
  const existingMessages = toStoredMessages(session.messages);
  const userMessage: PlaygroundStoredMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    createdAt: now,
  };

  try {
    const { name: providerName, provider } = getLlmProvider(agent.llmProvider);
    const response = await provider.generateResponse({
      systemPrompt: agent.activeVersion.generatedPrompt,
      messages: toLlmMessages([...existingMessages, userMessage]),
      temperature: 0.4,
      maxTokens: 500,
      model: agent.modelName,
    });

    const assistantMessage: PlaygroundStoredMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: response.content,
      createdAt: new Date().toISOString(),
      provider: response.provider,
      model: response.model,
    };
    const nextMessages = [...existingMessages, userMessage, assistantMessage].slice(
      -MAX_STORED_MESSAGES,
    );

    const updatedSession = await prisma.playgroundSession.update({
      where: { id: session.id },
      data: {
        messages: nextMessages satisfies Prisma.InputJsonValue,
      },
    });

    console.info("agent_playground_message", {
      workspaceId: context.workspace.id,
      agentId: agent.id,
      sessionId: updatedSession.id,
      provider: providerName,
      model: response.model,
      inputLength: message.length,
      dailyBudgetDate: llmBudget.usageDate,
      dailyLlmLimit: llmBudget.limit,
      dailyLlmUsedAfter: llmBudget.usedAfter,
    });

    return NextResponse.json({
      sessionId: updatedSession.id,
      agent: {
        id: agent.id,
        name: agent.name,
        activeVersionNumber: agent.activeVersion.versionNumber,
      },
      provider: response.provider,
      model: response.model,
      messages: nextMessages,
      budget: {
        usageDate: llmBudget.usageDate,
        limit: llmBudget.limit,
        usedAfter: llmBudget.usedAfter,
      },
    });
  } catch (error) {
    if (error instanceof LlmProviderError) {
      await prisma.auditLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorUserId: context.user.id,
          action: "UPDATED",
          resourceType: "llm",
          resourceId: agent.id,
          metadata: {
            code: error.code,
            provider: agent.llmProvider,
            modelName: agent.modelName,
            dailyBudgetDate: llmBudget.usageDate,
            dailyLlmLimit: llmBudget.limit,
            dailyLlmUsedAfter: llmBudget.usedAfter,
          },
        },
      });
      return jsonError(error.message, error.status, { code: error.code });
    }

    console.error("agent_playground_unhandled_error", {
      workspaceId: context.workspace.id,
      agentId: agent.id,
      sessionId: session.id,
    });
    await prisma.auditLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorUserId: context.user.id,
        action: "UPDATED",
        resourceType: "llm",
        resourceId: agent.id,
        metadata: {
          code: "LLM_UNKNOWN_ERROR",
          provider: agent.llmProvider,
          modelName: agent.modelName,
          dailyBudgetDate: llmBudget.usageDate,
          dailyLlmLimit: llmBudget.limit,
          dailyLlmUsedAfter: llmBudget.usedAfter,
        },
      },
    });

    return jsonError("No se pudo generar la respuesta del agente.", 500);
  }
}