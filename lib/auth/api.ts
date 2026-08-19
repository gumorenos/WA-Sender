import type { WorkspaceRole } from "@prisma/client";

import { getCurrentWorkspace } from "@/lib/auth/server";
import { hasWorkspaceRole } from "@/lib/auth/workspace";

export type ApiWorkspaceAuthorization =
  | {
      ok: true;
      context: NonNullable<Awaited<ReturnType<typeof getCurrentWorkspace>>>;
    }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    };

export async function authorizeApiWorkspace(
  allowedRoles?: WorkspaceRole[],
): Promise<ApiWorkspaceAuthorization> {
  const context = await getCurrentWorkspace();

  if (!context) {
    return {
      ok: false,
      status: 401,
      error: "No autenticado.",
    };
  }

  if (
    allowedRoles &&
    !hasWorkspaceRole(context.membership.role, allowedRoles)
  ) {
    return {
      ok: false,
      status: 403,
      error: "No tienes permisos para realizar esta accion.",
    };
  }

  return {
    ok: true,
    context,
  };
}
