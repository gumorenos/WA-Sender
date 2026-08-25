import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_RETENTION_POLICY,
  RETENTION_LOCK_KEY,
  getPrivacyRetentionPolicy,
  getRetentionIntervalMs,
  isPrivacyRetentionEnabled,
  runPrivacyRetentionSweep,
} from "./privacy-retention.mjs";

describe("privacy retention runner configuration", () => {
  it("requires explicit enablement and keeps conservative defaults", () => {
    expect(isPrivacyRetentionEnabled({})).toBe(false);
    expect(isPrivacyRetentionEnabled({ PRIVACY_RETENTION_ENABLED: "true" })).toBe(true);
    expect(isPrivacyRetentionEnabled({ PRIVACY_RETENTION_ENABLED: "TRUE" })).toBe(false);
    expect(getPrivacyRetentionPolicy({})).toEqual(DEFAULT_RETENTION_POLICY);
  });

  it("clamps the scheduler interval between five minutes and seven days", () => {
    expect(getRetentionIntervalMs({ PRIVACY_RETENTION_INTERVAL_SECONDS: "1" })).toBe(300_000);
    expect(getRetentionIntervalMs({ PRIVACY_RETENTION_INTERVAL_SECONDS: "3600" })).toBe(3_600_000);
    expect(getRetentionIntervalMs({ PRIVACY_RETENTION_INTERVAL_SECONDS: "9999999" })).toBe(604_800_000);
  });
});

const db = new PrismaClient();
const lockDb = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("privacy retention runner PostgreSQL safety", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  let workspaceId;
  let instanceId;
  const old = new Date("2025-01-01T00:00:00.000Z");
  const now = new Date("2026-08-25T12:00:00.000Z");

  beforeAll(async () => {
    const workspace = await db.workspace.create({
      data: { name: `Retention runner ${suffix}`, slug: `retention-runner-${suffix}` },
    });
    workspaceId = workspace.id;
    const instance = await db.whatsAppInstance.create({
      data: {
        workspaceId,
        name: `Retention runner ${suffix}`,
        provider: "MOCK",
        providerInstanceId: `retention-runner-${suffix}`,
        status: "ACTIVE",
      },
    });
    instanceId = instance.id;
  });

  afterAll(async () => {
    await lockDb.$disconnect();
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  async function seedOldConversation({ status = "OPEN", role = "user", phone }) {
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

  it("purges expired ordinary data but preserves unresolved reply and handoff holds", async () => {
    const ordinary = await seedOldConversation({ phone: "+51941000001" });
    const unknown = await seedOldConversation({
      phone: "+51941000002",
      role: "assistant_unknown",
    });
    const handoff = await seedOldConversation({
      phone: "+51941000003",
      status: "HUMAN_HANDOFF",
    });

    await db.webhookEvent.createMany({
      data: [
        {
          workspaceId,
          instanceId,
          provider: "EVOLUTION",
          providerEventId: `processed-${suffix}`,
          payloadHash: `processed-${suffix}`,
          status: "PROCESSED",
          createdAt: old,
        },
        {
          workspaceId,
          instanceId,
          provider: "EVOLUTION",
          providerEventId: `failed-${suffix}`,
          payloadHash: `failed-${suffix}`,
          status: "FAILED",
          createdAt: old,
        },
      ],
    });
    await db.optOut.create({
      data: {
        workspaceId,
        instanceId,
        phone: "+51941000004",
        source: "retention-runner-test",
        createdAt: old,
      },
    });

    const result = await runPrivacyRetentionSweep(db, { now });
    expect(result.acquired).toBe(true);

    expect(await db.conversation.count({ where: { id: ordinary.id } })).toBe(0);
    expect(await db.conversation.count({ where: { id: unknown.id } })).toBe(1);
    expect(await db.conversationMessage.count({ where: { id: unknown.messages[0].id } })).toBe(1);
    expect(await db.conversation.count({ where: { id: handoff.id } })).toBe(1);
    expect(await db.conversationMessage.count({ where: { id: handoff.messages[0].id } })).toBe(1);
    expect(
      await db.webhookEvent.count({ where: { providerEventId: `processed-${suffix}` } }),
    ).toBe(0);
    expect(
      await db.webhookEvent.count({ where: { providerEventId: `failed-${suffix}` } }),
    ).toBe(1);
    expect(await db.optOut.count({ where: { workspaceId, phone: "+51941000004" } })).toBe(1);
  });

  it("skips the sweep when another process owns the global advisory lock", async () => {
    const candidate = await seedOldConversation({ phone: "+51941000005" });

    await lockDb.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT 1 AS lock FROM (SELECT pg_advisory_xact_lock(hashtext($1))) AS acquired",
        RETENTION_LOCK_KEY,
      );

      const result = await runPrivacyRetentionSweep(db, { now });
      expect(result.acquired).toBe(false);
      expect(result.deleted).toBeNull();
      expect(await db.conversation.count({ where: { id: candidate.id } })).toBe(1);
    });
  });
});
