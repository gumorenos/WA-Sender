import { NextResponse } from "next/server";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import {
  listWebhookRecoveryEvents,
  markStaleWebhookEventsForReview,
} from "@/server/agents/webhook-recovery-service";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function authorizeAndRateLimit(action: "list" | "sweep") {
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return { response: jsonError(authorization.error, authorization.status) } as const;
  }

  const authContext = authorization.context;

  try {
    await enforceRateLimit({
      key: buildRateLimitKey([
        `webhooks:recovery:${action}`,
        authContext.workspace.id,
        authContext.user.id,
      ]),
      limit: action === "sweep" ? 12 : 60,
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return { response: rateLimitResponse(error) } as const;
    }

    throw error;
  }

  return { authContext } as const;
}

export async function GET() {
  const authorization = await authorizeAndRateLimit("list");

  if ("response" in authorization) {
    return authorization.response;
  }

  return NextResponse.json({
    events: await listWebhookRecoveryEvents(
      authorization.authContext.workspace.id,
    ),
  });
}

export async function POST() {
  const authorization = await authorizeAndRateLimit("sweep");

  if ("response" in authorization) {
    return authorization.response;
  }

  return NextResponse.json(
    await markStaleWebhookEventsForReview({
      workspaceId: authorization.authContext.workspace.id,
      userId: authorization.authContext.user.id,
    }),
  );
}
