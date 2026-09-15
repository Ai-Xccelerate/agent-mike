import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { widgetSites } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/env";

/**
 * Every request that needs to know "which org, which user" goes through an
 * IdentityAdapter. This is the seam R6 already requires for business-system
 * integrations (CRM/ticketing: decoupled, external, never baked in) applied
 * to identity/access as well — the Foundation itself must not hard-depend on
 * any particular auth vendor.
 *
 * StandaloneIdentityAdapter (below) is the default: single tenant, no login,
 * matches Rahul's own framing — "I don't expect my end user business
 * customer to come and go and configure it... if you have a repo which can
 * be taken and deployed left, right, and center, that will be amazing."
 * One deployment = one org, configured directly, no auth infra required.
 *
 * A platform-specific adapter (Clerk + AIX Core, or anything else) plugs in
 * here later, when a worker is actually deployed onto a real multi-tenant
 * platform — without the base Foundation ever needing to know it exists.
 */

export interface TenantContext {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  source: string;
}

export interface IdentityAdapter {
  /** Manager-console requests (Settings, Inbox, Chat test bench, etc). */
  resolveManagerRequest(req: NextRequest): Promise<TenantContext>;
  /** Public, unauthenticated requests from the embeddable widget. */
  resolveWidgetRequest(req: NextRequest): Promise<TenantContext | null>;
}

class StandaloneIdentityAdapter implements IdentityAdapter {
  async resolveManagerRequest(): Promise<TenantContext> {
    return {
      orgId: DEFAULT_ORG_ID,
      userId: "local-manager",
      role: "owner",
      source: "standalone",
    };
  }

  async resolveWidgetRequest(req: NextRequest): Promise<TenantContext | null> {
    const token = (req.headers.get("x-worker-site-token") || "").trim();
    if (!token) return null;

    const [site] = await db
      .select()
      .from(widgetSites)
      .where(eq(widgetSites.siteToken, token))
      .limit(1);

    if (!site) return null;

    return {
      orgId: site.organizationId,
      userId: "widget",
      role: "member",
      source: "widget",
    };
  }
}

/**
 * One deployment, several agents — George, Jules, Pepper side by side.
 *
 * Every table is already org-scoped, so an agent *is* an org: give this
 * adapter a real org id and the worker profile, mailbox, knowledge, email
 * domains and conversations all separate on their own. Nothing downstream
 * changes, because nothing downstream ever hardcoded the org.
 *
 * The agent is named by the `x-aix-agent` header, or `?agent=` for a browser
 * that cannot set one. Opt-in via `MULTI_AGENT=true`, and deliberately not a
 * security boundary — a header anyone can set is fine for local work and for
 * proving per-agent isolation, and is exactly what the real platform adapter
 * (Clerk + AIX Core) replaces when it lands.
 */
export class MultiAgentIdentityAdapter implements IdentityAdapter {
  constructor(private readonly fallbackOrgId: string = DEFAULT_ORG_ID) {}

  /** Slug-shaped, so an agent id can never be smuggled into a query. */
  static normalize(value: string | null | undefined): string | null {
    const slug = (value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    return slug ? slug.slice(0, 64) : null;
  }

  async resolveManagerRequest(req: NextRequest): Promise<TenantContext> {
    const fromHeader = MultiAgentIdentityAdapter.normalize(req.headers.get("x-aix-agent"));
    const fromQuery = MultiAgentIdentityAdapter.normalize(req.nextUrl.searchParams.get("agent"));
    return {
      orgId: fromHeader ?? fromQuery ?? this.fallbackOrgId,
      userId: "local-manager",
      role: "owner",
      source: "multi-agent",
    };
  }

  /** The widget still identifies itself by site token — one per agent. */
  async resolveWidgetRequest(req: NextRequest): Promise<TenantContext | null> {
    return new StandaloneIdentityAdapter().resolveWidgetRequest(req);
  }
}

function defaultAdapter(): IdentityAdapter {
  return (process.env.MULTI_AGENT || "").toLowerCase() === "true"
    ? new MultiAgentIdentityAdapter()
    : new StandaloneIdentityAdapter();
}

let adapter: IdentityAdapter = defaultAdapter();

/** Swap the identity adapter (e.g. to a platform-specific one) without touching call sites. */
export function setIdentityAdapter(next: IdentityAdapter) {
  adapter = next;
}

export function getIdentityAdapter(): IdentityAdapter {
  return adapter;
}
