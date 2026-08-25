import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  purgeExpiredPrivacyData,
  type PrivacyRetentionPolicy,
} from "@/server/privacy/retention";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const now = new Date("2026-08-25T12:00:00.000Z");
const old = new Date("2025-01-01T00:00:00.000Z");
const policy: PrivacyRetentionPolicy = {
  extractedNumberDays: 30,
  conversationDays: 90,
  webhookEventDays: 30,
  playgroundDays: 30,
  auditLogDays: 365,
};

describeWithDatabase("privacy retention operational holds", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  let workspaceId: string;
  let instanceId: string;

  beforeAll(async () => {
    const workspace = await db.workspace.create({
      data: { name: `Retention holds ${suffix}`, slug: `retention-holds-${suffix}` },
    });
    workspaceId = workspace.id;
    const instance = await db.whatsAppInstance.create({
      data: {
        workspaceId,
        name: `Retention holds ${suffix}`,
        provider: "MOCK",
        providerInstanceId: `retention-holds-${suffix}`,
        status: "ACTIVE",
      },
    });
    instanceId = instance.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  async function createOldConversation({
    phone,
    role = "user",
    status = "OPEN",
  }: {
    phone: string;
    role?: string;
    status?: string;
  }) {
    return db.conversation.create({
      data: {
        workspaceId,
        instanceId,
        contactPhone: phone,
        status,
        createdAt: old,
        lastMessageAt: old,
        messages: {
          create: {
            workspaceId,
            role,
            direction: role === "user" ? "INBOUND" : "outbound",
            content: `${status}-${role}-${phone}`,
            createdAt: old,
          },
        },
      },
      include: { messages: true },
    });
  }

  it("deletes ordinary expired conversations but preserves unresolved replies and human handoff", async () => {
    const ordinary = await createOldConversation({ phone: "+51942000001" });
    const generating = await createOldConversation({
      phone: "+51942000002",
      role: "assistant_generating",
    });
    const pending = await createOldConversation({
      phone: "+51942000003",
      role: "assistant_pending",
    });
    const unknown = await createOldConversation({
      phone: "+51942000004",
      role: "assistant_unknown",
    });
    const handoff = await createOldConversation({
      phone: "+51942000005",
      status: "HUMAN_HANDOFF",
    });

    await db.$transaction((tx) => purgeExpiredPrivacyData(tx, { now, policy }));

    expect(await db.conversation.count({ where: { id: ordinary.id } })).toBe(0);
    for (const held of [generating, pending, unknown, handoff]) {
      expect(await db.conversation.count({ where: { id: held.id } })).toBe(1);
      expect(
        await db.conversationMessage.count({ where: { id: held.messages[0].id } }),
      ).toBe(1);
    }
  });
});
