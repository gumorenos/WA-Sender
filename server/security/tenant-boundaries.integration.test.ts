import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { updateAgent, AgentServiceError } from "@/server/agents/service";
import {
  CampaignControlError,
  startCampaign,
} from "@/server/campaigns/control";

const db = new PrismaClient();
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("service-level tenant boundaries", () => {
  let workspaceA: string;
  let workspaceB: string;
  let userA: string;
  let userB: string;
  let campaignA: string;
  let instanceA: string;
  let agentA: string;

  beforeAll(async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

    const [firstUser, secondUser] = await Promise.all([
      db.user.create({
        data: {
          email: `tenant-a-${suffix}@example.test`,
          status: "ACTIVE",
        },
      }),
      db.user.create({
        data: {
          email: `tenant-b-${suffix}@example.test`,
          status: "ACTIVE",
        },
      }),
    ]);
    userA = firstUser.id;
    userB = secondUser.id;

    const [firstWorkspace, secondWorkspace] = await Promise.all([
      db.workspace.create({
        data: {
          name: `Tenant A ${suffix}`,
          slug: `tenant-a-${suffix}`,
          members: {
            create: { userId: userA, role: "OWNER" },
          },
        },
      }),
      db.workspace.create({
        data: {
          name: `Tenant B ${suffix}`,
          slug: `tenant-b-${suffix}`,
          members: {
            create: { userId: userB, role: "OWNER" },
          },
        },
      }),
    ]);
    workspaceA = firstWorkspace.id;
    workspaceB = secondWorkspace.id;

    const instance = await db.whatsAppInstance.create({
      data: {
        workspaceId: workspaceA,
        name: "Tenant A Evolution",
        provider: "EVOLUTION",
        providerInstanceId: `tenant-a-evo-${suffix}`,
        status: "ACTIVE",
      },
    });
    instanceA = instance.id;

    const campaign = await db.campaign.create({
      data: {
        workspaceId: workspaceA,
        instanceId: instanceA,
        name: "Tenant A Campaign",
        status: "DRAFT",
        messages: {
          create: {
            workspaceId: workspaceA,
            recipientPhone: "+51999999999",
            messageTemplate: "Mensaje aislado",
            idempotencyKey: `tenant-campaign-${suffix}`,
            consentStatus: "UNKNOWN",
            optInStatus: "UNKNOWN",
          },
        },
      },
    });
    campaignA = campaign.id;

    const agent = await db.agent.create({
      data: {
        workspaceId: workspaceA,
        name: "Tenant A Agent",
        source: "MANUAL",
        status: "DRAFT",
        llmProvider: "MOCK",
      },
    });
    agentA = agent.id;

    const version = await db.agentVersion.create({
      data: {
        workspaceId: workspaceA,
        agentId: agentA,
        versionNumber: 1,
        source: "MANUAL",
        generatedPrompt: "Prompt inicial del tenant A",
        systemPrompt: "Prompt inicial del tenant A",
      },
    });

    await Promise.all([
      db.agentSetting.create({
        data: {
          workspaceId: workspaceA,
          agentId: agentA,
        },
      }),
      db.agent.update({
        where: { id: agentA },
        data: { activeAgentVersionId: version.id },
      }),
    ]);
  });

  afterAll(async () => {
    await db.workspace.deleteMany({
      where: { id: { in: [workspaceA, workspaceB] } },
    });
    await db.user.deleteMany({
      where: { id: { in: [userA, userB] } },
    });
    await db.$disconnect();
  });

  it("does not allow workspace B to start workspace A campaign", async () => {
    await expect(
      startCampaign(
        campaignA,
        {
          instanceId: instanceA,
          scheduledStartAt: new Date(Date.now() + 60_000).toISOString(),
          activeWindowStart: "09:00",
          activeWindowEnd: "18:00",
          timezone: "America/Lima",
          delaySeconds: 45,
          consentAttested: true,
          consentSource: "CRM_IMPORT",
          consentReference: "Tenant isolation test",
        },
        {
          userId: userB,
          workspaceId: workspaceB,
        },
      ),
    ).rejects.toMatchObject<Partial<CampaignControlError>>({
      status: 404,
    });

    const saved = await db.campaign.findUniqueOrThrow({
      where: { id: campaignA },
    });
    expect(saved.status).toBe("DRAFT");
  });

  it("does not allow workspace B to update workspace A agent", async () => {
    await expect(
      updateAgent(
        agentA,
        {
          source: "MANUAL",
          name: "Intrusion attempt",
          instructions:
            "Estas instrucciones tienen longitud suficiente para pasar la validacion pero no deben guardarse.",
          llmProvider: "MOCK",
          modelName: "",
        },
        {
          userId: userB,
          workspaceId: workspaceB,
        },
      ),
    ).rejects.toBeInstanceOf(AgentServiceError);

    const saved = await db.agent.findUniqueOrThrow({
      where: { id: agentA },
    });
    expect(saved.name).toBe("Tenant A Agent");

    const versions = await db.agentVersion.count({
      where: { agentId: agentA },
    });
    expect(versions).toBe(1);
  });
});
