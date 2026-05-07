import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireCurrentWorkspace } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function InternalLayout({ children }: { children: ReactNode }) {
  await requireCurrentWorkspace();

  return <AppShell>{children}</AppShell>;
}
