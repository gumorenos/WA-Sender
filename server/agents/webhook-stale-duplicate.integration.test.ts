import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleEvolutionWebhook } from "./whatsapp-webhook-service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const db = new PrismaClient();

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("stale webhook duplicate timestamp safety", () => {
  const runId = suffix();
  const workspaceId = `ws_stale_${runId}`;
  const instanceId = `inst_stale_${runId}`;
  const providerInstanceId = `evo_stale_${runId}`;

  beforeAll(async () => {
    process.env.AGENT_AUTOREPLY_ENABLED = "false";
    process.env.REAL_SENDING_ENABLED = "false";

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `Webhook Stale ${runId}`,
        slug: `webhook-stale-${runId}`,
      },
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `Evolution stale ${runId}`,
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

  it("records duplicate telemetry without refreshing PROCESSING updatedAt", async () => {
    const providerMessageId = `stale_duplicate_${runId}`;
    const providerEventId = `message:${providerMessageId}`;
    const staleAt = new Date(Date.now() - 30 * 60 * 1000);
    const event = await db.webhookEvent.create({
      data: {
        workspaceId,
        instanceId,
        provider: "EVOLUTION",
        providerEventId,
        payloadHash: "a".repeat(64),
        status: "PROCESSING",
      },
    });

    await db.$executeRaw`
      UPDATE webhook_events
      SET updated_at = ${staleAt}
      WHERE id = ${event.id}
    `;

    const result = await handleEvolutionWebhook({
      instance: providerInstanceId,
      data: {
        key: {
          id: providerMessageId,
          remoteJid: "51999999999@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Cliente stale",
        message: {
          conversation: "Hola de nuevo",
        },
      },
    });

    expect(result.action).toBe("ignored_duplicate_webhook");

    const after = await db.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });

    expect(after.status).toBe("PROCESSING");
    expect(after.duplicateCount).toBe(1);
    expect(after.lastDuplicateAt).not.toBeNull();
    expect(after.updatedAt.getTime()).toBe(staleAt.getTime());
  });
});
