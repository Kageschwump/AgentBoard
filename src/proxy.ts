import { NextResponse, type NextRequest } from "next/server";
import { getAuthMode, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Paths that authenticate themselves (runner tokens, webhook secrets) or must
// be reachable before logging in.
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/api/auth/login") return true;
  if (pathname.startsWith("/api/runner/")) return true; // bearer token, checked per route
  if (pathname === "/agentboard-runner.mjs") return true; // runner script, no secrets
  // Webhooks are only public when they're protected by their own secret
  if (pathname.startsWith("/api/webhooks") && process.env.WEBHOOK_SECRET) return true;
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const mode = getAuthMode();

  if (mode === "misconfigured") {
    return new NextResponse(
      "AgentBoard is not configured: set the AGENTBOARD_PASSWORD environment variable.",
      { status: 503 }
    );
  }
  if (mode === "open" || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
