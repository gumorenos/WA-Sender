import { NextResponse } from "next/server";

import { getCurrentWorkspace } from "@/lib/auth/server";
import { listConversationsForOperations } from "@/server/agents/handoff-service";

export async function GET() {
  const authContext = await getCurrentWorkspace();

  if (!authContext) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  return NextResponse.json({
    conversations: await listConversationsForOperations(authContext.workspace.id),
  });
}
