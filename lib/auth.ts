import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { AGENT_SLUG, assertLocalBypassSafe, envList, isLocalUnauthEnabled } from "@/lib/env";
import { ensureOrganization, ensureTenantMirror } from "@/lib/tenant-sync";

const JWKS_CACHE = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const ACCESS_CACHE = new Map<string, { hasAccess: boolean; reason?: string; checkedAt: number }>();
const ACCESS_CACHE_TTL_MS = 60_000;

export type TenantContext = {
  orgId: string;
  userId: string;
  role: string;
  rawJwt: string | null;
  source: "clerk" | "dev" | "widget";
};

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function jwksFor(url: string) {
  const cached = JWKS_CACHE.get(url);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(url));
  JWKS_CACHE.set(url, jwks);
  return jwks;
}

function extractOrgClaim(payload: JWTPayload): { orgId: string | null; role: string | null } {
  const compact = payload.o;
  const compactOrg =
    typeof compact === "object" && compact !== null ? (compact as Record<string, unknown>) : null;

  const orgId =
    typeof payload.org_id === "string"
      ? payload.org_id
      : typeof compactOrg?.id === "string"
        ? compactOrg.id
        : null;

  const rawRole =
    typeof payload.org_role === "string"
      ? payload.org_role
      : typeof compactOrg?.rol === "string"
        ? compactOrg.rol
        : null;

  const role = rawRole?.replace(/^org:/, "") ?? null;
  return { orgId, role };
}

function validateAuthorizedParty(payload: JWTPayload) {
  const allowed = envList("CLERK_AUTHORIZED_PARTIES");
  if (allowed.length === 0) return;

  const azp = typeof payload.azp === "string" ? payload.azp : null;
  if (!azp || !allowed.includes(azp)) {
    throw new AuthError(401, "JWT authorized party is not allowed", {
      code: "azp_rejected",
      azp,
      allowed,
    });
  }
}

function requestHostIsLocal(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function devTenant(req: NextRequest): TenantContext | null {
  if (!isLocalUnauthEnabled()) return null;
  if (!requestHostIsLocal(req)) return null;
  return {
    orgId: process.env.MIKE_DEV_ORG_ID || process.env.NEXT_PUBLIC_DEV_ORG_ID || "dev-org",
    userId: process.env.MIKE_DEV_USER_ID || process.env.NEXT_PUBLIC_DEV_USER_ID || "dev-user",
    role: "owner",
    rawJwt: null,
    source: "dev",
  };
}

function widgetTenant(req: NextRequest): TenantContext | null {
  const expected = (process.env.MIKE_WIDGET_SITE_TOKEN || "").trim();
  if (!expected) return null;
  const provided = req.headers.get("x-mike-site-token") || "";
  if (provided !== expected) return null;
  const orgId = (process.env.MIKE_WIDGET_ORG_ID || "").trim();
  if (!orgId) {
    throw new AuthError(500, "MIKE_WIDGET_ORG_ID is not configured");
  }
  return {
    orgId,
    userId: "widget",
    role: "member",
    rawJwt: null,
    source: "widget",
  };
}

async function verifyClerkToken(token: string): Promise<{ tenant: TenantContext; payload: JWTPayload }> {
  const jwksUrl = process.env.CLERK_JWKS_URL;
  const issuer = process.env.CLERK_ISSUER;
  if (!jwksUrl || !issuer) {
    throw new AuthError(500, "Clerk JWT verification is not configured");
  }

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, jwksFor(jwksUrl), {
      issuer,
      algorithms: ["RS256"],
    });
    payload = verified.payload;
  } catch (err) {
    throw new AuthError(401, "Invalid Clerk token", err instanceof Error ? err.message : String(err));
  }

  validateAuthorizedParty(payload);

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const { orgId, role } = extractOrgClaim(payload);
  const validRoles = new Set(["owner", "admin", "member", "platform_support"]);

  if (!userId || !orgId || !role || !validRoles.has(role)) {
    throw new AuthError(401, "JWT missing required user, org, or role claims", {
      code: "missing_org_claims",
      hasUserId: Boolean(userId),
      hasOrgId: Boolean(orgId),
      hasRole: Boolean(role),
    });
  }

  return {
    tenant: { orgId, userId, role, rawJwt: token, source: "clerk" },
    payload,
  };
}

async function requireCoreAccess(tenant: TenantContext) {
  if (tenant.source !== "clerk") return;

  const cached = ACCESS_CACHE.get(tenant.userId);
  if (cached && Date.now() - cached.checkedAt < ACCESS_CACHE_TTL_MS) {
    if (!cached.hasAccess) {
      throw new AuthError(403, "No access to Mike", {
        error: "no_agent_access",
        reason: cached.reason,
      });
    }
    return;
  }

  const coreApi = process.env.AIX_CORE_API_URL ?? process.env.AIX_CORE_API_BASE_URL;
  if (!coreApi) throw new AuthError(500, "AIX Core API URL is not configured");

  let res: Response;
  try {
    res = await fetch(`${coreApi.replace(/\/$/, "")}/api/v1/agents/${AGENT_SLUG}/access`, {
      headers: { Authorization: `Bearer ${tenant.rawJwt}` },
      cache: "no-store",
    });
  } catch (err) {
    throw new AuthError(503, "AIX Core access check failed", err instanceof Error ? err.message : String(err));
  }

  if (res.status === 401) throw new AuthError(401, "Token rejected by AIX Core");
  if (res.status === 404) {
    throw new AuthError(503, "Mike is not registered in the AIX Core catalog");
  }
  if (res.status >= 500) throw new AuthError(503, `AIX Core access check failed: ${res.status}`);
  if (!res.ok) throw new AuthError(403, `AIX Core access denied: ${res.status}`);

  const data = (await res.json().catch(() => null)) as { has_access?: boolean; reason?: string } | null;
  const hasAccess = Boolean(data?.has_access);
  ACCESS_CACHE.set(tenant.userId, {
    hasAccess,
    reason: data?.reason,
    checkedAt: Date.now(),
  });
  if (!hasAccess) {
    throw new AuthError(403, "No access to Mike", {
      error: "no_agent_access",
      reason: data?.reason,
    });
  }
}

export async function requireTenant(req: NextRequest): Promise<TenantContext> {
  assertLocalBypassSafe();
  const token = bearerToken(req);
  if (!token) {
    const fallback = devTenant(req);
    if (fallback) {
      await ensureOrganization(fallback.orgId, "Local development");
      return fallback;
    }
    throw new AuthError(401, "Missing Authorization header");
  }

  const { tenant, payload } = await verifyClerkToken(token);
  await requireCoreAccess(tenant);
  try {
    await ensureTenantMirror(payload);
  } catch (err) {
    console.warn("[auth] tenant mirror failed (non-fatal):", err);
  }
  return tenant;
}

export async function requireManagerOrWidget(req: NextRequest): Promise<TenantContext> {
  assertLocalBypassSafe();
  const widget = widgetTenant(req);
  if (widget) {
    await ensureOrganization(widget.orgId, "Widget site");
    return widget;
  }
  return requireTenant(req);
}

export function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    console.warn("[auth] rejected", { status: err.status, message: err.message });
    const body =
      err.status === 403 && err.details && typeof err.details === "object"
        ? {
            detail: {
              error: "no_agent_access",
              ...(err.details as object),
              message:
                "You don't have access to Mike. Ask your org admin to grant access from the AIX Core dashboard.",
            },
          }
        : { error: err.message, details: err.details };
    return NextResponse.json(body, { status: err.status });
  }
  console.error("[auth] unexpected", err);
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
