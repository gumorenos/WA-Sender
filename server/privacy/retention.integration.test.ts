import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getExtractedNumberRetentionDays,
  getRetentionCutoff,
  purgeExpiredExtractedNumbers,
} from "@/server/privacy/retention";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describe("privacy retention helpers", () => {
  it("uses 30 days by default and rejects invalid overrides", () => {
    expect(getExtractedNumberRetentionDays({})).toBe(30);
    expect(
      getExtractedNumberRetentionDays({ EXTRACTED_NUMBER_RETENTION_DAYS: "7" }),
    ).toBe(7);
    expect(
      getExtractedNumberRetentionDays({ EXTRACTED_NUMBER_RETENTION_DAYS: "0" }),
    ).toBe(30);
  });

  it("computes a stable retention cutoff", () => {
    expect(
      getRetentionCutoff(new Date("2026-08-18T12:00:00.000Z"), 30).toISOString(),
    ).toBe("2026-07-19T12:00:00.000Z");
  });
});

describeWithDatabase("extracted number retention isolation", () => {
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const [first, second] = await Promise.all([
      db.workspace.create({
        data: {
          name: `Retention A ${suffix}`,
          slug: `retention-a-${suffix}`,
        },
      }),
      db.workspace.create({
        data: {
          name: `Retention B ${suffix}`,
          slug: `retention-b-${suffix}`,
        },
      }),
    ]);
    workspaceA = first.id;
    workspaceB = second.id;

    await db.extractedNumber.createMany({
      data: [
        {
          workspaceId: workspaceA,
          phone: "+51911111111",
          source: "contacts",
          extractedAt: new Date("2026-06-01T00:00:00.000Z"),
        },
        {
          workspaceId: workspaceA,
          phone: "+51922222222",
          source: "contacts",
          extractedAt: new Date("2026-08-10T00:00:00.000Z"),
        },
        {
          workspaceId: workspaceB,
          phone: "+51933333333",
          source: "contacts",
          extractedAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
    });

    await db.optOut.create({
      data: {
        workspaceId: workspaceA,
        phone: "+51911111111",
        source: "qa",
      },
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({
      where: { id: { in: [workspaceA, workspaceB] } },
    });
    await db.$disconnect();
  });

  it("purges only expired extracted numbers in the selected workspace", async () => {
    const result = await db.$transaction((tx) =>
      purgeExpiredExtractedNumbers(tx, workspaceA, {
        now: new Date("2026-08-18T00:00:00.000Z"),
        retentionDays: 30,
      }),
    );

    expect(result.deletedCount).toBe(1);
    expect(result.cutoff.toISOString()).toBe("2026-07-19T00:00:00.000Z");

    const [workspaceANumbers, workspaceBNumbers, optOuts] = await Promise.all([
      db.extractedNumber.findMany({
        where: { workspaceId: workspaceA },
        orderBy: { phone: "asc" },
        select: { phone: true },
      }),
      db.extractedNumber.findMany({
        where: { workspaceId: workspaceB },
        select: { phone: true },
      }),
      db.optOut.count({
        where: { workspaceId: workspaceA, phone: "+51911111111" },
      }),
    ]);

    expect(workspaceANumbers).toEqual([{ phone: "+51922222222" }]);
    expect(workspaceBNumbers).toEqual([{ phone: "+51933333333" }]);
    expect(optOuts).toBe(1);
  });
});
