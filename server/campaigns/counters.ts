import type { PrismaClient } from "@prisma/client";

const notSentStatuses = ["PENDING", "QUEUED", "SENDING"] as const;

export async function syncCampaignCounters(
  prisma: PrismaClient,
  campaignId: string,
) {
  const [totalCount, pendingCount, sentCount, failedCount] = await Promise.all([
    prisma.campaignMessage.count({ where: { campaignId } }),
    prisma.campaignMessage.count({
      where: { campaignId, status: { in: [...notSentStatuses] } },
    }),
    prisma.campaignMessage.count({ where: { campaignId, status: "SENT" } }),
    prisma.campaignMessage.count({ where: { campaignId, status: "FAILED" } }),
  ]);

  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      totalCount,
      pendingCount,
      sentCount,
      failedCount,
    },
  });
}
