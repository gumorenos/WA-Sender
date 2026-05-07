import type { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";

const DEFAULT_PLAN_CODE = process.env.DEFAULT_PLAN_CODE ?? "demo";
const DEFAULT_WORKSPACE_NAME =
  process.env.DEFAULT_WORKSPACE_NAME ?? "Mi workspace";

function slugFromEmail(email: string, userId: string) {
  const localPart = email.split("@")[0]?.toLowerCase() ?? "workspace";
  const normalized = localPart.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${normalized || "workspace"}-${userId.slice(0, 8)}`;
}

export async function ensureDefaultWorkspace(userId: string) {
  const existingMembership = await prisma.workspaceMember.findFirst({
    where: { userId },
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

  if (existingMembership) {
    return existingMembership.workspace;
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, name: true, image: true },
  });

  const plan = await prisma.plan.findUniqueOrThrow({
    where: { code: DEFAULT_PLAN_CODE },
  });

  const workspaceName = user.name ?? DEFAULT_WORKSPACE_NAME;
  const slug = slugFromEmail(user.email ?? "workspace", userId);

  return prisma.workspace.create({
    data: {
      name: workspaceName,
      slug,
      members: {
        create: {
          userId,
          role: "OWNER",
        },
      },
      subscription: {
        create: {
          planId: plan.id,
          status: "ACTIVE",
        },
      },
    },
    include: {
      subscription: {
        include: { plan: true },
      },
    },
  });
}

export async function getWorkspaceMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });
}

export function hasWorkspaceRole(
  role: WorkspaceRole,
  allowedRoles: WorkspaceRole[],
) {
  return allowedRoles.includes(role);
}
