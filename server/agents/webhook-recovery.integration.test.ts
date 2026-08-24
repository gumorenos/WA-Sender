import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashWebhookPayload } from "@/lib/evolution/webhook-idempotency";
import {
  WEBHOOK_STATUS_PROCESSING,
  WEBHOOK_STATUS_PROCESSED,
  WEBHOOK_STATUS_RETRY_ALLOWED,
  WEBHOOK_STATUS_STALE_REVIEW,
} from "@/lib/evolution/webhook-recovery";
import {
  decideWebhookRecovery,
  markStaleWebhookEventsForReview,
  WebhookRecoveryError,
} from "@/server/agents/webhook-recovery-service";
import { handleEvolutionWebhook } from "@/server/agents/whatsapp-webhook-service";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("webhook stale recovery", () => {
  const runId = suffix();
  const workspaceId = `ws_recovery_${runId}`;
  const otherWorkspaceId = `ws_recovery_other_${runId}`;
  const userId = `user_recovery_${runId}`;
  const instanceId = `inst_recovery_${runId}`;
  const otherInstanceId = `inst_recovery_other_${runId}`;
  const providerInstanceId = `evo_recovery_${runId}`;

  beforeAll(async () => {
    process.env.AGENT_AUTOREPLY_ENABLED = "false";
    process.env.REAL_SENDING_ENABLED = "false";
    process.env.WEBHOOK_PROCESSING_STALE_SECONDS = "600";

    await db.user.create({
      data: {
        id: userId,
        email: `recovery-${runId}@example.test`,
        status: "ACTIVE",
      },
    });

    await db.workspace.createMany({
      data: [
        {
          id: workspaceId,
          name: `Recovery ${runId}`,
          slug: `recovery-${runId}`,
        },
        {
          id: otherWorkspaceId,
          name: `Recovery other ${runId}`,
          slug: `recovery-other-${runId}`,
        },
      ],
    });

    await db.whatsAppInstance.createMany({
      data: [
        {
          id: instanceId,
          workspaceId,
          name: `Evolution recovery ${runId}`,
          provider: "EVOLUTION",
          providerInstanceId,
          status: "ACTIVE",
        },
        {
          id: otherInstanceId,
          workspaceId: otherWorkspaceId,
          name: `Evolution recovery other ${runId}`,
          provider: "EVOLUTION",
          providerInstanceId: `evo_recovery_other_${runId}`,
          status: "ACTIVE",
        },
      ],
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({
      where: { id: { in: [workspaceId, otherWorkspaceId] } },
    });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  function payload(providerMessageId: string, text = "Hola recovery") {
    return {
      instance: providerInstanceId,
      data: {
        key: {
          id: providerMessageId,
          remoteJid: "51977777777@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Cliente Recovery QA",
        message: { conversation: text },
      },
    };
  }

  async function createLedgerEvent(params: {
    providerMessageId: string;
    eventPayload: unknown;
    status: string;
    workspaceId?: string;
    instanceId?: string;
  }) {
    return db.webhookEvent.create({
      data: {
        workspaceId: params.workspaceId ?? workspaceId,
        instanceId: params.instanceId ?? instanceId,
        provider: "EVOLUTION",
        providerEventId: `message:${params.providerMessageId}`,
        payloadHash: hashWebhookPayload(params.eventPayload),
        status: params.status,
      },
    });
  }

  it("moves only tenant-scoped old PROCESSING events to manual review", async () => {
    const now = new Date("2026-08-24T04:00:00.000Z");
    const stalePayload = payload(`stale-${runId}`);
    const freshPayload = payload(`fresh-${runId}`);
    const otherPayload = {
      instance: `evo_recovery_other_${runId}`,
      data: {
        key: {
          id: `other-stale-${runId}`,
          remoteJid: "51976666666@s.whatsapp.net",
          fromMe: false,
        },
        message: { conversation: "Otro tenant" },
      },
    };

    const stale = await createLedgerEvent({
      providerMessageId: `stale-${runId}`,
      eventPayload: stalePayload,
      status: WEBHOOK_STATUS_PROCESSING,
    });
    const fresh = await createLedgerEvent({
      providerMessageId: `fresh-${runId}`,
      eventPayload: freshPayload,
      status: WEBHOOK_STATUS_PROCESSING,
    });
    const other = await createLedgerEvent({
      providerMessageId: `other-stale-${runId}`,
      eventPayload: otherPayload,
      status: WEBHOOK_STATUS_PROCESSING,
      workspaceId: otherWorkspaceId,
      instanceId: otherInstanceId,
    });

    const staleAt = new Date(now.getTime() - 20 * 60 * 1000);
    await db.$executeRaw`
      UPDATE webhook_events
      SET updated_at = ${staleAt}
      WHERE id IN (${stale.id}, ${other.id})
    `;
    await db.$executeRaw`
      UPDATE webhook_events
      SET updated_at = ${now}
      WHERE id = ${fresh.id}
    `;

    const result = await markStaleWebhookEventsForReview({
      workspaceId,
      userId,
      now,
    });

    expect(result.markedCount).toBe(1);
    const [savedStale, savedFresh, savedOther] = await Promise.all([
      db.webhookEvent.findUniqueOrThrow({ where: { id: stale.id } }),
      db.webhookEvent.findUniqueOrThrow({ where: { id: fresh.id } }),
      db.webhookEvent.findUniqueOrThrow({ where: { id: other.id } }),
    ]);
    expect(savedStale.status).toBe(WEBHOOK_STATUS_STALE_REVIEW);
    expect(savedFresh.status).toBe(WEBHOOK_STATUS_PROCESSING);
    expect(savedOther.status).toBe(WEBHOOK_STATUS_PROCESSING);
  });

  it("reuses the same ledger row after an authorized same-hash provider redelivery", async () => {
    const providerMessageId = `retry-${runId}`;
    const eventPayload = payload(providerMessageId);
    const event = await createLedgerEvent({
      providerMessageId,
      eventPayload,
      status: WEBHOOK_STATUS_STALE_REVIEW,
    });

    const decision = await decideWebhookRecovery(
      event.id,
      {
        decision: "RETRY_ON_REDELIVERY",
        confirmed: true,
        reason: "Proveedor confirmo que reintentara el mismo evento.",
      },
      { userId, workspaceId },
    );
    expect(decision.event.status).toBe(WEBHOOK_STATUS_RETRY_ALLOWED);

    const processed = await handleEvolutionWebhook(eventPayload);
    expect(processed.action).toBe("ignored_agent_autoreply_globally_disabled");

    const duplicate = await handleEvolutionWebhook(eventPayload);
    expect(duplicate.action).toBe("ignored_duplicate_webhook");

    const [saved, ledgerCount, inboundCount] = await Promise.all([
      db.webhookEvent.findUniqueOrThrow({ where: { id: event.id } }),
      db.webhookEvent.count({
        where: {
          workspaceId,
          providerEventId: `message:${providerMessageId}`,
        },
      }),
      db.conversationMessage.count({
        where: { workspaceId, providerMessageId, direction: "inbound" },
      }),
    ]);
    expect(saved.status).toBe(WEBHOOK_STATUS_PROCESSED);
    expect(ledgerCount).toBe(1);
    expect(inboundCount).toBe(1);
  });

  it("allows one claimant under concurrent authorized redelivery", async () => {
    const providerMessageId = `retry-concurrent-${runId}`;
    const eventPayload = payload(providerMessageId);
    const event = await createLedgerEvent({
      providerMessageId,
      eventPayload,
      status: WEBHOOK_STATUS_RETRY_ALLOWED,
    });

    const results = await Promise.all([
      handleEvolutionWebhook(eventPayload),
      handleEvolutionWebhook(eventPayload),
    ]);

    expect(results.map((result) => result.action).sort()).toEqual(
      [
        "ignored_agent_autoreply_globally_disabled",
        "ignored_duplicate_webhook",
      ].sort(),
    );
    expect(
      await db.conversationMessage.count({
        where: { workspaceId, providerMessageId, direction: "inbound" },
      }),
    ).toBe(1);
    expect(
      await db.webhookEvent.count({
        where: { id: event.id },
      }),
    ).toBe(1);
  });

  it("blocks a changed payload that reuses an authorized provider event id", async () => {
    const providerMessageId = `hash-conflict-${runId}`;
    const originalPayload = payload(providerMessageId, "Contenido original");
    const changedPayload = payload(providerMessageId, "Contenido cambiado");
    const event = await createLedgerEvent({
      providerMessageId,
      eventPayload: originalPayload,
      status: WEBHOOK_STATUS_STALE_REVIEW,
    });

    await decideWebhookRecovery(
      event.id,
      {
        decision: "RETRY_ON_REDELIVERY",
        confirmed: true,
        reason: "Se autorizo solo el payload originalmente observado.",
      },
      { userId, workspaceId },
    );

    const result = await handleEvolutionWebhook(changedPayload);
    expect(result.action).toBe("ignored_duplicate_webhook");

    const saved = await db.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(saved.status).toBe(WEBHOOK_STATUS_STALE_REVIEW);
    expect(saved.action).toBe("retry_payload_hash_mismatch");
    expect(
      await db.conversationMessage.count({
        where: { workspaceId, providerMessageId },
      }),
    ).toBe(0);
  });

  it("manual processed decision permanently blocks later redelivery", async () => {
    const providerMessageId = `manual-processed-${runId}`;
    const eventPayload = payload(providerMessageId);
    const event = await createLedgerEvent({
      providerMessageId,
      eventPayload,
      status: WEBHOOK_STATUS_STALE_REVIEW,
    });

    const decision = await decideWebhookRecovery(
      event.id,
      {
        decision: "MARK_PROCESSED",
        confirmed: true,
        reason: "Se verifico externamente que el efecto ya ocurrio.",
      },
      { userId, workspaceId },
    );
    expect(decision.event.status).toBe(WEBHOOK_STATUS_PROCESSED);

    const later = await handleEvolutionWebhook(eventPayload);
    expect(later.action).toBe("ignored_duplicate_webhook");
    expect(
      await db.conversationMessage.count({
        where: { workspaceId, providerMessageId },
      }),
    ).toBe(0);
  });

  it("rejects recovery decisions across tenants", async () => {
    const providerMessageId = `cross-tenant-${runId}`;
    const eventPayload = payload(providerMessageId);
    const event = await createLedgerEvent({
      providerMessageId,
      eventPayload,
      status: WEBHOOK_STATUS_STALE_REVIEW,
    });

    await expect(
      decideWebhookRecovery(
        event.id,
        {
          decision: "MARK_PROCESSED",
          confirmed: true,
          reason: "Intento desde otro tenant.",
        },
        { userId, workspaceId: otherWorkspaceId },
      ),
    ).rejects.toBeInstanceOf(WebhookRecoveryError);
  });
});
