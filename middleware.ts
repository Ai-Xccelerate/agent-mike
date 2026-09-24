import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { envList } from "@/lib/env";
import {
  assertLocalBypassSafe,
  authenticateManagerRequest,
  platformAuthRequired,
  platformAuthErrorResponse,
  PlatformAuthError,
} from "@/lib/clerk-core-auth";

/**
 * Mike is an AIX Core product deployment, so its manager API is protected by
 * the shared Clerk app and Core's `agents/mike/access` entitlement. The
 * verified tenant is forwarded to lib/identity.ts through headers that are
 * always deleted from the inbound request and written here after verification.
 *
 * Widget chat remains public and resolves its tenant from a per-org site token.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = envList(process.env.CORS_ALLOWED_ORIGINS);
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, x-worker-site-token, x-mike-site-token",
    Vary: "Origin",
  };
}

function withCors(response: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

function hasWidgetToken(req: NextRequest): boolean {
  return Boolean(
    req.headers.get("x-worker-site-token")?.trim() ||
      req.headers.get("x-mike-site-token")?.trim(),
  );
}

function publicRequest(req: NextRequest): boolean {
  const path = req.nextUrl.pathname;
  if (path === "/api/health") return true;
  if (path.startsWith("/api/v1/uploads/avatars/")) return true;
  if (path === "/api/v1/mailbox/callback") return true;
  if (
    hasWidgetToken(req) &&
    (path === "/api/v1/chat" || path === "/api/v1/worker")
  ) {
    return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  assertLocalBypassSafe();
  if (publicRequest(req) || !platformAuthRequired()) {
    return withCors(NextResponse.next(), headers);
  }

  try {
    const tenant = await authenticateManagerRequest(req);
    const requestHeaders = new Headers(req.headers);
    requestHeaders.delete("x-aix-verified-org-id");
    requestHeaders.delete("x-aix-verified-user-id");
    requestHeaders.delete("x-aix-verified-role");
    requestHeaders.delete("x-aix-verified-email");
    requestHeaders.set("x-aix-verified-org-id", tenant.orgId);
    requestHeaders.set("x-aix-verified-user-id", tenant.userId);
    requestHeaders.set("x-aix-verified-role", tenant.role);
    if (tenant.email) requestHeaders.set("x-aix-verified-email", tenant.email);
    return withCors(NextResponse.next({ request: { headers: requestHeaders } }), headers);
  } catch (error) {
    // Every known auth-rejection reason (bad/expired JWT, azp not allowed,
    // missing org/role claims, AIX Core denying a validly-signed token)
    // collapses to a plain 401/403 on the wire with no server-side trace —
    // impossible to tell them apart from HTTP status/logs alone. Logging the
    // actual PlatformAuthError here is what makes a live "why is this user
    // getting logged out" investigation possible instead of guessing.
    if (error instanceof PlatformAuthError) {
      console.warn(
        `[auth] rejected ${req.nextUrl.pathname}: ${error.status} ${error.message}`,
        error.details ?? "",
      );
    }
    return withCors(platformAuthErrorResponse(error), headers);
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
