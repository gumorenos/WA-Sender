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
  AutomationReplyReconciliationError,
  reconcileUnknownAutomationReply,
} from "@/server/agents/reply-reconciliation";

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
        "conversations:reconcile-unknown-reply",
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
  const parsedConversationId = routeIdSchema.safeParse(id);
  const parsedMessageId = routeIdSchema.safeParse(messageId);

  if (!parsedConversationId.success) {
    return jsonError(
      parsedConversationId.error.issues[0]?.message ?? "ID de conversacion invalido.",
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
    return NextResponse.json(
      await reconcileUnknownAutomationReply(
        parsedConversationId.data,
        parsedMessageId.data,
        await request.json().catch(() => null),
        {
          userId: authContext.user.id,
          workspaceId: authContext.workspace.id,
        },
      ),
    );
  } catch (error) {
    if (error instanceof AutomationReplyReconciliationError) {
      return jsonError(error.message, error.status);
    }

    return jsonError("No se pudo reconciliar el resultado del auto-reply.", 500);
  }
}
