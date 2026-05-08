import { NextResponse } from "next/server";

import { getCurrentWorkspace } from "@/lib/auth/server";
import {
  AgentServiceError,
  getAgentVersions,
} from "@/server/agents/service";
import { routeIdSchema } from "@/lib/security/schemas";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_: Request, context: RouteContext) {
  const authContext = await getCurrentWorkspace();

  if (!authContext) {
    return jsonError("No autenticado.", 401);
  }

  const { id } = await context.params;
  const parsedId = routeIdSchema.safeParse(id);

  if (!parsedId.success) {
    return jsonError(parsedId.error.issues[0]?.message ?? "ID invalido.", 400);
  }

  try {
    return NextResponse.json({
      versions: await getAgentVersions(parsedId.data, authContext.workspace.id),
    });
  } catch (error) {
    if (error instanceof AgentServiceError) {
      return jsonError(error.message, error.status);
    }

    return jsonError("No se pudieron obtener las versiones del agente.", 500);
  }
}
