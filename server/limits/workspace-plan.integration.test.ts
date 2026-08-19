import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAgent, AgentServiceError } from "@/server/agents/service";
import { assertInstanceLimit } from "@/server/limits/workspace-plan";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("workspace plan concurrency limits", () => {
  let workspaceId: string;
  let userId: string;
  let planId: string;

  beforeAll(async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

    const user = await db.user.create({
      data: {
        email: `plan-limit-${suffix}@example.test`,
        status: "ACTIVE",
      },
    });
    userId = user.id;

    const plan = await db.plan.create({
      data: {
        code: `qa-plan-${suffix}`,
        name: `QA Plan ${suffix}`,
        maxAgents: 1,
        maxInstances: 1,
        maxActiveCampaigns: 1,
        dailyMessageLimit: 50,
        minDelaySeconds: 45,
        allowRealSending: false,
      },
    });
    planId = plan.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Plan limits ${suffix}`,
        slug: `plan-limits-${suffix}`,
        members: {
          create: { userId, role: "OWNER" },
        },
        subscription: {
          create: {
            planId,
            status: "ACTIVE",
          },
        },
      },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.plan.deleteMany({ where: { id: planId } });
    await db.$disconnect();
  });

  it("allows only one agent creation when maxAgents is one", async () => {
    const input = (name: string) => ({
      source: "MANUAL" as const,
      name,
      instructions:
        "Responde de forma breve, segura y profesional. No inventes informacion y deriva cuando corresponda.",
      llmProvider: "MOCK" as const,
      modelName: "",
    });

    const results = await Promise.allSettled([
      createAgent(input("Agente Uno"), { userId, workspaceId }),
      createAgent(input("Agente Dos"), { userId, workspaceId }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      AgentServiceError,
    );
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 403,
    });

    expect(await db.agent.count({ where: { workspaceId } })).toBe(1);
    expect(
      await db.auditLog.count({
        where: {
          workspaceId,
          resourceType: "agent",
          action: "CREATED",
        },
      }),
    ).toBe(1);
  });

  it("serializes instance reservations when maxInstances is one", async () => {
    const reserve = (name: string) =>
      db.$transaction(async (tx) => {
        await assertInstanceLimit(tx, workspaceId);
        return tx.whatsAppInstance.create({
          data: {
            workspaceId,
            name,
            provider: "MOCK",
            providerInstanceId: `qa-${randomUUID()}`,
            status: "CONNECTING",
          },
        });
      });

    const results = await Promise.allSettled([
      reserve("Instancia Uno"),
      reserve("Instancia Dos"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      await db.whatsAppInstance.count({ where: { workspaceId } }),
    ).toBe(1);
  });
});
