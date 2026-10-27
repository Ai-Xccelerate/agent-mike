import { Agent, run } from "@openai/agents";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workerManagers } from "@/db/schema";
import { guardrailModel, modelUnavailabilityReason } from "@/lib/env";
import type { HistoryTurn } from "@/lib/conversation-memory";

/**
 * The people a handover can be routed to (Settings > Human manager). Each covers some areas, may have a backup who is
 * told instead while they are switched off, and may be in the Critical group told about every Critical handover. The
 * single manager on the worker profile stays as the fallback: when the list is empty, nobody matches, or nobody on the
 * path is switched on, the handover goes there, exactly as before the list existed.
 *
 * The worker only ever picks from this list (chooseManager); an id it invents is dropped.
 */

export type WorkerManager = typeof workerManagers.$inferSelect;

export const MANAGER_LIMITS = { name: 80, email: 200, areas: 400, perOrganization: 20 } as const;

const baseSchema = z.object({
  name: z.string().trim().min(1).max(MANAGER_LIMITS.name),
  email: z.string().trim().toLowerCase().email().max(MANAGER_LIMITS.email),
  areas: z.string().trim().max(MANAGER_LIMITS.areas).default(""),
  backupId: z.string().uuid().nullable().optional(),
  notifyOnCritical: z.boolean().optional(),
  enabled: z.boolean().optional(),
});
export const managerCreateSchema = baseSchema;
// A patch changes only what it names: "areas" must not fall back to its empty default and wipe what the person covers.
export const managerPatchSchema = baseSchema.extend({ areas: z.string().trim().max(MANAGER_LIMITS.areas) }).partial();

export async function listManagers(organizationId: string): Promise<WorkerManager[]> {
  return db.select().from(workerManagers).where(eq(workerManagers.organizationId, organizationId)).orderBy(asc(workerManagers.createdAt));
}

/** A backup must be someone else in the same organization. Returns an error message, or null when it is fine. */
async function backupProblem(organizationId: string, backupId: string | null | undefined, selfId?: string): Promise<string | null> {
  if (!backupId) return null;
  if (backupId === selfId) return "A person cannot be their own backup.";
  const [row] = await db
    .select({ id: workerManagers.id })
    .from(workerManagers)
    .where(and(eq(workerManagers.organizationId, organizationId), eq(workerManagers.id, backupId)))
    .limit(1);
  return row ? null : "That backup is not in your list.";
}

export async function createManager(
  organizationId: string,
  input: z.infer<typeof managerCreateSchema>,
): Promise<{ ok: true; manager: WorkerManager } | { ok: false; status: number; error: string }> {
  if ((await listManagers(organizationId)).length >= MANAGER_LIMITS.perOrganization) {
    return { ok: false, status: 409, error: `You can keep at most ${MANAGER_LIMITS.perOrganization} people in the list.` };
  }
  const problem = await backupProblem(organizationId, input.backupId);
  if (problem) return { ok: false, status: 422, error: problem };
  const [manager] = await db
    .insert(workerManagers)
    .values({ organizationId, ...input, backupId: input.backupId ?? null })
    .returning();
  return { ok: true, manager };
}

export async function updateManager(
  organizationId: string,
  id: string,
  fields: z.infer<typeof managerPatchSchema>,
): Promise<{ ok: true; manager: WorkerManager } | { ok: false; status: number; error: string }> {
  const problem = await backupProblem(organizationId, fields.backupId, id);
  if (problem) return { ok: false, status: 422, error: problem };
  const [manager] = await db
    .update(workerManagers)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(workerManagers.organizationId, organizationId), eq(workerManagers.id, id)))
    .returning();
  return manager ? { ok: true, manager } : { ok: false, status: 404, error: "Not found" };
}

export async function deleteManager(organizationId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(workerManagers)
    .where(and(eq(workerManagers.organizationId, organizationId), eq(workerManagers.id, id)))
    .returning({ id: workerManagers.id });
  if (deleted.length === 0) return false;
  // Whoever had this person as their backup has none now.
  await db.update(workerManagers).set({ backupId: null }).where(and(eq(workerManagers.organizationId, organizationId), eq(workerManagers.backupId, id)));
  return true;
}

export type Recipient = { email: string; name: string; why: "routed" | "backup" | "critical" | "default" };

/**
 * Who is emailed for a handover. The routed person, or their backup (and theirs, down the chain) while they are switched
 * off; every switched-on person in the Critical group when it is Critical; the profile's single manager when nobody on
 * the path can be told. Each address appears once.
 */
export function resolveRecipients(input: {
  managers: Pick<WorkerManager, "id" | "name" | "email" | "backupId" | "notifyOnCritical" | "enabled">[];
  routedId: string | null;
  critical: boolean;
  fallback: { name: string; email: string | null };
}): { recipients: Recipient[]; assignee: { id: string; name: string } | null } {
  const { managers, routedId, critical, fallback } = input;
  const byId = new Map(managers.map((manager) => [manager.id, manager]));
  const recipients: Recipient[] = [];
  const add = (recipient: Recipient) => {
    if (!recipients.some((existing) => existing.email.toLowerCase() === recipient.email.toLowerCase())) recipients.push(recipient);
  };

  let assignee: { id: string; name: string } | null = null;
  let cursor = routedId ? byId.get(routedId) : undefined;
  const seen = new Set<string>();
  let hops = 0;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.enabled) {
      add({ email: cursor.email, name: cursor.name, why: hops === 0 ? "routed" : "backup" });
      assignee = { id: cursor.id, name: cursor.name };
      break;
    }
    cursor = cursor.backupId ? byId.get(cursor.backupId) : undefined;
    hops += 1;
  }
  if (critical) {
    for (const manager of managers) if (manager.enabled && manager.notifyOnCritical) add({ email: manager.email, name: manager.name, why: "critical" });
  }
  if (recipients.length === 0 && fallback.email) add({ email: fallback.email, name: fallback.name, why: "default" });
  return { recipients, assignee };
}

const CHOICE_WAIT_MS = 3000;
const TRANSCRIPT_TURNS = 8;
const TURN_CHARS = 500;

const ChoiceSchema = z.object({ managerId: z.string().nullable(), critical: z.boolean() });
export type ManagerChoice = { managerId: string | null; critical: boolean };

/** Keeps the choice only if the id is someone switched on in the list. */
export function validateManagerChoice(raw: z.infer<typeof ChoiceSchema>, managers: Pick<WorkerManager, "id" | "enabled">[]): ManagerChoice {
  const wanted = raw.managerId?.trim();
  const found = wanted ? managers.find((manager) => manager.id === wanted) : undefined;
  return { managerId: found ? found.id : null, critical: raw.critical };
}

/**
 * Who a handover should go to and whether it is Critical, chosen from the list by the person's areas. Gives up after a
 * few seconds and never throws: the handover then goes to the profile's manager.
 */
export async function chooseManager(args: {
  managers: Pick<WorkerManager, "id" | "name" | "areas" | "enabled" | "notifyOnCritical">[];
  transcript: HistoryTurn[];
  summary?: string | null;
}): Promise<ManagerChoice | null> {
  const { managers, transcript, summary } = args;
  if (managers.length === 0 || modelUnavailabilityReason()) return null;
  const list = managers.map((manager) => `- id ${manager.id}: ${manager.name}. Covers: ${manager.areas.trim() || "(anything not covered by someone else)"}${manager.enabled ? "" : " (away: choose them anyway, the system uses their backup)"}`).join("\n");
  const chooser = new Agent({
    name: "Manager router",
    instructions:
      "A customer support worker is handing a conversation to a person. Choose who from the list below by what each person covers, " +
      "copying the id exactly, or null if nobody clearly covers it. Never invent an id.\n\n" +
      `People:\n${list}\n\n` +
      "Also say whether it is Critical: the customer cannot work at all (nobody, or a whole office, can use the system, or it is down), " +
      "or someone may be at risk. A single user's ordinary problem, a question or a request is not Critical.",
    model: guardrailModel(),
    outputType: ChoiceSchema,
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });
  const text = transcript
    .slice(-TRANSCRIPT_TURNS)
    .map((turn) => `${turn.speaker}: ${turn.body.trim().slice(0, TURN_CHARS)}`)
    .join("\n");
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CHOICE_WAIT_MS));
  try {
    const result = await Promise.race([run(chooser, `${summary ? `Summary: ${summary}\n\n` : ""}Conversation:\n${text}`, { maxTurns: 1 }), timeout]);
    if (!result) return null;
    const parsed = ChoiceSchema.safeParse(result.finalOutput);
    return parsed.success ? validateManagerChoice(parsed.data, managers) : null;
  } catch {
    return null;
  }
}

export type HandoverRoute = {
  recipients: Recipient[];
  assignee: { id: string; name: string } | null;
  critical: boolean;
  /** For the internal ticket note: who was chosen by area and who is their backup, by name. */
  chosen: { name: string; areas: string; backupName: string | null; away: boolean } | null;
};

/**
 * Where a first handover goes: the person chosen from the list (or their backup), the Critical group on Critical, and
 * the profile's single manager when the list cannot say. Never throws; always returns who to tell.
 */
export async function routeHandover(args: {
  organizationId: string;
  fallback: { name: string; email: string | null };
  transcript: HistoryTurn[];
  summary?: string | null;
}): Promise<HandoverRoute> {
  const managers = await listManagers(args.organizationId).catch(() => [] as WorkerManager[]);
  const choice = await chooseManager({ managers, transcript: args.transcript, summary: args.summary }).catch(() => null);
  const critical = choice?.critical ?? false;
  const resolved = resolveRecipients({ managers, routedId: choice?.managerId ?? null, critical, fallback: args.fallback });
  const picked = choice?.managerId ? managers.find((manager) => manager.id === choice.managerId) : undefined;
  const backup = picked?.backupId ? managers.find((manager) => manager.id === picked.backupId) : undefined;
  return {
    ...resolved,
    critical,
    chosen: picked ? { name: picked.name, areas: picked.areas, backupName: backup?.name ?? null, away: !picked.enabled } : null,
  };
}

/** The internal ticket note: who the worker would route this to, never shown to the customer. */
export function suggestedAssigneeNote(route: HandoverRoute): string | null {
  if (!route.chosen && !route.critical) return null;
  const lines: string[] = [];
  if (route.chosen) {
    lines.push(`Suggested assignee: ${route.chosen.name}${route.chosen.areas ? ` (covers: ${route.chosen.areas})` : ""}.`);
    if (route.chosen.away && route.assignee && route.assignee.name !== route.chosen.name) lines.push(`${route.chosen.name} is switched off, so ${route.assignee.name} was told instead.`);
    else if (route.chosen.backupName) lines.push(`Backup: ${route.chosen.backupName}.`);
  }
  if (route.critical) lines.push("Marked Critical: the customer cannot work. The Critical group was emailed.");
  return lines.join("\n");
}
