import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  InstanceReservationError,
  reserveWhatsAppInstance,
} from "@/server/instances/service";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("instance plan limits", () => {
  let workspaceId: string;
  let userId: string;
  let planId: string;

  beforeAll(async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const user = await db.user.create({
      data: {
        email: `instance-plan-${suffix}@example.test`,
        status: "ACTIVE",
      },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: {
        name: `Instance limit ${suffix}`,
        slug: `instance-limit-${suffix}`,
        members: {
          create: { userId, role: "OWNER" },
        },
      },
    });
    workspaceId = workspace.id;

    const plan = await db.plan.create({
      data: {
        code: `instance-limit-${suffix}`,
        name: "Instance limit QA",
        maxInstances: 1,
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

  it("allows only one reservation when two creates race against maxInstances=1", async () => {
    const suffix = randomUUID().replaceAll("-", "");

    const results = await Promise.allSettled([
      reserveWhatsAppInstance({
        workspaceId,
        name: "Instancia paralela A",
        provider: "MOCK",
        providerInstanceName: `mock-a-${suffix}`,
      }),
      reserveWhatsAppInstance({
        workspaceId,
        name: "Instancia paralela B",
        provider: "MOCK",
        providerInstanceName: `mock-b-${suffix}`,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      InstanceReservationError,
    );
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 403,
    });
    expect(
      await db.whatsAppInstance.count({ where: { workspaceId } }),
    ).toBe(1);
  });
});
