import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureOrganization } from "@/lib/bootstrap";
import { clearRefreshMemory, syncKnowledgeIndex } from "@/lib/knowledge-index";
import { clearKnowledgeSearchCache, searchKnowledgeIndex } from "@/lib/knowledge-search";
import { QUESTIONS_PER_PAGE, cleanQuestions, syncPageQuestions } from "@/lib/knowledge-page-questions";
import type { IndexPage, IndexSource } from "@/lib/tools-integrations/atlassian";

// Customer-style questions written for each knowledge page, matched against so a customer's own words find the page.
// Found in the 25 Nov persona test: "add the EAP field to my open files list" never reached the page that says
// "Column Chooser", and most answers that fell short never had the right page in front of the worker.

vi.mock("@/lib/query-rewrite", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/query-rewrite")>()), rewriteForSearch: vi.fn(async () => null) }));

type P = { id: string; title: string; text: string; version?: number };
const source = (pages: P[]): IndexSource => ({
  source: "confluence",
  listMetadata: async () => pages.map((p) => ({ id: p.id, title: p.title, version: p.version ?? 1, link: null })),
  fetchPages: async (ids): Promise<IndexPage[]> => pages.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, title: p.title, text: p.text, link: null })),
});
/** No meaning signal, so only words decide: what is tested is the page-question match itself. */
const silentEmbed = () => vi.fn(async (texts: string[]) => texts.map(() => [0, 0, 0, 0]));
// As in the real pages, "EAP", "add", "field", "open", "files" and "list" are everywhere, so they pick out nothing.
const filler = (n: number): P[] =>
  Array.from({ length: n }, (_, i) => ({ id: `fill${i}`, title: `Adding a Client File Topic ${i}`, text: `EAP Expert notes on topic ${i}: add a field to the form, then open the list of files for this module.` }));

const PAGES: P[] = [
  { id: "grid", title: "PROVIDERfiles - Adding a column to a grid", text: "Right-click any column heading and choose Column Chooser. Scroll to the EAP column and drag it between two columns of the grid." },
  { id: "layout", title: "Customize Layout", text: "Right-click a form and choose Customize Layout to move fields on the form." },
  ...filler(30),
];

let orgId: string;
beforeEach(async () => {
  orgId = `org-pq-${crypto.randomUUID()}`;
  clearKnowledgeSearchCache();
  clearRefreshMemory();
  await ensureOrganization(orgId);
});

async function index(pages: P[]) {
  await syncKnowledgeIndex(orgId, { source: source(pages), embed: silentEmbed() });
  clearKnowledgeSearchCache();
}
const search = async (query: string) =>
  (await searchKnowledgeIndex(orgId, query, { embed: silentEmbed(), rewrite: false, topics: false })).matches.map((m) => m.title);
const countFor = async (pageId: string) =>
  (await db.execute<{ n: number }>(sql`select count(*)::int n from knowledge_page_questions where organization_id = ${orgId} and page_id = ${pageId}`)).rows[0].n;

describe("cleaning what the model writes", () => {
  it("keeps one message per line, without numbering, quotes, blanks or repeats", () => {
    expect(cleanQuestions('1. how do i add a column\n- "Where is the EAP field?"\n\n* how do i add a column\nok')).toEqual(["how do i add a column", "Where is the EAP field?"]);
  });

  it("keeps at most the set number", () => {
    expect(cleanQuestions(Array.from({ length: 20 }, (_, i) => `question number ${i}`).join("\n"))).toHaveLength(QUESTIONS_PER_PAGE);
  });
});

describe("writing questions for the saved pages", () => {
  it("writes them once per page, again only when a page changes, and drops them when a page is gone", async () => {
    await index(PAGES.slice(0, 2));
    const write = vi.fn(async (title: string) => [`how do i ${title.toLowerCase()}`, "where is that setting"]);
    const first = await syncPageQuestions(orgId, { write, embed: silentEmbed() });
    expect(first).toMatchObject({ pages: 2, written: 4, failed: 0 });

    const again = await syncPageQuestions(orgId, { write, embed: silentEmbed() });
    expect(again).toMatchObject({ pages: 0, written: 0 });

    // The grid page's text changes and the layout page is removed.
    await index([{ ...PAGES[0], version: 2, text: `${PAGES[0].text} Save the grid when you are done.` }]);
    const after = await syncPageQuestions(orgId, { write, embed: silentEmbed() });
    expect(after).toMatchObject({ pages: 1, removed: 4 });
    expect(await countFor("grid")).toBe(2);
    expect(await countFor("layout")).toBe(0);
  });

  it("carries on past a page whose questions could not be written", async () => {
    await index(PAGES.slice(0, 2));
    const write = vi.fn(async (title: string) => {
      if (title.startsWith("Customize")) throw new Error("model down");
      return ["add the eap field to my open files list"];
    });
    const report = await syncPageQuestions(orgId, { write, embed: silentEmbed() });
    expect(report).toMatchObject({ pages: 1, failed: 1 });
  });
});

describe("finding a page by the customer's own words", () => {
  const question = "How do I add the EAP field to my open files list?";

  it("control: without the page's questions, the customer's words miss it", async () => {
    await index(PAGES);
    expect(await search(question)).not.toContain("PROVIDERfiles - Adding a column to a grid");
  });

  it("with them, the page is found", async () => {
    await index(PAGES);
    await syncPageQuestions(orgId, {
      write: async (title) => (title.startsWith("PROVIDERfiles") ? ["add a field to my open files list", "show the eap column in my list of open files"] : ["move things around on a form"]),
      embed: silentEmbed(),
    });
    clearKnowledgeSearchCache();
    expect(await search(question)).toContain("PROVIDERfiles - Adding a column to a grid");
  });
});
