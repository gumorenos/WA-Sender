import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getPrivacyRetentionPolicy,
  purgeExpiredPrivacyData,
  type PrivacyRetentionPolicy,
} from "@/server/privacy/retention";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const now = new Date("2026-08-22T12:00:00.000Z");
const old = new Date("2025-01-01T00:00:00.000Z");
const recent = new Date("2026-08-20T00:00:00.000Z");

const policy: PrivacyRetentionPolicy = {
  extractedNumberDays: 30,
  conversationDays: 90,
  webhookEventDays: 30,
  playgroundDays: 30,
  auditLogDays: 365,
};

describe("privacy retention policy", () => {
  it("uses conservative defaults and accepts valid overrides", () => {
    expect(getPrivacyRetentionPolicy({})).toEqual(policy);
    expect(
      getPrivacyRetentionPolicy({
        EXTRACTED_NUMBER_RETENTION_DAYS: "7",
        CONVERSATION_RETENTION_DAYS: "45",
        WEBHOOK_EVENT_RETENTION_DAYS: "14",
        PLAYGROUND_RETENTION_DAYS: "15",
        AUDIT_LOG_RETENTION_DAYS: "730",
      }),
    ).toEqual({
      extractedNumberDays: 7,
      conversationDays: 45,
      webhookEventDays: 14,
      playgroundDays: 15,
      auditLogDays: 730,
    });
  });

  it("falls back per field for invalid values", () => {
    expect(
      getPrivacyRetentionPolicy({
        CONVERSATION_RETENTION_DAYS: "0",
        WEBHOOK_EVENT_RETENTION_DAYS: "not-a-number",
      }),
    ).toEqual(policy);
  });
});

describeWithDatabase("global privacy retention sweep", () => {
  let workspaceId: string;
  let recentWorkspaceId: string;
  let instanceId: string;

  beforeAll(async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const [workspace, recentWorkspace] = await Promise.all([
      db.workspace.create({
        data: {
          name: `Privacy sweep ${suffix}`,
          slug: `privacy-sweep-${suffix}`,
        },
      }),
      db.workspace.create({
        data: {
          name: `Privacy recent ${suffix}`,
          slug: `privacy-recent-${suffix}`,
        },
      }),
    ]);
    workspaceId = workspace.id;
    recentWorkspaceId = recentWorkspace.id;

    const instance = await db.whatsAppInstance.create({
      data: {
        workspaceId,
        name: `Retention instance ${suffix}`,
        provider: "MOCK",
        providerInstanceId: `privacy-${suffix}`,
        status: "ACTIVE",
      },
    });
    instanceId = instance.id;

    const oldConversation = await db.conversation.create({
      data: {
        workspaceId,
        instanceId,
        contactPhone: "+51940000001",
        contactDisplayName: "Old contact",
        lastMessageAt: old,
        createdAt: old,
      },
    });
    const recentConversation = await db.conversation.create({
      data: {
        workspaceId,
        instanceId,
        contactPhone: "+51940000002",
        contactDisplayName: "Recent contact",
        lastMessageAt: recent,
        createdAt: recent,
      },
    });

    await db.conversationMessage.createMany({
      data: [
        {
          workspaceId,
          conversationId: oldConversation.id,
          role: "user",
          direction: "INBOUND",
          content: "old sensitive content",
          createdAt: old,
        },
        {
          workspaceId,
          conversationId: recentConversation.id,
          role: "user",
          direction: "INBOUND",
          content: "recent content",
          createdAt: recent,
        },
      ],
    });

    await db.webhookEvent.createMany({
      data: [
        {
          workspaceId,
          instanceId,
          provider: "EVOLUTION",
          providerEventId: `processed-old-${suffix}`,
          payloadHash: `hash-processed-${suffix}`,
          status: "PROCESSED",
          createdAt: old,
        },
        {
          workspaceId,
          instanceId,
          provider: "EVOLUTION",
          providerEventId: `failed-old-${suffix}`,
          payloadHash: `hash-failed-${suffix}`,
          status: "FAILED",
          createdAt: old,
        },
        {
          workspaceId,
          instanceId,
          provider: "EVOLUTION",
          providerEventId: `processed-recent-${suffix}`,
          payloadHash: `hash-recent-${suffix}`,
          status: "PROCESSED",
          createdAt: recent,
        },
      ],
    });

    await db.playgroundSession.createMany({
      data: [
        {
          workspaceId,
          title: "old playground",
          messages: [{ role: "user", content: "old private prompt" }],
          createdAt: old,
          updatedAt: old,
        },
        {
          workspaceId,
          title: "recent playground",
          messages: [{ role: "user", content: "recent prompt" }],
          createdAt: recent,
          updatedAt: recent,
        },
      ],
    });

    await db.extractedNumber.createMany({
      data: [
        {
          workspaceId,
          phone: "+51940000003",
          source: "contacts",
          extractedAt: old,
          createdAt: old,
        },
        {
          workspaceId: recentWorkspaceId,
          phone: "+51940000004",
          source: "contacts",
          extractedAt: recent,
          createdAt: recent,
        },
      ],
    });

    await db.auditLog.createMany({
      data: [
        {
          workspaceId,
          action: "CREATED",
          resourceType: "qa-retention-old",
          metadata: { note: "old audit" },
          createdAt: old,
        },
        {
          workspaceId,
          action: "CREATED",
          resourceType: "qa-retention-recent",
          metadata: { note: "recent audit" },
          createdAt: recent,
        },
      ],
    });

    await db.optOut.create({
      data: {
        workspaceId,
        instanceId,
        phone: "+51940000003",
        source: "qa-retention",
        createdAt: old,
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({
      where: { id: { in: [workspaceId, recentWorkspaceId] } },
    });
    await db.$disconnect();
  });

  it("purges expired personal data while preserving safety and unresolved records", async () => {
    const result = await db.$transaction((tx) =>
      purgeExpiredPrivacyData(tx, { now, policy }),
    );

    expect(result.deleted).toMatchObject({
      extractedNumbers: 1,
      conversationMessages: 1,
      conversations: 1,
      webhookEvents: 1,
      playgroundSessions: 1,
      auditLogs: 1,
    });

    const [
      oldConversationCount,
      recentConversationCount,
      oldMessageCount,
      recentMessageCount,
      processedOldCount,
      failedOldCount,
      processedRecentCount,
      oldPlaygroundCount,
      recentPlaygroundCount,
      oldExtractedCount,
      recentExtractedCount,
      oldAuditCount,
      recentAuditCount,
      optOutCount,
    ] = await Promise.all([
      db.conversation.count({
        where: { workspaceId, contactPhone: "+51940000001" },
      }),
      db.conversation.count({
        where: { workspaceId, contactPhone: "+51940000002" },
      }),
      db.conversationMessage.count({
        where: { workspaceId, content: "old sensitive content" },
      }),
      db.conversationMessage.count({
        where: { workspaceId, content: "recent content" },
      }),
      db.webhookEvent.count({
        where: { workspaceId, status: "PROCESSED", createdAt: old },
      }),
      db.webhookEvent.count({
        where: { workspaceId, status: "FAILED", createdAt: old },
      }),
      db.webhookEvent.count({
        where: { workspaceId, status: "PROCESSED", createdAt: recent },
      }),
      db.playgroundSession.count({
        where: { workspaceId, title: "old playground" },
      }),
      db.playgroundSession.count({
        where: { workspaceId, title: "recent playground" },
      }),
      db.extractedNumber.count({
        where: { workspaceId, phone: "+51940000003" },
      }),
      db.extractedNumber.count({
        where: { workspaceId: recentWorkspaceId, phone: "+51940000004" },
      }),
      db.auditLog.count({
        where: { workspaceId, resourceType: "qa-retention-old" },
      }),
      db.auditLog.count({
        where: { workspaceId, resourceType: "qa-retention-recent" },
      }),
      db.optOut.count({
        where: { workspaceId, phone: "+51940000003" },
      }),
    ]);

    expect(oldConversationCount).toBe(0);
    expect(recentConversationCount).toBe(1);
    expect(oldMessageCount).toBe(0);
    expect(recentMessageCount).toBe(1);
    expect(processedOldCount).toBe(0);
    expect(failedOldCount).toBe(1);
    expect(processedRecentCount).toBe(1);
    expect(oldPlaygroundCount).toBe(0);
    expect(recentPlaygroundCount).toBe(1);
    expect(oldExtractedCount).toBe(0);
    expect(recentExtractedCount).toBe(1);
    expect(oldAuditCount).toBe(0);
    expect(recentAuditCount).toBe(1);
    expect(optOutCount).toBe(1);
  });
});
