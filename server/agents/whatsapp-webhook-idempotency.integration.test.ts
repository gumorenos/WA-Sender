import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleEvolutionWebhook } from "./whatsapp-webhook-service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const db = new PrismaClient();

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("Evolution webhook idempotency integration", () => {
  const runId = suffix();
  const workspaceId = `ws_${runId}`;
  const instanceId = `inst_${runId}`;
  const providerInstanceId = `evo_${runId}`;

  beforeAll(async () => {
    process.env.AGENT_AUTOREPLY_ENABLED = "false";
    process.env.REAL_SENDING_ENABLED = "false";

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `Webhook Idempotency ${runId}`,
        slug: `webhook-idempotency-${runId}`,
      },
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `Evolution ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId,
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  function payload(providerMessageId: string) {
    return {
      instance: providerInstanceId,
      data: {
        key: {
          id: providerMessageId,
          remoteJid: "51999999999@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Cliente QA",
        message: {
          conversation: "Hola, necesito informacion",
        },
      },
    };
  }

  it("stores one inbound message when the same webhook is delivered twice", async () => {
    const providerMessageId = `sequential_${runId}`;
    const eventPayload = payload(providerMessageId);

    const first = await handleEvolutionWebhook(eventPayload);
    const duplicate = await handleEvolutionWebhook(eventPayload);

    expect(first.action).toBe("ignored_agent_autoreply_globally_disabled");
    expect(duplicate.action).toBe("ignored_duplicate_webhook");

    const [inboundCount, events] = await Promise.all([
      db.conversationMessage.count({
        where: {
          workspaceId,
          direction: "inbound",
          providerMessageId,
        },
      }),
      db.webhookEvent.findMany({
        where: {
          workspaceId,
          providerEventId: `message:${providerMessageId}`,
        },
      }),
    ]);

    expect(inboundCount).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("PROCESSED");
    expect(events[0]?.action).toBe("ignored_agent_autoreply_globally_disabled");
    expect(events[0]?.duplicateCount).toBe(1);
    expect(events[0]?.lastDuplicateAt).not.toBeNull();
  });

  it("allows only one claimant for concurrent duplicate deliveries", async () => {
    const providerMessageId = `concurrent_${runId}`;
    const eventPayload = payload(providerMessageId);

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

    const [inboundCount, event] = await Promise.all([
      db.conversationMessage.count({
        where: {
          workspaceId,
          direction: "inbound",
          providerMessageId,
        },
      }),
      db.webhookEvent.findFirst({
        where: {
          workspaceId,
          providerEventId: `message:${providerMessageId}`,
        },
      }),
    ]);

    expect(inboundCount).toBe(1);
    expect(event).not.toBeNull();
    expect(event?.duplicateCount).toBe(1);
  });

  it("scopes the provider event identity by WhatsApp instance", async () => {
    const secondInstanceId = `inst2_${runId}`;

    await db.whatsAppInstance.create({
      data: {
        id: secondInstanceId,
        workspaceId,
        name: `Evolution second ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId: `evo_second_${runId}`,
        status: "ACTIVE",
      },
    });

    const providerEventId = `message:shared_${runId}`;

    await Promise.all([
      db.webhookEvent.create({
        data: {
          workspaceId,
          instanceId,
          provider: "EVOLUTION",
          providerEventId,
          payloadHash: "a".repeat(64),
        },
      }),
      db.webhookEvent.create({
        data: {
          workspaceId,
          instanceId: secondInstanceId,
          provider: "EVOLUTION",
          providerEventId,
          payloadHash: "b".repeat(64),
        },
      }),
    ]);

    expect(
      await db.webhookEvent.count({
        where: { workspaceId, providerEventId },
      }),
    ).toBe(2);
  });
});
