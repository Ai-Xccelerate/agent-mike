import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { envList } from "@/lib/env";

/**
 * CORS only. No auth here — identity resolution happens per-route via
 * lib/identity.ts, which is what stays swappable. Baking an auth vendor into
 * middleware (as agent-mike's staging build did with clerkMiddleware) makes
 * every route depend on that vendor just to boot; this doesn't.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = envList(process.env.CORS_ALLOWED_ORIGINS);
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-worker-site-token",
    Vary: "Origin",
  };
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const res = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    res.headers.set(key, value);
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
