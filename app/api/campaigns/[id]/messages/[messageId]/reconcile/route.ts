import { NextResponse } from "next/server";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import { routeIdSchema } from "@/lib/security/schemas";
import {
  CampaignReconciliationError,
  reconcileUnknownCampaignMessage,
} from "@/server/campaigns/reconciliation";

type RouteContext = {
  params: Promise<{
    id: string;
    messageId: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return jsonError(authorization.error, authorization.status);
  }

  const authContext = authorization.context;

  try {
    await enforceRateLimit({
      key: buildRateLimitKey([
        "campaigns:reconcile-unknown",
        authContext.workspace.id,
        authContext.user.id,
      ]),
      limit: 30,
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimitResponse(error);
    }

    throw error;
  }

  const { id, messageId } = await context.params;
  const parsedCampaignId = routeIdSchema.safeParse(id);
  const parsedMessageId = routeIdSchema.safeParse(messageId);

  if (!parsedCampaignId.success) {
    return jsonError(
      parsedCampaignId.error.issues[0]?.message ?? "ID de campana invalido.",
      400,
    );
  }

  if (!parsedMessageId.success) {
    return jsonError(
      parsedMessageId.error.issues[0]?.message ?? "ID de mensaje invalido.",
      400,
    );
  }

  try {
    const result = await reconcileUnknownCampaignMessage(
      parsedCampaignId.data,
      parsedMessageId.data,
      await request.json().catch(() => null),
      {
        userId: authContext.user.id,
        workspaceId: authContext.workspace.id,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CampaignReconciliationError) {
      return jsonError(error.message, error.status);
    }

    return jsonError("No se pudo reconciliar el resultado del mensaje.", 500);
  }
}
