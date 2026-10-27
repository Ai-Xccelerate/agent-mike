import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { changeLog, customSkills, evalRuns, knowledgeChunks, knowledgeDocuments, workerProfiles } from "@/db/schema";
import { ingestOkf, wrapAsOkf } from "@/lib/knowledge";
import { clearRetrievalCache } from "@/lib/retrieval-cache";
import { deleteCustomSkill, updateCustomSkill } from "@/lib/tools-integrations/custom-skills-repository";
import { applyWorkerPatch, describePatchErrors } from "@/lib/worker-settings";

/**
 * A history of what the Assistant changed (worker profile, knowledge articles, custom skills), so a change can be
 * undone and its effect on the test score read. The Assistant applies every confirmed change through one function;
 * it takes a snapshot before and after, and the differences are stored here.
 */

export type DocState = { title: string; description: string | null; tags: string[]; body: string };
export type SkillState = { name: string; description: string; requires: string[]; body: string };
export type Snapshot = {
  profile: Record<string, unknown>;
  knowledge: Record<string, DocState>;
  skills: Record<string, SkillState>;
};
type Pair<T> = { before: T | null; after: T | null };
export type ChangeDiff = {
  profile: Record<string, { before: unknown; after: unknown }>;
  knowledge: Record<string, Pair<DocState>>;
  skills: Record<string, Pair<SkillState>>;
};

/** Profile columns that are bookkeeping, not something a manager sets. */
const PROFILE_SKIP = new Set(["id", "organizationId", "createdAt", "updatedAt"]);

export async function takeSnapshot(organizationId: string): Promise<Snapshot> {
  const [profileRow] = await db.select().from(workerProfiles).where(eq(workerProfiles.organizationId, organizationId)).limit(1);
  const profile: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profileRow ?? {})) if (!PROFILE_SKIP.has(key)) profile[key] = value;
  const docs = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.organizationId, organizationId));
  const skills = await db.select().from(customSkills).where(eq(customSkills.organizationId, organizationId));
  return {
    profile,
    knowledge: Object.fromEntries(docs.map((d) => [d.conceptId, { title: d.title, description: d.description, tags: d.tags, body: d.body }])),
    skills: Object.fromEntries(skills.map((s) => [s.id, { name: s.name, description: s.description, requires: s.requires, body: s.body }])),
  };
}

/** Text of a value with object keys in a fixed order: Postgres jsonb does not keep the order keys were written in. */
const canonical = (value: unknown): string =>
  JSON.stringify(value ?? null, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y))) : v,
  );
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** What differs between two snapshots; only the things that changed are kept. */
export function diffSnapshots(before: Snapshot, after: Snapshot): ChangeDiff {
  const diff: ChangeDiff = { profile: {}, knowledge: {}, skills: {} };
  for (const key of new Set([...Object.keys(before.profile), ...Object.keys(after.profile)])) {
    if (!same(before.profile[key], after.profile[key])) diff.profile[key] = { before: before.profile[key] ?? null, after: after.profile[key] ?? null };
  }
  for (const key of new Set([...Object.keys(before.knowledge), ...Object.keys(after.knowledge)])) {
    if (!same(before.knowledge[key], after.knowledge[key])) diff.knowledge[key] = { before: before.knowledge[key] ?? null, after: after.knowledge[key] ?? null };
  }
  for (const key of new Set([...Object.keys(before.skills), ...Object.keys(after.skills)])) {
    if (!same(before.skills[key], after.skills[key])) diff.skills[key] = { before: before.skills[key] ?? null, after: after.skills[key] ?? null };
  }
  return diff;
}

export function isEmptyDiff(diff: ChangeDiff): boolean {
  return Object.keys(diff.profile).length + Object.keys(diff.knowledge).length + Object.keys(diff.skills).length === 0;
}

/** One line on what a diff touched, for the history list. */
export function describeDiff(diff: ChangeDiff): string {
  const parts: string[] = [];
  const settings = Object.keys(diff.profile);
  if (settings.length) parts.push(`setting${settings.length > 1 ? "s" : ""}: ${settings.join(", ")}`);
  for (const [conceptId, pair] of Object.entries(diff.knowledge)) {
    const title = pair.after?.title ?? pair.before?.title ?? conceptId;
    parts.push(`${pair.before ? (pair.after ? "article edited" : "article removed") : "article added"}: ${title}`);
  }
  for (const pair of Object.values(diff.skills)) {
    const name = pair.after?.name ?? pair.before?.name ?? "skill";
    parts.push(`${pair.before ? (pair.after ? "skill edited" : "skill removed") : "skill added"}: ${name}`);
  }
  return parts.join("; ");
}

export async function recordChange(input: { organizationId: string; toolId: string; appliedBy: string; before: Snapshot; after: Snapshot }) {
  const diff = diffSnapshots(input.before, input.after);
  if (isEmptyDiff(diff)) return null;
  const [row] = await db
    .insert(changeLog)
    .values({ organizationId: input.organizationId, toolId: input.toolId, summary: describeDiff(diff), appliedBy: input.appliedBy, diff })
    .returning();
  return row;
}

export type ChangeEntry = typeof changeLog.$inferSelect & {
  /** The test score just before this change, and the score of the replay run for it. Null when there was no run. */
  scoreBefore: number | null;
  scoreAfter: number | null;
  runStatus: string | null;
};

export async function listChanges(organizationId: string, limit = 20): Promise<ChangeEntry[]> {
  const rows = await db.select().from(changeLog).where(eq(changeLog.organizationId, organizationId)).orderBy(desc(changeLog.createdAt)).limit(limit);
  if (rows.length === 0) return [];
  const runs = await db.select().from(evalRuns).where(eq(evalRuns.organizationId, organizationId)).orderBy(desc(evalRuns.startedAt)).limit(100);
  return rows.map((row) => {
    const own = runs.find((run) => run.changeId === row.id);
    const previous = runs.find((run) => run.status === "done" && run.startedAt < row.createdAt && run.changeId !== row.id);
    return {
      ...row,
      scoreBefore: previous?.score ?? null,
      scoreAfter: own?.status === "done" ? own.score : null,
      runStatus: own?.status ?? null,
    };
  });
}

export type RevertResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Puts back what a change replaced. It refuses when something it touched has changed again since, because undoing
 * would also throw that later edit away; the manager can undo the later change first.
 */
export async function revertChange(organizationId: string, id: string, revertedBy: string): Promise<RevertResult> {
  const [row] = await db.select().from(changeLog).where(and(eq(changeLog.id, id), eq(changeLog.organizationId, organizationId))).limit(1);
  if (!row) return { ok: false, status: 404, error: "That change was not found." };
  if (row.revertedAt) return { ok: false, status: 409, error: "That change was already undone." };
  const diff = row.diff as ChangeDiff;
  const current = await takeSnapshot(organizationId);

  for (const [key, change] of Object.entries(diff.profile)) {
    if (!same(current.profile[key], change.after)) return { ok: false, status: 409, error: `The setting "${key}" has changed since, so this can't be undone safely.` };
  }
  for (const [key, pair] of Object.entries(diff.knowledge)) {
    if (!same(current.knowledge[key], pair.after)) return { ok: false, status: 409, error: `The article "${pair.after?.title ?? pair.before?.title ?? key}" has changed since, so this can't be undone safely.` };
  }
  for (const [key, pair] of Object.entries(diff.skills)) {
    if (!same(current.skills[key], pair.after)) return { ok: false, status: 409, error: `The skill "${pair.after?.name ?? pair.before?.name ?? key}" has changed since, so this can't be undone safely.` };
  }
  // A removed skill would come back under a new id and anything enabled with the old id would not point at it.
  for (const [key, pair] of Object.entries(diff.skills)) {
    if (pair.before && !pair.after) return { ok: false, status: 422, error: `The skill "${pair.before.name}" was removed and can't be brought back automatically (${key}).` };
  }

  if (Object.keys(diff.profile).length > 0) {
    const patch = Object.fromEntries(Object.entries(diff.profile).map(([key, change]) => [key, change.before]));
    const result = await applyWorkerPatch(organizationId, patch);
    if (!result.ok) return { ok: false, status: 422, error: describePatchErrors(result) };
  }
  for (const [conceptId, pair] of Object.entries(diff.knowledge)) {
    if (!pair.before) {
      const [doc] = await db.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.organizationId, organizationId), eq(knowledgeDocuments.conceptId, conceptId))).limit(1);
      if (doc) {
        await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc.id));
        await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, doc.id));
      }
      clearRetrievalCache(organizationId);
    } else {
      await ingestOkf(organizationId, conceptId, wrapAsOkf(conceptId, pair.before.title, pair.before.body, { description: pair.before.description, tags: pair.before.tags }));
    }
  }
  for (const [skillId, pair] of Object.entries(diff.skills)) {
    if (!pair.before) await deleteCustomSkill(organizationId, skillId);
    else await updateCustomSkill(organizationId, skillId, { description: pair.before.description, requires: pair.before.requires, body: pair.before.body });
  }
  await db.update(changeLog).set({ revertedAt: new Date(), revertedBy }).where(eq(changeLog.id, id));
  return { ok: true };
}
