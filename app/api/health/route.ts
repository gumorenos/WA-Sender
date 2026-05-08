import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "wa-sender",
    status: "ok",
    checkedAt: new Date().toISOString(),
  });
}
