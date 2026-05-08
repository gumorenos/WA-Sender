import { prisma } from "@/lib/db";

export type WorkspaceOwnedModel =
  | "whatsappInstance"
  | "campaign"
  | "campaignMessage"
  | "agent"
  | "playgroundSession"
  | "extractedNumber";

export async function assertWorkspaceOwnership(
  model: WorkspaceOwnedModel,
  id: string,
  workspaceId: string,
) {
  const where = { id, workspaceId };
  const select = { id: true };

  const record =
    model === "whatsappInstance"
      ? await prisma.whatsAppInstance.findFirst({ where, select })
      : model === "campaign"
        ? await prisma.campaign.findFirst({ where, select })
        : model === "campaignMessage"
          ? await prisma.campaignMessage.findFirst({ where, select })
          : model === "agent"
            ? await prisma.agent.findFirst({ where, select })
            : model === "playgroundSession"
              ? await prisma.playgroundSession.findFirst({ where, select })
              : await prisma.extractedNumber.findFirst({ where, select });

  if (!record) {
    throw new Error("Resource not found for current workspace.");
  }

  return record;
}
