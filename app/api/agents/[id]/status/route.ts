import { NextResponse } from "next/server";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import { updateAgentStatusSchema } from "@/lib/agents/schemas";
import {
  AgentServiceError,
  serializeAgent,
  updateAgentStatus,
} from "@/server/agents/service";
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

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return jsonError(authorization.error, authorization.status);
  }

  const authContext = authorization.context;

  try {
    enforceRateLimit({
      key: buildRateLimitKey([
        "agents:status",
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

  const parsed = updateAgentStatusSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Datos invalidos.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const agent = await updateAgentStatus(parsedId.data, parsed.data.status, {
      userId: authContext.user.id,
      workspaceId: authContext.workspace.id,
    });

    return NextResponse.json({ agent: serializeAgent(agent) });
  } catch (error) {
    if (error instanceof AgentServiceError) {
      return jsonError(error.message, error.status);
    }

    return jsonError("No se pudo actualizar el estado del agente.", 500);
  }
}
