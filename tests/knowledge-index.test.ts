import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeIndexPages, knowledgeIndexState, knowledgeSections } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { INDEX_SOURCE, knowledgeIndexStatus, syncKnowledgeIndex } from "@/lib/knowledge-index";
import type { IndexPage, IndexPageMeta, IndexSource } from "@/lib/tools-integrations/atlassian";

type FakePage = { id: string; title: string; version: number; text: string };

function fakeConfluence(pages: FakePage[]) {
  const state = { pages, listFails: false, fetched: [] as string[][] };
  const source: IndexSource = {
    source: "confluence",
    listMetadata: async (): Promise<IndexPageMeta[]> => {
      if (state.listFails) throw new Error("Confluence page listing failed");
      return state.pages.map((p) => ({ id: p.id, title: p.title, version: p.version, link: `/spaces/SK/pages/${p.id}/x` }));
    },
    fetchPages: async (ids): Promise<IndexPage[]> => {
      state.fetched.push(ids);
      return state.pages.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, title: p.title, text: p.text, link: `/spaces/SK/pages/${p.id}/x` }));
    },
  };
  return { state, source };
}

const embed = vi.fn(async (texts: string[]) => texts.map((_, i) => [i + 1, 0.5, 0.25]));

let orgId: string;
const page = (id: string, title: string, version: number, text: string): FakePage => ({ id, title, version, text });
const LONG = "A paragraph of real text that is long enough to be its own section of the page, and then some more words so that it clears the minimum size for a section of its own. ";

beforeEach(async () => {
  orgId = `org-index-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  embed.mockClear();
});

const sectionsOf = (id: string, org = orgId) =>
  db.select().from(knowledgeSections).where(and(eq(knowledgeSections.organizationId, org), eq(knowledgeSections.pageId, id)));

describe("syncing the knowledge index", () => {
  it("indexes every page on the first sync, one embedding call for all sections", async () => {
    const fake = fakeConfluence([
      page("1", "Register", 3, `## Steps\n${LONG}\n\n## Help\n${LONG}`),
      page("2", "Audit Trail", 1, `## Who changed it\n${LONG}`),
    ]);
    const report = await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    expect(report).toMatchObject({ pages: 2, added: 2, changed: 0, removed: 0, unchanged: 0, embedded: 3 });
    expect(embed).toHaveBeenCalledTimes(1);
    expect((await sectionsOf("1")).map((s) => s.heading)).toEqual(["Steps", "Help"]);
    expect((await sectionsOf("2"))[0]).toMatchObject({ title: "Audit Trail", heading: "Who changed it" });
    expect((await sectionsOf("2"))[0].embedding).toHaveLength(3);
    const status = await knowledgeIndexStatus(orgId);
    expect(status).toMatchObject({ pages: 2, sections: 3, withMeaning: 3, running: false, lastError: null });
    expect(status.lastFinishedAt).not.toBeNull();
  });

  it("reads and embeds nothing when no page changed", async () => {
    const fake = fakeConfluence([page("1", "Register", 3, `## Steps\n${LONG}`)]);
    await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    embed.mockClear();
    fake.state.fetched.length = 0;
    const report = await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    expect(report).toMatchObject({ pages: 1, added: 0, changed: 0, unchanged: 1, embedded: 0 });
    expect(fake.state.fetched).toEqual([[]]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("re-reads and re-embeds only the page whose version moved, replacing its sections", async () => {
    const fake = fakeConfluence([page("1", "Register", 3, `## Steps\n${LONG}`), page("2", "Audit Trail", 1, `## Log\n${LONG}`)]);
    await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    embed.mockClear();
    fake.state.fetched.length = 0;
    fake.state.pages[0] = page("1", "Register", 4, `## Steps\nNew steps. ${LONG}\n\n## More\n${LONG}`);
    const report = await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    expect(report).toMatchObject({ pages: 2, added: 0, changed: 1, unchanged: 1, embedded: 2 });
    expect(fake.state.fetched).toEqual([["1"]]);
    const sections = await sectionsOf("1");
    expect(sections.map((s) => s.heading)).toEqual(["Steps", "More"]);
    expect(sections[0].content).toContain("New steps.");
    expect((await sectionsOf("2"))).toHaveLength(1);
    const [row] = await db.select().from(knowledgeIndexPages).where(and(eq(knowledgeIndexPages.organizationId, orgId), eq(knowledgeIndexPages.pageId, "1")));
    expect(row.version).toBe(4);
  });

  it("remembers a new version without re-embedding when the text is the same", async () => {
    const fake = fakeConfluence([page("1", "Register", 3, `## Steps\n${LONG}`)]);
    await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    embed.mockClear();
    fake.state.pages[0] = page("1", "Register", 5, `## Steps\n${LONG}`);
    const report = await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    expect(report).toMatchObject({ changed: 0, unchanged: 1, embedded: 0 });
    expect(embed).not.toHaveBeenCalled();
    const [row] = await db.select().from(knowledgeIndexPages).where(and(eq(knowledgeIndexPages.organizationId, orgId), eq(knowledgeIndexPages.pageId, "1")));
    expect(row.version).toBe(5);
    // And the next sync does not read it again.
    fake.state.fetched.length = 0;
    await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    expect(fake.state.fetched).toEqual([[]]);
  });

  it("removes a page that is gone from Confluence, with its sections", async () => {
    const fake = fakeConfluence([page("1", "Register", 3, `## Steps\n${LONG}`), page("2", "Audit Trail", 1, `## Log\n${LONG}`)]);
    await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    fake.state.pages = fake.state.pages.filter((p) => p.id !== "2");
    const report = await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    expect(report).toMatchObject({ pages: 1, removed: 1 });
    expect(await sectionsOf("2")).toHaveLength(0);
    expect((await knowledgeIndexStatus(orgId)).pages).toBe(1);
  });

  it("keeps the index when Confluence suddenly lists no pages", async () => {
    const fake = fakeConfluence([page("1", "Register", 3, `## Steps\n${LONG}`)]);
    await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    fake.state.pages = [];
    const report = await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    expect(report.error).toContain("no pages");
    expect(await sectionsOf("1")).toHaveLength(1);
    expect((await knowledgeIndexStatus(orgId)).lastError).toContain("no pages");
  });

  it("writes nothing and records the error when embedding fails, then recovers on the next sync", async () => {
    const fake = fakeConfluence([page("1", "Register", 3, `## Steps\n${LONG}`)]);
    const failing = vi.fn(async () => {
      throw new Error("embeddings request failed with 500");
    });
    const report = await syncKnowledgeIndex(orgId, { source: fake.source, embed: failing });
    expect(report.error).toContain("500");
    expect(await sectionsOf("1")).toHaveLength(0);
    const status = await knowledgeIndexStatus(orgId);
    expect(status.lastError).toContain("500");
    expect(status.running).toBe(false);
    const again = await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    expect(again).toMatchObject({ added: 1, embedded: 1 });
    expect((await knowledgeIndexStatus(orgId)).lastError).toBeNull();
  });

  it("records a failed listing and frees the lease", async () => {
    const fake = fakeConfluence([page("1", "Register", 3, `## Steps\n${LONG}`)]);
    fake.state.listFails = true;
    const report = await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    expect(report.error).toContain("listing failed");
    expect((await knowledgeIndexStatus(orgId)).running).toBe(false);
  });

  it("does not start while another sync holds the lease, and takes over a dead one", async () => {
    const fake = fakeConfluence([page("1", "Register", 3, `## Steps\n${LONG}`)]);
    await db.insert(knowledgeIndexState).values({ organizationId: orgId, source: INDEX_SOURCE, runningUntil: new Date(Date.now() + 5 * 60_000) });
    expect(await syncKnowledgeIndex(orgId, { source: fake.source, embed })).toMatchObject({ skipped: "another sync is already running" });
    expect(embed).not.toHaveBeenCalled();
    await db.update(knowledgeIndexState).set({ runningUntil: new Date(Date.now() - 1000) }).where(eq(knowledgeIndexState.organizationId, orgId));
    expect(await syncKnowledgeIndex(orgId, { source: fake.source, embed })).toMatchObject({ added: 1 });
  });

  it("does nothing when Confluence is not connected", async () => {
    expect(await syncKnowledgeIndex(orgId, { source: null, embed })).toMatchObject({ skipped: "Confluence is not connected" });
  });

  it("keeps each organization's pages apart, even with the same page ids", async () => {
    const other = `org-index-other-${crypto.randomUUID()}`;
    await ensureOrganization(other);
    await syncKnowledgeIndex(orgId, { source: fakeConfluence([page("1", "Ours", 1, `## A\n${LONG}`)]).source, embed });
    await syncKnowledgeIndex(other, { source: fakeConfluence([page("1", "Theirs", 1, `## B\n${LONG}`)]).source, embed });
    expect((await sectionsOf("1", orgId))[0].title).toBe("Ours");
    expect((await sectionsOf("1", other))[0].title).toBe("Theirs");
    await syncKnowledgeIndex(other, { source: fakeConfluence([page("2", "Theirs 2", 1, `## C\n${LONG}`)]).source, embed });
    expect(await sectionsOf("1", orgId)).toHaveLength(1);
    expect(await sectionsOf("1", other)).toHaveLength(0);
  });

  it("builds the keyword index from title, heading and text", async () => {
    const fake = fakeConfluence([page("1", "Audit Trail", 1, `## Who changed it\nOpen the client file and choose File Utilities. ${LONG}`)]);
    await syncKnowledgeIndex(orgId, { source: fake.source, embed });
    const hit = async (q: string) =>
      (await db.execute(sql`select 1 from knowledge_sections where organization_id = ${orgId} and search @@ websearch_to_tsquery('english', ${q})`)).rows.length;
    expect(await hit("audit")).toBe(1);
    expect(await hit("changing")).toBe(1);
    expect(await hit("utilities")).toBe(1);
    expect(await hit("kubernetes")).toBe(0);
  });
});
