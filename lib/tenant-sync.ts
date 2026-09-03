import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import type { JWTPayload } from "jose";
import { db } from "@/lib/db";
import { organizationMemberships, organizations, users } from "@/db/schema";

type MembershipRole = "owner" | "admin" | "member" | "platform_support";

function cleanStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function emailFromClaims(claims: JWTPayload, clerkSub: string): string {
  const direct = cleanStr(claims.email);
  if (direct) return direct;
  const emails = claims.email_addresses;
  if (Array.isArray(emails) && emails.length > 0) {
    const first = emails[0];
    if (typeof first === "object" && first !== null) {
      const addr = cleanStr((first as Record<string, unknown>).email_address);
      if (addr) return addr;
    }
  }
  return `clerk_${clerkSub.slice(0, 24)}@users.clerk.invalid`;
}

function displayNameFromClaims(claims: JWTPayload): string | null {
  for (const key of ["name", "full_name"] as const) {
    const v = cleanStr(claims[key]);
    if (v) return v;
  }
  const given = cleanStr(claims.given_name ?? claims.first_name);
  const family = cleanStr(claims.family_name ?? claims.last_name);
  const parts = [given, family].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function orgNameFromClaims(claims: JWTPayload): string | null {
  const direct = cleanStr(claims.org_name ?? claims.organization_name);
  if (direct) return direct;
  const compact = claims.o;
  if (typeof compact === "object" && compact !== null) {
    const o = compact as Record<string, unknown>;
    return cleanStr(o.name ?? o.nme);
  }
  return null;
}

function normalizeRole(raw: string | null): MembershipRole {
  if (!raw) return "member";
  const sl = raw.toLowerCase();
  if (sl.includes("owner")) return "owner";
  if (sl.includes("admin")) return "admin";
  if (sl.includes("platform_support")) return "platform_support";
  return "member";
}

export async function ensureOrganization(orgId: string, name?: string | null) {
  const [existing] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!existing) {
    await db.insert(organizations).values({ id: orgId, name: name ?? orgId });
  }
}

export async function ensureTenantMirror(claims: JWTPayload): Promise<void> {
  const clerkUserId = cleanStr(claims.sub);
  const compact = claims.o;
  const compactOrg =
    typeof compact === "object" && compact !== null ? (compact as Record<string, unknown>) : null;
  const clerkOrgId = cleanStr(claims.org_id) ?? cleanStr(compactOrg?.id);
  if (!clerkUserId || !clerkOrgId) {
    throw new Error("JWT missing sub or org_id for tenant mirror");
  }

  const email = emailFromClaims(claims, clerkUserId);
  const displayName = displayNameFromClaims(claims);
  const orgName = orgNameFromClaims(claims);
  const rawRole =
    cleanStr(claims.org_role) ?? cleanStr(compactOrg?.rol)?.replace(/^org:/, "") ?? null;
  const role = normalizeRole(rawRole);

  await db.transaction(async (tx) => {
    const [existingUser] = await tx.select().from(users).where(eq(users.id, clerkUserId)).limit(1);
    if (!existingUser) {
      await tx.insert(users).values({ id: clerkUserId, email, displayName });
    } else {
      const updates: Partial<typeof users.$inferInsert> = {};
      if (email && (!existingUser.email || existingUser.email.includes("users.clerk.invalid"))) {
        updates.email = email;
      }
      if (displayName && displayName !== existingUser.displayName) {
        updates.displayName = displayName;
      }
      if (Object.keys(updates).length > 0) {
        await tx.update(users).set(updates).where(eq(users.id, clerkUserId));
      }
    }

    const [existingOrg] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, clerkOrgId))
      .limit(1);
    if (!existingOrg) {
      await tx.insert(organizations).values({ id: clerkOrgId, name: orgName });
    } else if (orgName && orgName !== existingOrg.name) {
      await tx.update(organizations).set({ name: orgName }).where(eq(organizations.id, clerkOrgId));
    }

    const [existingMship] = await tx
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, clerkOrgId),
          eq(organizationMemberships.userId, clerkUserId),
        ),
      )
      .limit(1);

    if (!existingMship) {
      await tx.insert(organizationMemberships).values({
        id: randomUUID(),
        organizationId: clerkOrgId,
        userId: clerkUserId,
        role,
        status: "active",
      });
    } else {
      await tx
        .update(organizationMemberships)
        .set({ role, status: "active" })
        .where(eq(organizationMemberships.id, existingMship.id));
    }
  });
}
