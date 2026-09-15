import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { providerCredentials } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * Per-agent credentials, with the fleet's env values as the fallback.
 *
 * Two tiers on purpose:
 *
 *   env  — one application shared by every agent. What most deployments want,
 *          and what Nylas itself is designed around: one app, many grants.
 *   row  — this agent brings its own application. Needed when agents are
 *          billed separately, live in different regions, or belong to
 *          different customers entirely.
 *
 * `resolve` prefers the row and falls back to env, so turning a fleet agent
 * into a self-supplied one is writing a row, and turning it back is deleting
 * that row. Nothing else changes.
 *
 * Secrets are ciphertext at rest and never leave this module in the clear.
 * `describe` is what an API route may return: which fields are set, where they
 * came from, and nothing else.
 */

export type CredentialSource = "org" | "env" | "none";

export interface ResolvedCredentials<T> {
  values: T;
  source: CredentialSource;
}

/** What a settings screen is allowed to know. Never the values themselves. */
export interface CredentialSummary {
  source: CredentialSource;
  /** Field names that hold a non-empty value. */
  present: string[];
  /** Field names the provider requires but that are still missing. */
  missing: string[];
  updatedAt: string | null;
  updatedBy: string | null;
  metadata: Record<string, unknown>;
}

async function readRow(orgId: string, provider: string) {
  const [row] = await db
    .select()
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.organizationId, orgId),
        eq(providerCredentials.provider, provider),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * This agent's own credentials, or null.
 *
 * A row whose ciphertext will not decrypt — a rotated `ENCRYPTION_KEY`, a
 * restored backup — is treated as absent rather than thrown. The alternative
 * is a settings screen that cannot render at all, which helps nobody: falling
 * back to env keeps the agent working and the screen reports the row as
 * unreadable so someone can re-enter it.
 */
export async function getOrgCredentials<T extends Record<string, string>>(
  orgId: string,
  provider: string,
): Promise<T | null> {
  const row = await readRow(orgId, provider);
  return row ? decryptRow<T>(row, provider, orgId) : null;
}

function decryptRow<T extends Record<string, string>>(
  row: NonNullable<Awaited<ReturnType<typeof readRow>>>,
  provider: string,
  orgId: string,
): T | null {
  try {
    return JSON.parse(decrypt(row.secrets)) as T;
  } catch {
    console.warn(`[credentials] ${provider}/${orgId}: stored secrets could not be read`);
    return null;
  }
}

/**
 * Per-agent credentials if present, otherwise the fleet's env values.
 *
 * `envValues` is a thunk so env is only read when it is actually needed, and
 * so a provider can normalize (trim, default a region) in one place.
 */
export async function resolveCredentials<T extends Record<string, string>>(
  orgId: string,
  provider: string,
  envValues: () => T,
  isComplete: (values: T) => boolean,
): Promise<ResolvedCredentials<T> | null> {
  const own = await getOrgCredentials<T>(orgId, provider);
  if (own && isComplete(own)) return { values: own, source: "org" };

  const fleet = envValues();
  if (isComplete(fleet)) return { values: fleet, source: "env" };

  return null;
}

/** Writes this agent's own credentials, replacing any it already had. */
export async function setOrgCredentials(input: {
  organizationId: string;
  provider: string;
  secrets: Record<string, string>;
  metadata?: Record<string, unknown>;
  updatedBy?: string | null;
}): Promise<void> {
  const now = new Date();
  const payload = encrypt(JSON.stringify(input.secrets));
  await db
    .insert(providerCredentials)
    .values({
      organizationId: input.organizationId,
      provider: input.provider,
      secrets: payload,
      metadata: input.metadata ?? {},
      updatedBy: input.updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [providerCredentials.organizationId, providerCredentials.provider],
      set: {
        secrets: payload,
        metadata: input.metadata ?? {},
        updatedBy: input.updatedBy ?? null,
        updatedAt: now,
      },
    });
}

/** Drops this agent's own credentials; it falls back to the fleet's. */
export async function clearOrgCredentials(orgId: string, provider: string): Promise<boolean> {
  const [removed] = await db
    .delete(providerCredentials)
    .where(
      and(
        eq(providerCredentials.organizationId, orgId),
        eq(providerCredentials.provider, provider),
      ),
    )
    .returning();
  return Boolean(removed);
}

/**
 * The safe-to-serialize view: what is set and where it came from.
 *
 * Deliberately returns no value, not even masked. A mask still leaks length,
 * and there is no case where a settings screen needs to read a secret back —
 * re-entering it is the recovery path.
 */
export async function describeCredentials<T extends Record<string, string>>(
  orgId: string,
  provider: string,
  required: (keyof T & string)[],
  envValues: () => T,
): Promise<CredentialSummary> {
  const row = await readRow(orgId, provider);
  const own = row ? decryptRow<T>(row, provider, orgId) : null;

  const values = own ?? envValues();
  const source: CredentialSource = own
    ? "org"
    : required.every((key) => (values[key] || "").trim())
      ? "env"
      : "none";

  const present = required.filter((key) => (values[key] || "").trim());
  return {
    source,
    present,
    missing: required.filter((key) => !(values[key] || "").trim()),
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    updatedBy: row?.updatedBy ?? null,
    metadata: (row?.metadata as Record<string, unknown>) ?? {},
  };
}
