import { NextResponse } from "next/server";

import {
  getDeepHealth,
  isAuthorizedHealthRequest,
} from "@/lib/observability/health";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedHealthRequest(request)) {
    return NextResponse.json({ error: "Healthcheck no autorizado." }, { status: 401 });
  }

  const result = await getDeepHealth();
  const status = result.status === "fail" ? 503 : 200;

  return NextResponse.json(result, { status });
}
