import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/instances",
  "/campaigns",
  "/agents",
  "/utilities",
];

const protectedApiPrefixes = [
  "/api/me",
  "/api/instances",
  "/api/campaigns",
  "/api/agents",
  "/api/utilities",
];

function hasSessionCookie(request: NextRequest) {
  return (
    request.cookies.has("next-auth.session-token") ||
    request.cookies.has("__Secure-next-auth.session-token")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );
  const isProtectedApiRoute = protectedApiPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtectedApiRoute && !hasSessionCookie(request)) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (!isProtectedRoute || hasSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/instances/:path*",
    "/campaigns/:path*",
    "/agents/:path*",
    "/utilities/:path*",
    "/api/me",
    "/api/me/:path*",
    "/api/instances/:path*",
    "/api/campaigns/:path*",
    "/api/agents/:path*",
    "/api/utilities/:path*",
  ],
};
