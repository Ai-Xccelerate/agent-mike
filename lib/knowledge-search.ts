import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeIndexState } from "@/db/schema";
import { cosine, embedTexts, type Embedder } from "@/lib/embeddings";
import { INDEX_SOURCE } from "@/lib/knowledge-index";
import { expandKeywords, focusOnQuestion, searchKeywords, stemWeights, wordStem } from "@/lib/tools-integrations/atlassian";
import type { KnowledgeMatch } from "@/lib/knowledge";
import { rewriteForSearch } from "@/lib/query-rewrite";
import { traceSet } from "@/lib/timing";

/**
 * Finds the sections of the saved copy of an organization's knowledge that answer a question.
 *
 * Two searches run at once and their results are merged: a keyword search (the page title weighs most, then the
 * heading, then the text) and a meaning search (the question's numbers against each section's numbers, so "who changed
 * a record" finds "audit trail"). A section that both like comes first. The best few sections are returned, grouped by
 * page and in page order so steps stay in sequence.
 */

/**
 * A section the meaning search likes less than this is not a match, however it ranks: that search always has a closest
 * section, even when nothing is relevant, and an unrelated section handed to the worker looks like reference material.
 * Tuned on real questions against EAP's pages (see the scores the admin check reports).
 */
export const MIN_MEANING_SCORE = Number(process.env.KNOWLEDGE_MIN_MEANING_SCORE) > 0 ? Number(process.env.KNOWLEDGE_MIN_MEANING_SCORE) : 0.3;
const QUERY_VECTOR_CACHE = 2000;
/** A word weighs this much or more (see stemWeights: about 1 for a rare word, 0.25 for one in most pages) to count as distinctive. */
const DISTINCTIVE_WORD_WEIGHT = 0.3;

/** Every setting of the search, so the admin experiment runner can try them and the defaults can be chosen from scores. */
export type SearchTuning = {
  /** How many sections come back. */
  limit: number;
  /** At most this many sections from one page. */
  perPage: number;
  /** Sections the meaning search likes less than this are dropped. */
  minMeaning: number;
  /** How much each search counts in the merge (the page-title one can be switched off with 0). */
  weights: { keyword: number; meaning: number; title: number };
  /** The page-title signal: how many pages it puts forward, and how many sections of each. */
  titlePages: number;
  titleSections: number;
  /** How far down each search's list counts. */
  pool: number;
  /** The merge's smoothing constant: lower makes the top places count for more. */
  rrfK: number;
  /** ts_rank_cd normalization flag: 0 none, 1 or 2 favour shorter sections, 32 squashes the score. */
  keywordNorm: 0 | 1 | 2 | 32;
};

/**
 * Chosen from scores on EAP's 495 pages and 30 real questions (24 Oct, 32 settings tried; see the experiment runner).
 * Against the first version: real pages not found 10 -> 0, right page first 405 -> 470 of 495, in the top three 459 -> 492.
 * The page-title signal counts triple, keyword scores favour shorter sections, the merge is sharper, eight sections come back.
 */
export const DEFAULT_TUNING: SearchTuning = {
  limit: 8,
  perPage: 3,
  minMeaning: MIN_MEANING_SCORE,
  weights: { keyword: 1, meaning: 1, title: 3 },
  titlePages: 8,
  titleSections: 2,
  pool: 40,
  rrfK: 20,
  keywordNorm: 1,
};

type Loaded = {
  finishedAt: number;
  /** One entry per page (stable objects, so word counts can be cached), with that page's sections in order. */
  pages: { pageId: string; title: string; sectionIds: string[] }[];
  sections: { id: string; pageId: string; position: number; title: string; heading: string | null; content: string; vector: Float32Array | null }[];
};

const loaded = new Map<string, Loaded>();
const queryVectors = new Map<string, number[]>();
const normalizeQuestion = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Test hook: forget what was loaded for every organization. */
export function clearKnowledgeSearchCache(): void {
  loaded.clear();
  queryVectors.clear();
}

async function finishedAtOf(organizationId: string): Promise<number> {
  const [state] = await db
    .select({ finished: knowledgeIndexState.lastFinishedAt })
    .from(knowledgeIndexState)
    .where(and(eq(knowledgeIndexState.organizationId, organizationId), eq(knowledgeIndexState.source, INDEX_SOURCE)))
    .limit(1);
  return state?.finished?.getTime() ?? 0;
}

/** The organization's sections, held in memory and reloaded only when a sync has finished since. */
async function sectionsFor(organizationId: string): Promise<Loaded> {
  const finishedAt = await finishedAtOf(organizationId);
  const have = loaded.get(organizationId);
  if (have && have.finishedAt === finishedAt) return have;
  const rows = await db.execute<{ id: string; page_id: string; position: number; title: string; heading: string | null; content: string; embedding: number[] | null }>(
    sql`select id, page_id, position, title, heading, content, embedding from knowledge_sections where organization_id = ${organizationId} and source = ${INDEX_SOURCE}`,
  );
  const fresh: Loaded = {
    finishedAt,
    pages: [],
    sections: rows.rows.map((row) => ({
      id: row.id,
      pageId: row.page_id,
      position: row.position,
      title: row.title,
      heading: row.heading,
      content: row.content,
      vector: row.embedding ? Float32Array.from(row.embedding.map(Number)) : null,
    })),
  };
  const byPage = new Map<string, { pageId: string; title: string; sectionIds: string[] }>();
  for (const section of [...fresh.sections].sort((a, b) => a.position - b.position)) {
    const page = byPage.get(section.pageId) ?? { pageId: section.pageId, title: section.title, sectionIds: [] };
    page.sectionIds.push(section.id);
    byPage.set(section.pageId, page);
  }
  fresh.pages = [...byPage.values()];
  loaded.set(organizationId, fresh);
  return fresh;
}

async function queryVector(text: string, embed: Embedder): Promise<number[]> {
  const key = normalizeQuestion(text);
  const known = queryVectors.get(key);
  if (known) return known;
  const [vector] = await embed([text]);
  queryVectors.set(key, vector);
  if (queryVectors.size > QUERY_VECTOR_CACHE) queryVectors.delete(queryVectors.keys().next().value as string);
  return vector;
}

/** Works out many questions' numbers in a few requests, so a batch of searches does not wait on one request each. */
export async function primeQueryVectors(questions: string[], embed: Embedder = embedTexts): Promise<void> {
  const texts = [...new Set(questions.map((question) => focusOnQuestion(question)))].filter((text) => !queryVectors.has(normalizeQuestion(text)));
  if (texts.length === 0) return;
  const vectors = await embed(texts);
  texts.forEach((text, index) => queryVectors.set(normalizeQuestion(text), vectors[index]));
}

/** The pages held for an organization, with their size, for the experiment runner. */
export async function indexedPages(organizationId: string): Promise<{ pageId: string; title: string; chars: number }[]> {
  const all = await sectionsFor(organizationId);
  const sizes = new Map<string, number>();
  for (const section of all.sections) sizes.set(section.pageId, (sizes.get(section.pageId) ?? 0) + section.content.length);
  return all.pages.map((page) => ({ pageId: page.pageId, title: page.title, chars: sizes.get(page.pageId) ?? 0 }));
}

/**
 * Pages whose title carries the question's words, best first. A word in few titles counts more than one in many
 * ("Parallels" over "EAP"), and of two pages with the same hits the one with the shorter, more specific title comes first.
 * This is what finds a page named for the question when other pages talk about the same words at greater length.
 */
function pagesByTitle(all: Loaded, words: string[], count: number): Loaded["pages"] {
  if (words.length === 0) return [];
  const weights = stemWeights(all.pages, words);
  const stems = [...new Set(words.map(wordStem))];
  return all.pages
    .map((page) => {
      const lower = page.title.toLowerCase();
      const score = stems.reduce((sum, stem) => (lower.includes(stem) ? sum + Math.max(weights[stem] ?? 1, 0.35) : sum), 0);
      return { page, score, length: lower.split(/\s+/).length };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.length - b.length)
    .slice(0, count)
    .map((entry) => entry.page);
}

export type IndexSearchTimings = { keywordMs: number; meaningMs: number; totalMs: number; meaning: "used" | "failed" | "none" };
/** Why a section was returned, for tuning: its meaning score, its place in the keyword list, and the merged score. */
export type IndexMatchDetail = { title: string; heading: string | null; meaning: number | null; keywordPlace: number | null; fused: number };

export async function searchKnowledgeIndex(
  organizationId: string,
  question: string,
  options: {
    limit?: number;
    embed?: Embedder;
    tuning?: Partial<SearchTuning>;
    /** Makes a clean English query from the message; false turns it off (the experiment runner). Defaults to the model-backed one. */
    rewrite?: false | ((question: string) => Promise<string | null>);
  } = {},
): Promise<{ matches: KnowledgeMatch[]; timings: IndexSearchTimings; details: IndexMatchDetail[] }> {
  const started = Date.now();
  const tuning: SearchTuning = {
    ...DEFAULT_TUNING,
    ...options.tuning,
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    weights: { ...DEFAULT_TUNING.weights, ...options.tuning?.weights },
  };
  const limit = tuning.limit;
  const embed = options.embed ?? embedTexts;
  const buildQuery = (text: string) => {
    const focus = focusOnQuestion(text);
    return { focus, words: expandKeywords(focus, searchKeywords(focus, 12)) };
  };
  const primary = buildQuery(question);
  // A clean English version of a long or non-English message is searched too, and the two result lists are merged.
  const rewritten = options.rewrite === false ? null : await (options.rewrite ?? rewriteForSearch)(question).catch(() => null);
  const queries = [primary];
  if (rewritten && normalizeQuestion(rewritten) !== normalizeQuestion(primary.focus)) {
    queries.push(buildQuery(rewritten));
    traceSet("searchRewrite", rewritten);
  }
  const timings: IndexSearchTimings = { keywordMs: 0, meaningMs: 0, totalMs: 0, meaning: "none" };

  const keywordSearch = async (words: string[]): Promise<string[]> => {
    if (words.length === 0) return [];
    const t0 = Date.now();
    const rows = await db.execute<{ id: string }>(sql`
      select id from knowledge_sections, websearch_to_tsquery('english', ${words.join(" or ")}) q
      where organization_id = ${organizationId} and source = ${INDEX_SOURCE} and search @@ q
      order by ts_rank_cd(search, q, ${tuning.keywordNorm}) desc limit ${tuning.pool}`);
    timings.keywordMs = Math.max(timings.keywordMs, Date.now() - t0);
    return rows.rows.map((row) => row.id);
  };

  const meaningScores = new Map<string, number>();
  const meaningSearch = async (all: Loaded, focus: string): Promise<string[]> => {
    const t0 = Date.now();
    try {
      const vector = await queryVector(focus, embed);
      const scored = all.sections
        .filter((section) => section.vector)
        .map((section) => ({ id: section.id, score: cosine(vector, section.vector as Float32Array) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, tuning.pool);
      timings.meaning = "used";
      for (const entry of scored) meaningScores.set(entry.id, Math.max(meaningScores.get(entry.id) ?? 0, entry.score));
      return scored.filter((entry) => entry.score >= tuning.minMeaning).map((entry) => entry.id);
    } catch (error) {
      // Without the meaning half the keyword half still answers; say so in the log.
      console.warn("[knowledge-search] meaning search failed, using keywords only:", error instanceof Error ? error.message : error);
      timings.meaning = "failed";
      return [];
    } finally {
      timings.meaningMs = Math.max(timings.meaningMs, Date.now() - t0);
    }
  };

  const all = await sectionsFor(organizationId);
  if (all.sections.length === 0) return { matches: [], timings: { ...timings, totalMs: Date.now() - started }, details: [] };
  const perQuery = await Promise.all(
    queries.map(async (query) => {
      const [keyword, meaning] = await Promise.all([keywordSearch(query.words), meaningSearch(all, query.focus)]);
      // The words that name this product or are in nearly every page ("EAP", "Expert") can outweigh the one that says
      // what the question is about ("Parallels"). A second keyword pass on the distinctive words alone is merged in too.
      const weights = stemWeights(all.pages, query.words);
      const distinctive = query.words.filter((word) => (weights[wordStem(word)] ?? 1) >= DISTINCTIVE_WORD_WEIGHT);
      const distinctiveKeyword = distinctive.length > 0 && distinctive.length < query.words.length ? await keywordSearch(distinctive) : [];
      // The page-title signal: the first sections of the pages named for the question.
      const title = tuning.weights.title > 0 ? pagesByTitle(all, query.words, tuning.titlePages).flatMap((page) => page.sectionIds.slice(0, tuning.titleSections)) : [];
      return { keyword, distinctiveKeyword, meaning, title };
    }),
  );
  const byKeyword = perQuery[0].keyword;

  // Reciprocal rank fusion: a section near the top of any list scores, one near the top of several scores most.
  const fused = new Map<string, number>();
  for (const lists of perQuery) {
    for (const [list, weight] of [[lists.keyword, tuning.weights.keyword], [lists.distinctiveKeyword, tuning.weights.keyword], [lists.meaning, tuning.weights.meaning], [lists.title, tuning.weights.title]] as const) {
      list.forEach((id, index) => fused.set(id, (fused.get(id) ?? 0) + weight / (tuning.rrfK + index + 1)));
    }
  }
  const byId = new Map(all.sections.map((section) => [section.id, section]));
  const ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]);

  const perPage = new Map<string, number>();
  const chosen: { section: Loaded["sections"][number]; score: number }[] = [];
  for (const [id, score] of ranked) {
    const section = byId.get(id);
    if (!section) continue;
    if ((perPage.get(section.pageId) ?? 0) >= tuning.perPage) continue;
    perPage.set(section.pageId, (perPage.get(section.pageId) ?? 0) + 1);
    chosen.push({ section, score });
    if (chosen.length >= limit) break;
  }

  // Pages in order of their best section, and a page's sections in page order.
  const pageBest = new Map<string, number>();
  for (const entry of chosen) pageBest.set(entry.section.pageId, Math.max(pageBest.get(entry.section.pageId) ?? 0, entry.score));
  chosen.sort((a, b) => (pageBest.get(b.section.pageId) ?? 0) - (pageBest.get(a.section.pageId) ?? 0) || a.section.pageId.localeCompare(b.section.pageId) || a.section.position - b.section.position);

  const matches: KnowledgeMatch[] = chosen.map((entry, index) => ({
    documentId: `confluence:${entry.section.pageId}`,
    title: entry.section.title,
    heading: entry.section.heading,
    content: entry.section.content,
    rank: 1 / (index + 1),
  }));
  const details: IndexMatchDetail[] = chosen.map((entry) => ({
    title: entry.section.title,
    heading: entry.section.heading,
    meaning: meaningScores.has(entry.section.id) ? Math.round((meaningScores.get(entry.section.id) as number) * 1000) / 1000 : null,
    keywordPlace: byKeyword.indexOf(entry.section.id) === -1 ? null : byKeyword.indexOf(entry.section.id) + 1,
    fused: Math.round(entry.score * 10000) / 10000,
  }));
  return { matches, timings: { ...timings, totalMs: Date.now() - started }, details };
}
