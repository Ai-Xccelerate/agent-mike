import { NextResponse, type NextRequest } from "next/server";
import { envList } from "@/lib/env";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3000",
  "https://mike-staging.aiworkforce.md",
  "https://mike.aiworkforce.md",
];

function allowedOrigins() {
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...envList("CORS_ALLOWED_ORIGINS"),
    ...envList("CORS_ORIGINS"),
    ...envList("NEXT_PUBLIC_WIDGET_ORIGIN"),
  ]);
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const res = NextResponse.next();

  if (allowedOrigins().has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-mike-site-token",
    );
    res.headers.set("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ["/api/:path*", "/health"],
};
