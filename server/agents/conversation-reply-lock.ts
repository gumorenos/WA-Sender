import type { Prisma } from "@prisma/client";

export async function acquireConversationReplyLock(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  conversationId: string,
) {
  const lockKey = `agent-reply:${workspaceId}:${conversationId}`;

  await tx.$queryRaw`
    SELECT 1 AS lock
    FROM (
      SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
    ) AS acquired
  `;
}
