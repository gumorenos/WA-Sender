import { NextResponse } from "next/server";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import { getCurrentWorkspace } from "@/lib/auth/server";
import { createAgentSchema } from "@/lib/agents/schemas";
import {
  AgentServiceError,
  createAgent,
  listAgents,
  serializeAgent,
} from "@/server/agents/service";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

export async function GET() {
  const context = await getCurrentWorkspace();

  if (!context) {
    return jsonError("No autenticado.", 401);
  }

  const agents = await listAgents(context.workspace.id);

  return NextResponse.json({ agents });
}

export async function POST(request: Request) {
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return jsonError(authorization.error, authorization.status);
  }

  const context = authorization.context;

  try {
    await enforceRateLimit({
      key: buildRateLimitKey([
        "agents:create",
        context.workspace.id,
        context.user.id,
      ]),
      limit: 12,
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimitResponse(error);
    }

    throw error;
  }

  const parsed = createAgentSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Datos invalidos.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const agent = await createAgent(parsed.data, {
      userId: context.user.id,
      workspaceId: context.workspace.id,
    });

    return NextResponse.json({ agent: serializeAgent(agent) }, { status: 201 });
  } catch (error) {
    if (error instanceof AgentServiceError) {
      return jsonError(error.message, error.status);
    }

    return jsonError("No se pudo crear el agente.", 500);
  }
}
