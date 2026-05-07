import { NextResponse } from "next/server";
import { requireCurrentWorkspace } from "@/lib/auth/server";

export async function GET() {
  const { user, workspace, membership } = await requireCurrentWorkspace();

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      status: user.status,
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      status: workspace.status,
      plan: workspace.subscription?.plan
        ? {
            code: workspace.subscription.plan.code,
            name: workspace.subscription.plan.name,
            maxInstances: workspace.subscription.plan.maxInstances,
            maxActiveCampaigns: workspace.subscription.plan.maxActiveCampaigns,
            dailyMessageLimit: workspace.subscription.plan.dailyMessageLimit,
          }
        : null,
    },
    membership: {
      role: membership.role,
    },
  });
}
