import { z } from "zod";

/**
 * Email domain approval.
 *
 * An allow-list of the domains this worker may share activity with. It is an
 * allow-list rather than a block-list on purpose: the safe failure is the
 * worker saying nothing to nobody, so a domain nobody has approved is refused,
 * and an empty list means the worker reaches no one outside the organization.
 *
 * Three states, and only three, because each one answers a different question:
 *
 *   pending  — someone asked. Nothing is allowed yet.
 *   approved — a manager said yes. The worker may share with this domain.
 *   revoked  — it was allowed and no longer is, or the request was turned down.
 *
 * A decision never deletes the row. Revoking keeps the domain and its
 * justification so the record of what was allowed, and when, survives — and so
 * putting one back is one click rather than retyping it from memory.
 */

export const DOMAIN_STATUSES = ["pending", "approved", "revoked"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

/** Who raised the request. The worker can ask for a domain mid-conversation. */
export const REQUESTERS = ["manager", "agent"] as const;
export type Requester = (typeof REQUESTERS)[number];

/**
 * Reduces what someone typed to a bare hostname.
 *
 * People paste whole addresses, URLs and `@domain` handles into a field
 * labelled "domain", and all three mean the same thing. Normalizing here —
 * rather than rejecting — is what makes the unique index on (org, domain)
 * meaningful: `Acme.com`, `acme.com/` and `hi@ACME.com` must not become three
 * separately approvable rows.
 */
export function normalizeDomain(input: string): string {
  let value = (input || "").trim().toLowerCase();
  if (!value) return "";

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  value = value.split("@").pop() ?? value; // whole address, or @handle
  value = value.split("/")[0]; // path
  value = value.split("?")[0].split("#")[0];
  value = value.split(":")[0]; // port
  value = value.replace(/\.+$/, ""); // trailing dot (fully-qualified form)

  return value;
}

/** One label: alphanumeric, inner hyphens allowed, 1–63 characters. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * True when the value is a hostname with at least one dot and a plausible TLD.
 *
 * Deliberately structural rather than clever: this gate exists to stop typos
 * and pasted sentences, not to decide whether a domain resolves. Whether mail
 * actually reaches it is the mail server's problem, and a domain that does not
 * exist is harmless in an allow-list.
 */
export function isValidDomain(value: string): boolean {
  if (!value || value.length > 253) return false;
  if (value.includes(" ") || value.includes("_")) return false;

  const labels = value.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => LABEL.test(label))) return false;

  const tld = labels[labels.length - 1];
  return /^[a-z]{2,}$/.test(tld);
}

export const domainSchema = z
  .string()
  .min(1, "Enter a domain")
  .transform(normalizeDomain)
  .refine(isValidDomain, "Enter a domain like acmecorp.com");

export const createDomainSchema = z.object({
  domain: domainSchema,
  reason: z
    .string()
    .trim()
    .max(500, "Keep the reason under 500 characters")
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  requestedBy: z.enum(REQUESTERS).optional().default("manager"),
});

export type CreateDomainInput = z.infer<typeof createDomainSchema>;

/**
 * The decisions a manager can take, rather than a free `status` field.
 *
 * Naming the action instead of the target state is what keeps the transition
 * rules in one place: "approve" means the same thing whether the row is
 * pending or revoked, and there is no way to spell a transition that should
 * not exist.
 */
export const DECISIONS = ["approve", "revoke"] as const;
export type Decision = (typeof DECISIONS)[number];

export const decisionSchema = z.object({
  decision: z.enum(DECISIONS),
});

/** The state a decision moves a row into. */
export function statusAfter(decision: Decision): DomainStatus {
  return decision === "approve" ? "approved" : "revoked";
}

/**
 * Whether a decision changes anything.
 *
 * Approving an already-approved domain is a no-op, not an error — two managers
 * clicking the same button should not produce a failure — but it must not
 * rewrite `decidedAt` either, or the audit trail loses when the decision was
 * actually taken.
 */
export function isNoOp(current: DomainStatus, decision: Decision): boolean {
  return current === statusAfter(decision);
}

export interface DomainRow {
  status: string;
  domain: string;
}

/** Every approved domain, lowercased — what an outbound check compares against. */
export function approvedDomains(rows: DomainRow[]): string[] {
  return rows.filter((row) => row.status === "approved").map((row) => row.domain);
}

/**
 * Whether the worker may share with this address.
 *
 * Takes the whole address rather than a domain so callers cannot forget to
 * split it, and compares only exact domains: approving `acme.com` does not
 * approve `mail.acme.com`, because a subdomain can be controlled by someone
 * the approver never considered. Someone who wants the subdomain approves it.
 */
export function isRecipientAllowed(address: string, rows: DomainRow[]): boolean {
  const domain = normalizeDomain(address);
  if (!domain) return false;
  return approvedDomains(rows).includes(domain);
}

/** Counts for the summary tiles, so the screen never derives them differently. */
export function countByStatus(rows: DomainRow[]): Record<DomainStatus, number> {
  const counts: Record<DomainStatus, number> = { pending: 0, approved: 0, revoked: 0 };
  for (const row of rows) {
    if ((DOMAIN_STATUSES as readonly string[]).includes(row.status)) {
      counts[row.status as DomainStatus] += 1;
    }
  }
  return counts;
}
