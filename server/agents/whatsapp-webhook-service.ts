import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  CONVERSATION_HUMAN_HANDOFF_STATUS,
  findMatchingHandoffKeyword,
} from "@/lib/agents/handoff";
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
  getWebhookProviderEventId,
  hashWebhookPayload,
} from "@/lib/evolution/webhook-idempotency";
import {
  WEBHOOK_STATUS_PROCESSING,
  WEBHOOK_STATUS_RETRY_ALLOWED,
  WEBHOOK_STATUS_STALE_REVIEW,
} from "@/lib/evolution/webhook-recovery";
import {
  parseEvolutionWebhookPayload,
  type ParsedEvolutionWebhookMessage,
} from "@/lib/evolution/webhook-parser";
import {
  getLlmProvider,
  LlmProviderError,
  type LlmMessage,
} from "@/lib/llm";
import { acquireConversationReplyLock } from "@/server/agents/conversation-reply-lock";
import { startKeywordHandoff } from "@/server/agents/handoff-service";
import {
  abandonAutomationReplyGeneration,
  claimAutomationReplyGeneration,
  type AutomationReplyGenerationClaimResult,
} from "@/server/agents/reply-generation";
import {
  claimAutomationReplyDelivery,
  completeAutomationReplyDelivery,
  quarantineAutomationReplyDelivery,
  type AutomationReplyClaimResult,
} from "@/server/agents/reply-delivery";

const MAX_CONTEXT_MESSAGES = 20;
const WEBHOOK_PROVIDER = "EVOLUTION";

type WebhookResult = {
  ok: true;
  action: string;
  details?: Record<string, unknown>;
};

type WebhookInstance = {
  id: string;
  workspaceId: string;
  providerInstanceId: string | null;
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

function generationClaimAction(
  reason: Exclude<AutomationReplyGenerationClaimResult, { claimed: true }>["reason"],
) {
  switch (reason) {
    case "HUMAN_HANDOFF":
      return "ignored_human_handoff_before_llm";
    case "CONTACT_BLOCKED":
      return "ignored_blocked_contact_before_llm";
    case "AGENT_DISABLED":
      return "ignored_agent_disabled_before_llm";
    case "WORKSPACE_DISABLED":
      return "ignored_workspace_disabled_before_llm";
    case "GENERATION_IN_FLIGHT":
      return "ignored_llm_generation_in_flight";
    case "REPLY_IN_FLIGHT":
      return "ignored_reply_in_flight_before_llm";
    case "STALE_REPLY_REQUIRES_REVIEW":
      return "ignored_reply_delivery_requires_review_before_llm";
    case "RATE_LIMITED":
      return "ignored_rate_limited_before_llm";
    case "DAILY_LLM_LIMIT_REACHED":
      return "ignored_agent_daily_llm_limit";
    case "CONVERSATION_NOT_FOUND":
      return "ignored_conversation_not_found_before_llm";
  }
}

function replyClaimAction(
  reason: Exclude<AutomationReplyClaimResult, { claimed: true }>["reason"],
) {
  switch (reason) {
    case "GENERATION_LEASE_LOST":
      return "ignored_generation_lease_lost_before_send";
    case "HUMAN_HANDOFF":
      return "ignored_human_handoff_before_send";
    case "CONTACT_BLOCKED":
      return "ignored_blocked_contact_before_send";
    case "AGENT_DISABLED":
      return "ignored_agent_disabled_before_send";
    case "WORKSPACE_DISABLED":
      return "ignored_workspace_disabled_before_send";
    case "REPLY_IN_FLIGHT":
      return "ignored_reply_in_flight";
    case "STALE_REPLY_REQUIRES_REVIEW":
      return "ignored_reply_delivery_requires_review";
    case "RATE_LIMITED":
      return "ignored_rate_limited_before_send";
    case "DAILY_PROVIDER_LIMIT_REACHED":
      return "ignored_agent_daily_provider_limit";
    case "CONVERSATION_NOT_FOUND":
      return "ignored_conversation_not_found_before_send";
  }
}

async function recordWebhookDuplicateWithoutRefreshingProgress(eventId: string) {
  const now = new Date();

  await prisma.$executeRaw`
    UPDATE webhook_events
    SET duplicate_count = duplicate_count + 1,
        last_duplicate_at = ${now}
    WHERE id = ${eventId}
  `;
}

async function claimWebhookEvent(params: {
  instance: WebhookInstance;
  message: ParsedEvolutionWebhookMessage;
  payload: unknown;
}) {
  const providerEventId = getWebhookProviderEventId(params.message, params.payload);
  const payloadHash = hashWebhookPayload(params.payload);

  try {
    const event = await prisma.webhookEvent.create({
      data: {
        workspaceId: params.instance.workspaceId,
        instanceId: params.instance.id,
        provider: WEBHOOK_PROVIDER,
        providerEventId,
        payloadHash,
        status: WEBHOOK_STATUS_PROCESSING,
      },
      select: {
        id: true,
      },
    });

    return {
      claimed: true as const,
      eventId: event.id,
      providerEventId,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.webhookEvent.findFirst({
        where: {
          provider: WEBHOOK_PROVIDER,
          instanceId: params.instance.id,
          providerEventId,
        },
        select: {
          id: true,
          status: true,
          payloadHash: true,
        },
      });

      if (!existing) {
        return {
          claimed: false as const,
          eventId: null,
          providerEventId,
        };
      }

      if (existing.status === WEBHOOK_STATUS_RETRY_ALLOWED) {
        if (existing.payloadHash !== payloadHash) {
          const conflicted = await prisma.webhookEvent.updateMany({
            where: {
              id: existing.id,
              status: WEBHOOK_STATUS_RETRY_ALLOWED,
              payloadHash: existing.payloadHash,
            },
            data: {
              status: WEBHOOK_STATUS_STALE_REVIEW,
              action: "retry_payload_hash_mismatch",
              errorMessage:
                "La reentrega no coincide con el payload hash original. Recovery bloqueado para revision manual.",
              duplicateCount: { increment: 1 },
              lastDuplicateAt: new Date(),
              processedAt: null,
            },
          });

          if (conflicted.count === 0) {
            await recordWebhookDuplicateWithoutRefreshingProgress(existing.id);
          }

          return {
            claimed: false as const,
            eventId: null,
            providerEventId,
          };
        }

        const reclaimed = await prisma.webhookEvent.updateMany({
          where: {
            id: existing.id,
            status: WEBHOOK_STATUS_RETRY_ALLOWED,
            payloadHash,
          },
          data: {
            status: WEBHOOK_STATUS_PROCESSING,
            action: "retry_redelivery_processing",
            errorMessage: null,
            processedAt: null,
            duplicateCount: { increment: 1 },
            lastDuplicateAt: new Date(),
          },
        });

        if (reclaimed.count === 1) {
          return {
            claimed: true as const,
            eventId: existing.id,
            providerEventId,
          };
        }
      }

      await recordWebhookDuplicateWithoutRefreshingProgress(existing.id);

      return {
        claimed: false as const,
        eventId: null,
        providerEventId,
      };
    }

    throw error;
  }
}

async function markWebhookProcessed(eventId: string, result: WebhookResult) {
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: {
      status: "PROCESSED",
      action: result.action,
      processedAt: new Date(),
      errorMessage: null,
    },
  });
}

async function markWebhookFailed(eventId: string, error: unknown) {
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: {
      status: "FAILED",
      action: "processing_failed",
      processedAt: new Date(),
      errorMessage: safeError(error).slice(0, 500),
    },
  });
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
    await acquireConversationReplyLock(
      tx,
      params.workspaceId,
      params.conversationId,
    );

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

async function isConversationInHumanHandoff(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true },
  });

  return conversation?.status === CONVERSATION_HUMAN_HANDOFF_STATUS;
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

async function processClaimedEvolutionMessage(
  message: ParsedEvolutionWebhookMessage,
  instance: WebhookInstance,
): Promise<WebhookResult> {
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

  if (
    await isBlockedContact({
      workspaceId: instance.workspaceId,
      phone: message.phone,
    })
  ) {
    return { ok: true, action: "ignored_blocked_contact" };
  }

  if (conversation.status === CONVERSATION_HUMAN_HANDOFF_STATUS) {
    return { ok: true, action: "ignored_human_handoff" };
  }

  const matchedHandoffKeyword = findMatchingHandoffKeyword(
    message.text,
    assignment?.agent.settings?.handoffKeywords,
  );

  if (matchedHandoffKeyword) {
    const handoff = await startKeywordHandoff({
      conversationId: conversation.id,
      workspaceId: instance.workspaceId,
      keyword: matchedHandoffKeyword,
    });

    return {
      ok: true,
      action: handoff.changed ? "human_handoff_started" : "ignored_human_handoff",
    };
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

  if (await isConversationInHumanHandoff(conversation.id)) {
    return { ok: true, action: "ignored_human_handoff_before_llm" };
  }

  let generationLeaseId: string | null = null;

  try {
    const { name: providerName, provider } = getLlmProvider(agent.llmProvider);
    const generationClaim = await claimAutomationReplyGeneration({
      workspaceId: instance.workspaceId,
      conversationId: conversation.id,
      agentId: agent.id,
      provider: providerName,
      model: agent.modelName,
      rateLimitSeconds: envNumber("AGENT_REPLY_RATE_LIMIT_SECONDS", 60),
    });

    if (!generationClaim.claimed) {
      return {
        ok: true,
        action: generationClaimAction(generationClaim.reason),
        details: {
          reason: generationClaim.reason,
          usageDate: generationClaim.budget?.usageDate,
          limit: generationClaim.budget?.limit,
          usedBefore: generationClaim.budget?.usedBefore,
        },
      };
    }

    generationLeaseId = generationClaim.leaseId;

    const response = await provider.generateResponse({
      systemPrompt: buildGuardedSystemPrompt(agent.activeVersion.generatedPrompt),
      messages: await toLlmHistory(conversation.id),
      temperature: 0.35,
      maxTokens: 500,
      model: agent.modelName,
    });

    const replyClaim = await claimAutomationReplyDelivery({
      workspaceId: instance.workspaceId,
      conversationId: conversation.id,
      generationLeaseId,
      agentId: agent.id,
      content: response.content,
      provider: providerName,
      model: response.model,
      rateLimitSeconds: envNumber("AGENT_REPLY_RATE_LIMIT_SECONDS", 60),
    });

    if (!replyClaim.claimed) {
      return {
        ok: true,
        action: replyClaimAction(replyClaim.reason),
        details: {
          reason: replyClaim.reason,
          llmBudgetDate: generationClaim.budget.usageDate,
          llmBudgetUsedAfter: generationClaim.budget.usedAfter,
        },
      };
    }

    try {
      const sent = await sendEvolutionTextMessage({
        providerInstanceName: message.providerInstanceId,
        phone: message.phone,
        message: response.content,
      });

      const completed = await completeAutomationReplyDelivery({
        workspaceId: instance.workspaceId,
        conversationId: conversation.id,
        markerId: replyClaim.markerId,
        agentId: agent.id,
        providerMessageId: sent.providerMessageId,
        provider: providerName,
        model: response.model,
        sendStatus: sent.status,
        mocked: sent.mocked,
      });

      if (!completed) {
        throw new Error("Automation reply marker could not be completed.");
      }

      return {
        ok: true,
        action: "agent_reply_sent",
        details: {
          provider: response.provider,
          model: response.model,
          sendStatus: sent.status,
          mocked: sent.mocked,
          llmBudgetDate: generationClaim.budget.usageDate,
          llmBudgetUsedAfter: generationClaim.budget.usedAfter,
          providerBudgetDate: replyClaim.budget.usageDate,
          providerBudgetUsedAfter: replyClaim.budget.usedAfter,
        },
      };
    } catch (error) {
      await quarantineAutomationReplyDelivery({
        workspaceId: instance.workspaceId,
        conversationId: conversation.id,
        markerId: replyClaim.markerId,
        agentId: agent.id,
        errorCode:
          error instanceof EvolutionApiError
            ? error.code
            : "AGENT_REPLY_PROVIDER_RESULT_UNKNOWN",
      }).catch(() => undefined);

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
            phase: "provider_send",
          },
        },
      });

      return {
        ok: true,
        action: "agent_send_failed_quarantined",
        details: {
          error: safeError(error),
          deliveryState: "UNKNOWN_PROVIDER_RESULT",
        },
      };
    }
  } catch (error) {
    if (generationLeaseId) {
      await abandonAutomationReplyGeneration({
        workspaceId: instance.workspaceId,
        conversationId: conversation.id,
        leaseId: generationLeaseId,
        agentId: agent.id,
        reason:
          error instanceof LlmProviderError
            ? error.code
            : "LLM_GENERATION_FAILED",
      }).catch(() => undefined);
    }

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
          phase: "llm",
        },
      },
    });

    return {
      ok: true,
      action: "llm_failed",
      details: {
        error: safeError(error),
      },
    };
  }
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

  const claim = await claimWebhookEvent({
    instance,
    message,
    payload,
  });

  if (!claim.claimed) {
    return {
      ok: true,
      action: "ignored_duplicate_webhook",
      details: {
        providerEventId: claim.providerEventId,
      },
    };
  }

  try {
    const result = await processClaimedEvolutionMessage(message, instance);
    await markWebhookProcessed(claim.eventId, result);
    return result;
  } catch (error) {
    await markWebhookFailed(claim.eventId, error).catch(() => undefined);
    throw error;
  }
}
