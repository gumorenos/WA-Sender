import { NextResponse } from "next/server";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import {
  CampaignControlError,
  pauseCampaign,
} from "@/server/campaigns/control";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import { routeIdSchema } from "@/lib/security/schemas";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(_: Request, context: RouteContext) {
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return jsonError(authorization.error, authorization.status);
  }

  const authContext = authorization.context;

  try {
    await enforceRateLimit({
      key: buildRateLimitKey([
        "campaigns:pause",
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

  const { id } = await context.params;
  const parsedId = routeIdSchema.safeParse(id);

  if (!parsedId.success) {
    return jsonError(parsedId.error.issues[0]?.message ?? "ID invalido.", 400);
  }

  try {
    return NextResponse.json(
      await pauseCampaign(parsedId.data, {
        userId: authContext.user.id,
        workspaceId: authContext.workspace.id,
      }),
    );
  } catch (error) {
    if (error instanceof CampaignControlError) {
      return jsonError(error.message, error.status);
    }

    return jsonError("No se pudo pausar la campana.", 500);
  }
}
