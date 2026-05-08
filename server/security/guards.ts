import { NextResponse } from "next/server";

import { getCurrentUser, getCurrentWorkspace } from "@/lib/auth/server";
import {
  assertWorkspaceOwnership,
  type WorkspaceOwnedModel,
} from "@/server/policies/ownership";

export class SecurityGuardError extends Error {
  constructor(
    message: string,
    public readonly status = 401,
  ) {
    super(message);
    this.name = "SecurityGuardError";
  }
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user || user.status !== "ACTIVE") {
    throw new SecurityGuardError("No autenticado.", 401);
  }

  return user;
}

export async function requireWorkspace() {
  const context = await getCurrentWorkspace();

  if (!context) {
    throw new SecurityGuardError("No autenticado.", 401);
  }

  return context;
}

export async function requireOwnership(
  model: WorkspaceOwnedModel,
  id: string,
  workspaceId: string,
) {
  try {
    return await assertWorkspaceOwnership(model, id, workspaceId);
  } catch {
    throw new SecurityGuardError("Recurso no encontrado o sin permisos.", 404);
  }
}

export function securityGuardResponse(error: SecurityGuardError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

export function isSecurityGuardError(
  error: unknown,
): error is SecurityGuardError {
  return error instanceof SecurityGuardError;
}
