/**
 * Mike doesn't own its team roster — AIX Core does. This fetches the live
 * member list from Core (same platform, same entitlement API
 * requireCoreAccess already calls in lib/clerk-core-auth.ts) so the roster
 * shown here reflects invites/roles made in Core immediately, not only
 * people who have personally logged into Mike at least once.
 */

export type CoreRosterMember = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string | null;
  hasAccess: boolean;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function normalizeMember(raw: unknown): CoreRosterMember | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const userId = str(m.user_id ?? m.userId ?? m.clerk_user_id ?? m.id);
  if (!userId) return null;
  return {
    userId,
    email: str(m.email) ?? "",
    displayName: str(m.display_name ?? m.displayName ?? m.name ?? m.full_name),
    role: str(m.role ?? m.org_role),
    hasAccess: Boolean(m.has_access ?? m.hasAccess ?? true),
  };
}

/** Returns null on any failure (missing config, network error, bad shape) — caller falls back to the local mirror. */
export async function fetchCoreOrgRoster(rawJwt: string | null): Promise<CoreRosterMember[] | null> {
  if (!rawJwt) return null;
  const coreApi = process.env.AIX_CORE_API_URL || process.env.AIX_CORE_API_BASE_URL;
  if (!coreApi) return null;
  const slug = (process.env.AIX_CORE_AGENT_SLUG || "mike").trim();

  try {
    const res = await fetch(`${coreApi.replace(/\/+$/, "")}/api/v1/agents/${encodeURIComponent(slug)}/members`, {
      headers: { Authorization: `Bearer ${rawJwt}` },
      ...({ cache: "no-store" } as Record<string, unknown>),
    });
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as { members?: unknown })?.members)
        ? (data as { members: unknown[] }).members
        : null;
    if (!list) return null;

    return list.map(normalizeMember).filter((m): m is CoreRosterMember => m !== null);
  } catch {
    return null;
  }
}
