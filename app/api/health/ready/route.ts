import { NextResponse } from "next/server";

import { getReadinessHealth } from "@/lib/observability/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getReadinessHealth();
  const status = result.status === "fail" ? 503 : 200;

  return NextResponse.json(result, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
