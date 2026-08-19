import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

import {
  getAgentReplyBlockReason,
  isAgentAutoReplyGloballyEnabled,
  isAgentRealReplyEnabled,
  isRealSendingEnabled,
} from "@/lib/agents/runtime-safety";
import { containsOptOutKeyword, getZonedTimeInMinutes } from "@/lib/campaigns/scheduling";
import { prisma } from "@/lib/db";
import {
  EvolutionApiError,
  sendEvolutionTextMessage,
} from "@/lib/evolution/client";
import {
  parseEvolutionWebhookPayload,
  type ParsedEvolutionWebhookMessage,
} from "@/lib/evolution/webhook-parser";
import {
  getLlmProvider,
  LlmProviderError,
  type LlmMessage,
} from "@/lib/llm";

const MAX_CONTEXT_MESSAGES = 20;

type WebhookResult = {
  ok: true;
  action: string;
  details?: Record<string, unknown>;
};

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function agentTimezone() {
  return process.env.AGENT_DEFAULT_TIMEZONE || "America/Lima";
}

function shouldIgnoreGroups() {
  return process.env.AGENT_IGNORE_GROUPS !== "false";
}

function optOutConfirmation() {
  return (
    process.env.AGENT_OPT_OUT_CONFIRMATION ||
    "Confirmamos que no recibiras mas mensajes automaticos. Si necesitas ayuda, escribe a un asesor humano."
  );
}

function safeError(error: unknown) {
  if (error instanceof LlmProviderError || error instanceof EvolutionApiError) {
    return error.message;
  }

  return "Error interno.";
}

function contactAuditMetadata(phone: string) {
  return {
    phoneLast4: phone.slice(-4),
    phoneHash: createHash("sha256").update(phone).digest("hex").slice(0, 16),
  };
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isQuietHoursNow({
  end,
  now = new Date(),
  start,
  timezone,
}: {
  start: string | null | undefined;
  end: string | null | undefined;
  now?: Date;
  timezone: string;
}) {
  if (!start || !end) {
    return false;
  }

  const quietStart = minutesFromTime(start);
  const quietEnd = minutesFromTime(end);
  const current = getZonedTimeInMinutes(now, timezone);

  if (quietStart < quietEnd) {
    return current >= quietStart && current <= quietEnd;
  }

  return current >= quietStart || current <= quietEnd;
}

function buildGuardedSystemPrompt(systemPrompt: string) {
  return `${systemPrompt}

Reglas operativas obligatorias para WhatsApp:
- Responde solo dentro del contexto del negocio y de las instrucciones del agente.
- Si no sabes la respuesta, no inventes informacion; ofrece derivar a un humano.
- Si el usuario pide dejar de recibir mensajes, no sigas la conversacion.
- Manten respuestas breves, utiles y seguras para una conversacion de WhatsApp.`;
}

async function getConversation(params: {
  agentId?: string | null;
  instanceId: string;
  message: ParsedEvolutionWebhookMessage;
  workspaceId: string;
}) {
  const now = new Date();
  const updateData: Prisma.ConversationUpdateInput = {
    lastMessageAt: now,
    ...(params.message.pushName
      ? { contactDisplayName: params.message.pushName }
      : {}),
    ...(params.agentId ? { agent: { connect: { id: params.agentId } } } : {}),
  };

  return prisma.conversation.upsert({
    where: {
      workspaceId_instanceId_contactPhone: {
        workspaceId: params.workspaceId,
        instanceId: params.instanceId,
        contactPhone: params.message.phone,
      },
    },
    create: {
      workspaceId: params.workspaceId,
      instanceId: params.instanceId,
      agentId: params.agentId ?? null,
      contactPhone: params.message.phone,
      contactDisplayName: params.message.pushName,
      lastMessageAt: now,
    },
    update: updateData,
  });
}

async function storeInboundMessage(params: {
  conversationId: string;
  message: ParsedEvolutionWebhookMessage;
  workspaceId: string;
}) {
  return prisma.conversationMessage.create({
    data: {
      workspaceId: params.workspaceId,
      conversationId: params.conversationId,
      role: "user",
      direction: "inbound",
      content: params.message.text,
      providerMessageId: params.message.providerMessageId,
      metadata: {
        remoteJid: params.message.remoteJid,
      },
    },
  });
}

async function registerOptOut(params: {
  conversationId: string;
  instanceId: string;
  message: ParsedEvolutionWebhookMessage;
  providerInstanceId: string;
  workspaceId: string;
}): Promise<WebhookResult> {
  const campaignMessages = await prisma.campaignMessage.findMany({
    where: {
      workspaceId: params.workspaceId,
      recipientPhone: params.message.phone,
    },
    select: {
      id: true,
      campaignId: true,
    },
    take: 50,
  });

  const optOut = await prisma.$transaction(async (tx) => {
    const saved = await tx.optOut.upsert({
      where: {
        workspaceId_phone: {
          workspaceId: params.workspaceId,
          phone: params.message.phone,
        },
      },
      create: {
        workspaceId: params.workspaceId,
        instanceId: params.instanceId,
        phone: params.message.phone,
        source: "evolution_webhook",
        reason: params.message.text.slice(0, 500),
      },
      update: {
        instanceId: params.instanceId,
        source: "evolution_webhook",
        reason: params.message.text.slice(0, 500),
      },
    });

    await tx.campaignMessage.updateMany({
      where: {
        workspaceId: params.workspaceId,
        recipientPhone: params.message.phone,
      },
      data: {
        consentStatus: "EXPLICITLY_DENIED",
        optInStatus: "DENIED",
      },
    });

    await tx.extractedNumber.upsert({
      where: {
        workspaceId_phone_source: {
          workspaceId: params.workspaceId,
          phone: params.message.phone,
          source: "opt_out_webhook",
        },
      },
      create: {
        workspaceId: params.workspaceId,
        instanceId: params.instanceId,
        phone: params.message.phone,
        displayName: params.message.pushName,
        source: "opt_out_webhook",
        optInStatus: "DENIED",
        consentStatus: "EXPLICITLY_DENIED",
      },
      update: {
        instanceId: params.instanceId,
        displayName: params.message.pushName,
        optInStatus: "DENIED",
        consentStatus: "EXPLICITLY_DENIED",
      },
    });

    await Promise.all(
      campaignMessages.map((message) =>
        tx.campaignEvent.create({
          data: {
            workspaceId: params.workspaceId,
            campaignId: message.campaignId,
            messageId: message.id,
            type: "OPT_OUT_REGISTERED",
            payload: {
              source: "evolution_webhook",
            },
          },
        }),
      ),
    );

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        action: "OPT_OUT_REGISTERED",
        resourceType: "opt_out",
        resourceId: saved.id,
        metadata: {
          ...contactAuditMetadata(params.message.phone),
          instanceId: params.instanceId,
          affectedCampaignMessages: campaignMessages.length,
        },
      },
    });

    return saved;
  });

  try {
    const confirmation = await sendEvolutionTextMessage({
      providerInstanceName: params.providerInstanceId,
      phone: params.message.phone,
      message: optOutConfirmation(),
    });

    await prisma.conversationMessage.create({
      data: {
        workspaceId: params.workspaceId,
        conversationId: params.conversationId,
        role: "assistant",
        direction: "outbound",
        content: optOutConfirmation(),
        providerMessageId: confirmation.providerMessageId,
        metadata: {
          optOutConfirmation: true,
          providerStatus: confirmation.status,
          mocked: confirmation.mocked,
        },
      },
    });

    return {
      ok: true,
      action: "opt_out_registered",
      details: {
        affectedMessages: campaignMessages.length,
        confirmation: confirmation.status,
        optOutId: optOut.id,
      },
    } satisfies WebhookResult;
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        action: "UPDATED",
        resourceType: "opt_out_confirmation",
        resourceId: optOut.id,
        metadata: {
          code: "OPT_OUT_CONFIRMATION_SEND_FAILED",
          error: safeError(error),
        },
      },
    });

    return {
      ok: true,
      action: "opt_out_registered_confirmation_failed",
      details: {
        affectedMessages: campaignMessages.length,
        optOutId: optOut.id,
      },
    };
  }
}

async function isBlockedContact(params: {
  phone: string;
  workspaceId: string;
}) {
  const [optOut, deniedExtractedNumber] = await Promise.all([
    prisma.optOut.findUnique({
      where: {
        workspaceId_phone: {
          workspaceId: params.workspaceId,
          phone: params.phone,
        },
      },
      select: { id: true },
    }),
    prisma.extractedNumber.findFirst({
      where: {
        workspaceId: params.workspaceId,
        phone: params.phone,
        OR: [
          { consentStatus: "EXPLICITLY_DENIED" },
          { optInStatus: "DENIED" },
        ],
      },
      select: { id: true },
    }),
  ]);

  return Boolean(optOut || deniedExtractedNumber);
}

async function isRateLimited(conversationId: string) {
  const limitSeconds = envNumber("AGENT_REPLY_RATE_LIMIT_SECONDS", 60);
  const since = new Date(Date.now() - limitSeconds * 1000);

  const recentReply = await prisma.conversationMessage.findFirst({
    where: {
      conversationId,
      role: "assistant",
      direction: "outbound",
      createdAt: {
        gte: since,
      },
    },
    select: { id: true },
  });

  return Boolean(recentReply);
}

async function isLlmCircuitOpen(params: {
  agentId: string;
  workspaceId: string;
}) {
  const threshold = envNumber("AGENT_LLM_CIRCUIT_BREAKER_THRESHOLD", 3);
  const windowMinutes = envNumber("AGENT_LLM_CIRCUIT_BREAKER_WINDOW_MINUTES", 10);
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const failures = await prisma.auditLog.count({
    where: {
      workspaceId: params.workspaceId,
      resourceType: "agent_webhook_llm_failure",
      resourceId: params.agentId,
      createdAt: {
        gte: since,
      },
    },
  });

  return failures >= threshold;
}

async function toLlmHistory(conversationId: string): Promise<LlmMessage[]> {
  const messages = await prisma.conversationMessage.findMany({
    where: {
      conversationId,
      role: {
        in: ["user", "assistant"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: MAX_CONTEXT_MESSAGES,
  });

  return messages
    .reverse()
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content.slice(0, 1200),
    }));
}

export async function handleEvolutionWebhook(
  payload: unknown,
): Promise<WebhookResult> {
  const parsed = parseEvolutionWebhookPayload(payload);

  if (!parsed) {
    return { ok: true, action: "ignored_unrecognized_payload" };
  }

  const message: ParsedEvolutionWebhookMessage = {
    ...parsed,
    text: parsed.text.slice(0, envNumber("AGENT_WEBHOOK_MAX_MESSAGE_CHARS", 1200)),
  };

  if (message.fromMe) {
    return { ok: true, action: "ignored_from_me" };
  }

  if (message.isGroup && shouldIgnoreGroups()) {
    return { ok: true, action: "ignored_group" };
  }

  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      providerInstanceId: message.providerInstanceId,
    },
    select: {
      id: true,
      workspaceId: true,
      providerInstanceId: true,
    },
  });

  if (!instance) {
    return { ok: true, action: "instance_not_found" };
  }

  const assignment = await prisma.agentInstanceAssignment.findFirst({
    where: {
      workspaceId: instance.workspaceId,
      instanceId: instance.id,
      active: true,
    },
    include: {
      agent: {
        include: {
          activeVersion: true,
          settings: true,
        },
      },
    },
  });

  const conversation = await getConversation({
    workspaceId: instance.workspaceId,
    instanceId: instance.id,
    agentId: assignment?.agentId ?? null,
    message,
  });

  await storeInboundMessage({
    workspaceId: instance.workspaceId,
    conversationId: conversation.id,
    message,
  });

  if (containsOptOutKeyword(message.text)) {
    return registerOptOut({
      workspaceId: instance.workspaceId,
      instanceId: instance.id,
      providerInstanceId: message.providerInstanceId,
      conversationId: conversation.id,
      message,
    });
  }

  if (await isBlockedContact({ workspaceId: instance.workspaceId, phone: message.phone })) {
    return { ok: true, action: "ignored_blocked_contact" };
  }

  if (!isAgentAutoReplyGloballyEnabled()) {
    return { ok: true, action: "ignored_agent_autoreply_globally_disabled" };
  }

  if (!assignment) {
    return { ok: true, action: "ignored_no_agent_assignment" };
  }

  const agent = assignment.agent;

  if (agent.status !== "ACTIVE") {
    return { ok: true, action: "ignored_agent_not_active" };
  }

  if (!agent.activeVersion) {
    return { ok: true, action: "ignored_agent_without_active_version" };
  }

  const replyBlockReason = getAgentReplyBlockReason({
    globalAutoReplyEnabled: true,
    agentAutoReplyEnabled: agent.settings?.autoReplyEnabled === true,
    realSendingEnabled: isRealSendingEnabled(),
    realReplyEnabled: isAgentRealReplyEnabled(),
  });

  if (replyBlockReason === "AGENT_AUTOREPLY_DISABLED") {
    return { ok: true, action: "ignored_agent_autoreply_disabled" };
  }

  if (replyBlockReason === "REAL_REPLY_DISABLED") {
    return { ok: true, action: "ignored_agent_real_reply_disabled" };
  }

  if (replyBlockReason) {
    return { ok: true, action: "ignored_agent_reply_safety_gate" };
  }

  if (
    isQuietHoursNow({
      start: agent.settings?.quietHoursStart,
      end: agent.settings?.quietHoursEnd,
      timezone: agentTimezone(),
    })
  ) {
    await prisma.auditLog.create({
      data: {
        workspaceId: instance.workspaceId,
        action: "UPDATED",
        resourceType: "agent_webhook",
        resourceId: agent.id,
        metadata: {
          action: "quiet_hours_ignored",
          instanceId: instance.id,
          ...contactAuditMetadata(message.phone),
          timezone: agentTimezone(),
        },
      },
    });

    return { ok: true, action: "ignored_outside_agent_availability" };
  }

  if (await isRateLimited(conversation.id)) {
    return { ok: true, action: "ignored_rate_limited" };
  }

  if (
    await isLlmCircuitOpen({
      workspaceId: instance.workspaceId,
      agentId: agent.id,
    })
  ) {
    return { ok: true, action: "ignored_llm_circuit_open" };
  }

  try {
    const { name: providerName, provider } = getLlmProvider(agent.llmProvider);
    const response = await provider.generateResponse({
      systemPrompt: buildGuardedSystemPrompt(agent.activeVersion.generatedPrompt),
      messages: await toLlmHistory(conversation.id),
      temperature: 0.35,
      maxTokens: 500,
      model: agent.modelName,
    });

    const sent = await sendEvolutionTextMessage({
      providerInstanceName: message.providerInstanceId,
      phone: message.phone,
      message: response.content,
    });

    await prisma.$transaction([
      prisma.conversationMessage.create({
        data: {
          workspaceId: instance.workspaceId,
          conversationId: conversation.id,
          role: "assistant",
          direction: "outbound",
          content: response.content,
          providerMessageId: sent.providerMessageId,
          metadata: {
            provider: response.provider,
            model: response.model,
            sendStatus: sent.status,
            mocked: sent.mocked,
          },
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          agentId: agent.id,
          lastMessageAt: new Date(),
        },
      }),
      prisma.auditLog.create({
        data: {
          workspaceId: instance.workspaceId,
          action: "UPDATED",
          resourceType: "agent_webhook",
          resourceId: agent.id,
          metadata: {
            action: "auto_reply_sent",
            instanceId: instance.id,
            provider: providerName,
            model: response.model,
            mocked: sent.mocked,
          },
        },
      }),
    ]);

    return {
      ok: true,
      action: "agent_reply_sent",
      details: {
        provider: response.provider,
        model: response.model,
        sendStatus: sent.status,
        mocked: sent.mocked,
      },
    };
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        workspaceId: instance.workspaceId,
        action: "UPDATED",
        resourceType: "agent_webhook_llm_failure",
        resourceId: agent.id,
        metadata: {
          instanceId: instance.id,
          ...contactAuditMetadata(message.phone),
          error: safeError(error),
          provider: agent.llmProvider,
          modelName: agent.modelName,
        },
      },
    });

    return {
      ok: true,
      action: error instanceof EvolutionApiError ? "agent_send_failed" : "llm_failed",
      details: {
        error: safeError(error),
      },
    };
  }
}
