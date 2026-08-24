import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setConversationHandoff } from "@/server/agents/handoff-service";
import { handleEvolutionWebhook } from "@/server/agents/whatsapp-webhook-service";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

describeWithDatabase("handoff and opt-out priority", () => {
  const runId = suffix();
  const workspaceId = `ws_handoff_optout_${runId}`;
  const userId = `user_handoff_optout_${runId}`;
  const instanceId = `inst_handoff_optout_${runId}`;
  const providerInstanceId = `evo_handoff_optout_${runId}`;
  const phoneDigits = `5198${runId.replace(/\D/g, "").padEnd(7, "6").slice(0, 7)}`;

  beforeAll(async () => {
    process.env.REAL_SENDING_ENABLED = "false";
    process.env.MOCK_WHATSAPP_ENABLED = "true";

    await db.user.create({
      data: {
        id: userId,
        email: `handoff-optout-${runId}@example.test`,
        status: "ACTIVE",
      },
    });

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `Handoff optout ${runId}`,
        slug: `handoff-optout-${runId}`,
      },
    });

    await db.whatsAppInstance.create({
      data: {
        id: instanceId,
        workspaceId,
        name: `Evolution handoff optout ${runId}`,
        provider: "EVOLUTION",
        providerInstanceId,
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  function payload(providerMessageId: string, text: string) {
    return {
      instance: providerInstanceId,
      data: {
        key: {
          id: providerMessageId,
          remoteJid: `${phoneDigits}@s.whatsapp.net`,
          fromMe: false,
        },
        pushName: "Cliente OptOut QA",
        message: { conversation: text },
      },
    };
  }

  async function getConversation() {
    return db.conversation.findUniqueOrThrow({
      where: {
        workspaceId_instanceId_contactPhone: {
          workspaceId,
          instanceId,
          contactPhone: `+${phoneDigits}`,
        },
      },
    });
  }

  it("processes STOP during handoff and keeps the contact blocked after resume", async () => {
    await handleEvolutionWebhook(
      payload(`handoff-optout-seed-${runId}`, "Hola, necesito informacion"),
    );

    const conversation = await getConversation();

    await setConversationHandoff(
      conversation.id,
      {
        active: true,
        confirmed: true,
        reason: "Operador atiende manualmente antes de recibir el opt-out.",
      },
      { userId, workspaceId },
    );

    const optOutResult = await handleEvolutionWebhook(
      payload(`handoff-optout-stop-${runId}`, "STOP"),
    );

    expect(optOutResult.action).toBe("opt_out_registered");
    expect(
      await db.optOut.findUnique({
        where: {
          workspaceId_phone: {
            workspaceId,
            phone: `+${phoneDigits}`,
          },
        },
      }),
    ).not.toBeNull();

    await setConversationHandoff(
      conversation.id,
      {
        active: false,
        confirmed: true,
        reason: "Atencion humana finalizada despues del opt-out.",
      },
      { userId, workspaceId },
    );

    const laterResult = await handleEvolutionWebhook(
      payload(`handoff-optout-after-${runId}`, "Hola otra vez"),
    );

    expect(laterResult.action).toBe("ignored_blocked_contact");

    const outbound = await db.conversationMessage.findMany({
      where: {
        conversationId: conversation.id,
        direction: "outbound",
      },
      select: { metadata: true },
    });

    expect(outbound).toHaveLength(1);
    expect(outbound[0]?.metadata).toMatchObject({
      optOutConfirmation: true,
      mocked: true,
    });
  });
});
