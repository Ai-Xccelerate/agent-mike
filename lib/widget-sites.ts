import { randomBytes, randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { widgetSites } from "@/db/schema";
import { db } from "@/lib/db";
import { ensureOrganization } from "@/lib/tenant-sync";

export type WidgetSite = typeof widgetSites.$inferSelect;

export function serializeWidgetSite(row: WidgetSite) {
  return {
    id: row.id,
    organization_id: row.organizationId,
    site_token: row.siteToken,
    active: row.active,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function widgetSiteByToken(siteToken: string): Promise<WidgetSite | null> {
  const token = siteToken.trim();
  if (!token) return null;
  const [row] = await db
    .select()
    .from(widgetSites)
    .where(and(eq(widgetSites.siteToken, token), eq(widgetSites.active, true)))
    .limit(1);
  return row ?? null;
}

export async function widgetSiteByOrgId(organizationId: string): Promise<WidgetSite | null> {
  const orgId = organizationId.trim();
  if (!orgId) return null;
  const [row] = await db
    .select()
    .from(widgetSites)
    .where(and(eq(widgetSites.organizationId, orgId), eq(widgetSites.active, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Ensure the signed-in org has a public widget site token.
 * Token is opaque and org-scoped — embed snippets must include it.
 */
export async function ensureWidgetSiteForOrg(organizationId: string): Promise<WidgetSite> {
  const orgId = organizationId.trim();
  if (!orgId) throw new Error("organization_id is required");

  await ensureOrganization(orgId, "Widget site");

  const existing = await widgetSiteByOrgId(orgId);
  if (existing) return existing;

  // One-time bridge: if this org was the old env widget tenant, reuse that token
  // so existing staging iframes keep working until managers re-copy the snippet.
  const legacyOrg = (process.env.MIKE_WIDGET_ORG_ID || "").trim();
  const legacyToken = (process.env.MIKE_WIDGET_SITE_TOKEN || "").trim();
  const siteToken =
    legacyOrg && legacyToken && legacyOrg === orgId
      ? legacyToken
      : randomBytes(32).toString("hex");

  const [created] = await db
    .insert(widgetSites)
    .values({
      id: randomUUID(),
      organizationId: orgId,
      siteToken,
      active: true,
    })
    .returning();
  return created;
}
