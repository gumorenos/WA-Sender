import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import type { WorkspaceRole } from "@prisma/client";

import { authOptions } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/workspace";
import { prisma } from "@/lib/db";

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user || user.status !== "ACTIVE") {
    redirect("/login");
  }

  return user;
}

export async function getCurrentWorkspace() {
  const user = await getCurrentUser();

  if (!user || user.status !== "ACTIVE") {
    return null;
  }

  const membershipWithWorkspace = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspace: {
        status: "ACTIVE",
      },
    },
    include: {
      workspace: {
        include: {
          subscription: {
            include: { plan: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!membershipWithWorkspace) {
    return null;
  }

  const { workspace, ...membership } = membershipWithWorkspace;

  return {
    user,
    workspace,
    membership,
  };
}

export async function requireCurrentWorkspace() {
  const context = await getCurrentWorkspace();

  if (!context) {
    redirect("/login");
  }

  return context;
}

export async function requireWorkspaceRole(allowedRoles: WorkspaceRole[]) {
  const context = await requireCurrentWorkspace();

  if (!hasWorkspaceRole(context.membership.role, allowedRoles)) {
    redirect("/dashboard");
  }

  return context;
}
