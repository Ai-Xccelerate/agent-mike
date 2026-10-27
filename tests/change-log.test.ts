import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { describeDiff, diffSnapshots, isEmptyDiff, listChanges, recordChange, revertChange, takeSnapshot, type Snapshot } from "@/lib/change-log";
import { editKnowledgeDocument, ingestOkf, wrapAsOkf } from "@/lib/knowledge";

vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), modelUnavailabilityReason: () => null }));

let orgId: string;
beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Change org");
  await getOrCreateProfile(orgId);
});

const empty: Snapshot = { profile: {}, knowledge: {}, skills: {} };

describe("change history", () => {
  it("keeps only what differs and describes it", () => {
    const before: Snapshot = { ...empty, profile: { tone: "Warm", role: "Support" }, knowledge: { a: { title: "A", description: null, tags: [], body: "one" } } };
    const after: Snapshot = { ...empty, profile: { tone: "Direct", role: "Support" }, knowledge: { a: { title: "A", description: null, tags: [], body: "two" }, b: { title: "B", description: null, tags: [], body: "new" } } };
    const diff = diffSnapshots(before, after);
    expect(Object.keys(diff.profile)).toEqual(["tone"]);
    expect(Object.keys(diff.knowledge).sort()).toEqual(["a", "b"]);
    expect(describeDiff(diff)).toContain("article added: B");
    expect(isEmptyDiff(diffSnapshots(before, before))).toBe(true);
  });

  it("undoes an edited article and a changed setting, and refuses once something changed again", async () => {
    await ingestOkf(orgId, "reset", wrapAsOkf("reset", "Reset", "Original steps."));
    const before = await takeSnapshot(orgId);
    const [existing] = await db.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.organizationId, orgId), eq(knowledgeDocuments.conceptId, "reset")));
    await editKnowledgeDocument(orgId, existing, "Reset", "New steps.");
    await db.update(workerProfiles).set({ tone: "Very formal." }).where(eq(workerProfiles.organizationId, orgId));
    const change = await recordChange({ organizationId: orgId, toolId: "t", appliedBy: "m1", before, after: await takeSnapshot(orgId) });
    if (!change) throw new Error("setup");
    expect(change.summary).toContain("article edited: Reset");

    expect(await revertChange(orgId, change.id, "m1")).toEqual({ ok: true });
    const [doc] = await db.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.organizationId, orgId), eq(knowledgeDocuments.conceptId, "reset")));
    expect(doc.body).toContain("Original steps.");
    expect((await getOrCreateProfile(orgId)).tone).toBe(before.profile.tone);
    expect((await listChanges(orgId))[0].revertedAt).not.toBeNull();
    expect(await revertChange(orgId, change.id, "m1")).toMatchObject({ ok: false, status: 409 });
  });

  it("does not undo over a later edit", async () => {
    await ingestOkf(orgId, "reset", wrapAsOkf("reset", "Reset", "Original steps."));
    const before = await takeSnapshot(orgId);
    const edit = async (body: string) => {
      const [existing] = await db.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.organizationId, orgId), eq(knowledgeDocuments.conceptId, "reset")));
      await editKnowledgeDocument(orgId, existing, "Reset", body);
    };
    await edit("Second.");
    const change = await recordChange({ organizationId: orgId, toolId: "t", appliedBy: "m1", before, after: await takeSnapshot(orgId) });
    await edit("Third.");
    const result = await revertChange(orgId, change!.id, "m1");
    expect(result).toMatchObject({ ok: false, status: 409 });
    const [doc] = await db.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.organizationId, orgId), eq(knowledgeDocuments.conceptId, "reset")));
    expect(doc.body).toContain("Third.");
  });

  it("removes an article that the change added", async () => {
    const before = await takeSnapshot(orgId);
    await ingestOkf(orgId, "fresh", wrapAsOkf("fresh", "Fresh", "Brand new."));
    const change = await recordChange({ organizationId: orgId, toolId: "t", appliedBy: "m1", before, after: await takeSnapshot(orgId) });
    expect(await revertChange(orgId, change!.id, "m1")).toEqual({ ok: true });
    expect(await db.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.organizationId, orgId), eq(knowledgeDocuments.conceptId, "fresh")))).toHaveLength(0);
  });

  it("records nothing when nothing changed", async () => {
    const snap = await takeSnapshot(orgId);
    expect(await recordChange({ organizationId: orgId, toolId: "t", appliedBy: "m1", before: snap, after: snap })).toBeNull();
  });
});
