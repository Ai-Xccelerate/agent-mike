import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { envList } from "@/lib/env";

const JWKS_CACHE = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const ACCESS_CACHE = new Map<string, { hasAccess: boolean; reason?: string; checkedAt: number }>();
const ACCESS_CACHE_TTL_MS = 60_000;

export type ClerkTenant = {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  rawJwt: string | null;
  source: "clerk" | "dev";
};

export class PlatformAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function deployedEnvironment(): boolean {
  const name = (
    process.env.APP_ENV ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_ENVIRONMENT ||
    ""
  ).toLowerCase();
  return Boolean(process.env.RAILWAY_ENVIRONMENT) || name === "staging" || name === "production";
}

function localBypassRequested(): boolean {
  return ["true", "1", "yes"].includes((process.env.MIKE_ALLOW_LOCAL_UNAUTH || "").toLowerCase());
}

export function assertLocalBypassSafe(): void {
  if (localBypassRequested() && deployedEnvironment()) {
    throw new Error(
      "MIKE_ALLOW_LOCAL_UNAUTH is not allowed in staging or production. Unset it and use Clerk.",
    );
  }
}

function localBypass(req: NextRequest): ClerkTenant | null {
  assertLocalBypassSafe();
  if (!localBypassRequested() || process.env.APP_ENV !== "local" || process.env.NODE_ENV === "production") {
    return null;
  }
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1") return null;
  return {
    orgId: process.env.MIKE_DEV_ORG_ID || "dev-org",
    userId: process.env.MIKE_DEV_USER_ID || "dev-user",
    role: "owner",
    rawJwt: null,
    source: "dev",
  };
}

function bearerToken(req: NextRequest): string | null {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function jwksFor(url: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = JWKS_CACHE.get(url);
  if (existing) return existing;
  const created = createRemoteJWKSet(new URL(url));
  JWKS_CACHE.set(url, created);
  return created;
}

function orgClaims(payload: JWTPayload): { orgId: string | null; role: ClerkTenant["role"] | null } {
  const compact =
    typeof payload.o === "object" && payload.o !== null
      ? (payload.o as Record<string, unknown>)
      : null;
  const orgId =
    typeof payload.org_id === "string"
      ? payload.org_id
      : typeof compact?.id === "string"
        ? compact.id
        : null;
  const rawRole =
    typeof payload.org_role === "string"
      ? payload.org_role
      : typeof compact?.rol === "string"
        ? compact.rol
        : null;
  const normalized = rawRole?.replace(/^org:/, "");
  const role =
    normalized === "owner"
      ? "owner"
      : normalized === "admin" || normalized === "platform_support"
        ? "admin"
        : normalized === "member"
          ? "member"
          : null;
  return { orgId, role };
}

async function verifyClerkToken(token: string): Promise<ClerkTenant> {
  const jwksUrl = (process.env.CLERK_JWKS_URL || "").trim();
  const issuer = (process.env.CLERK_ISSUER || "").trim();
  if (!jwksUrl || !issuer) {
    throw new PlatformAuthError(500, "Clerk JWT verification is not configured");
  }

  let payload: JWTPayload;
  try {
    payload = (
      await jwtVerify(token, jwksFor(jwksUrl), {
        issuer,
        algorithms: ["RS256"],
      })
    ).payload;
  } catch (error) {
    throw new PlatformAuthError(
      401,
      "Invalid Clerk token",
      error instanceof Error ? error.message : String(error),
    );
  }

  const allowed = envList(process.env.CLERK_AUTHORIZED_PARTIES);
  const azp = typeof payload.azp === "string" ? payload.azp : null;
  if (allowed.length > 0 && (!azp || !allowed.includes(azp))) {
    throw new PlatformAuthError(401, "JWT authorized party is not allowed", {
      code: "azp_rejected",
      azp,
    });
  }

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const { orgId, role } = orgClaims(payload);
  if (!userId || !orgId || !role) {
    throw new PlatformAuthError(401, "JWT missing required user, org, or role claims", {
      code: "missing_org_claims",
    });
  }
  return { orgId, userId, role, rawJwt: token, source: "clerk" };
}

async function requireCoreAccess(tenant: ClerkTenant): Promise<void> {
  if (tenant.source !== "clerk") return;
  const cacheKey = `${tenant.orgId}:${tenant.userId}`;
  const cached = ACCESS_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < ACCESS_CACHE_TTL_MS) {
    if (!cached.hasAccess) {
      throw new PlatformAuthError(403, "No access to Mike", {
        error: "no_agent_access",
        reason: cached.reason,
      });
    }
    return;
  }

  const coreApi = process.env.AIX_CORE_API_URL || process.env.AIX_CORE_API_BASE_URL;
  if (!coreApi) throw new PlatformAuthError(500, "AIX Core API URL is not configured");
  const slug = (process.env.AIX_CORE_AGENT_SLUG || "mike").trim();

  let response: Response;
  try {
    response = await fetch(
      `${coreApi.replace(/\/+$/, "")}/api/v1/agents/${encodeURIComponent(slug)}/access`,
      {
        headers: { Authorization: `Bearer ${tenant.rawJwt}` },
        ...({ cache: "no-store" } as Record<string, unknown>),
      },
    );
  } catch (error) {
    throw new PlatformAuthError(
      503,
      "AIX Core access check failed",
      error instanceof Error ? error.message : String(error),
    );
  }

  if (response.status === 401) throw new PlatformAuthError(401, "Token rejected by AIX Core");
  if (response.status === 404) {
    throw new PlatformAuthError(503, "Mike is not registered in the AIX Core catalog");
  }
  if (response.status >= 500) {
    throw new PlatformAuthError(503, `AIX Core access check failed: ${response.status}`);
  }
  if (!response.ok) {
    throw new PlatformAuthError(403, `AIX Core access denied: ${response.status}`);
  }

  const data = (await response.json().catch(() => null)) as
    | { has_access?: boolean; reason?: string }
    | null;
  const hasAccess = Boolean(data?.has_access);
  ACCESS_CACHE.set(cacheKey, { hasAccess, reason: data?.reason, checkedAt: Date.now() });
  if (!hasAccess) {
    throw new PlatformAuthError(403, "No access to Mike", {
      error: "no_agent_access",
      reason: data?.reason,
    });
  }
}

export function platformAuthConfigured(): boolean {
  return Boolean(process.env.CLERK_JWKS_URL && process.env.CLERK_ISSUER);
}

/** Clerk is mandatory on Railway/staging; local tests stay standalone unless explicitly opted in. */
export function platformAuthRequired(): boolean {
  const explicit = ["true", "1", "yes"].includes(
    (process.env.MIKE_PLATFORM_AUTH || "").toLowerCase(),
  );
  return explicit || deployedEnvironment();
}

export async function authenticateManagerRequest(req: NextRequest): Promise<ClerkTenant> {
  const local = localBypass(req);
  if (local) return local;
  const token = bearerToken(req);
  if (!token) throw new PlatformAuthError(401, "Missing Authorization header");
  const tenant = await verifyClerkToken(token);
  await requireCoreAccess(tenant);
  return tenant;
}

export function platformAuthErrorResponse(error: unknown): NextResponse {
  if (error instanceof PlatformAuthError) {
    const details =
      error.status === 403 && error.details && typeof error.details === "object"
        ? {
            detail: {
              error: "no_agent_access",
              ...(error.details as object),
              message:
                "You don't have access to Mike. Ask your org admin to grant access from AIX Core.",
            },
          }
        : { error: error.message, details: error.details };
    return NextResponse.json(details, { status: error.status });
  }
  console.error("[auth] unexpected", error);
  return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
}
