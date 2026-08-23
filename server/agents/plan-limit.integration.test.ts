import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AgentServiceError, createAgent } from "@/server/agents/service";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("agent plan limits", () => {
  let workspaceId: string;
  let userId: string;
  let planId: string;

  beforeAll(async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const user = await db.user.create({
      data: {
        email: `agent-plan-${suffix}@example.test`,
        status: "ACTIVE",
      },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Agent limit ${suffix}`,
        slug: `agent-limit-${suffix}`,
        members: {
          create: { userId, role: "OWNER" },
        },
      },
    });
    workspaceId = workspace.id;

    const plan = await db.plan.create({
      data: {
        code: `agent-limit-${suffix}`,
        name: "Agent limit QA",
        maxAgents: 1,
      },
    });
    planId = plan.id;

    await db.subscription.create({
      data: {
        workspaceId,
        planId,
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.plan.deleteMany({ where: { id: planId } });
    await db.$disconnect();
  });

  it("allows only one agent when two creates race against maxAgents=1", async () => {
    const context = { workspaceId, userId };
    const input = (name: string) => ({
      source: "MANUAL" as const,
      name,
      instructions:
        "Responde consultas de prueba con informacion controlada y deriva cualquier caso fuera de alcance.",
      llmProvider: "MOCK" as const,
      modelName: "",
    });

    const results = await Promise.allSettled([
      createAgent(input("Agente paralelo A"), context),
      createAgent(input("Agente paralelo B"), context),
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
  });
});
