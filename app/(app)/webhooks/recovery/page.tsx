import { WebhookRecoveryClient } from "@/components/webhooks/webhook-recovery-client";
import { requireWorkspaceRole } from "@/lib/auth/server";

export default async function WebhookRecoveryPage() {
  await requireWorkspaceRole(["OWNER", "ADMIN"]);

  return <WebhookRecoveryClient />;
}
