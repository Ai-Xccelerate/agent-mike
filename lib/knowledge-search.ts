import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeIndexState } from "@/db/schema";
import { cosine, embedTexts, type Embedder } from "@/lib/embeddings";
import { INDEX_SOURCE } from "@/lib/knowledge-index";
import { expandKeywords, focusOnQuestion, searchKeywords } from "@/lib/tools-integrations/atlassian";
import type { KnowledgeMatch } from "@/lib/knowledge";

/**
 * Finds the sections of the saved copy of an organization's knowledge that answer a question.
 *
 * Two searches run at once and their results are merged: a keyword search (the page title weighs most, then the
 * heading, then the text) and a meaning search (the question's numbers against each section's numbers, so "who changed
 * a record" finds "audit trail"). A section that both like comes first. The best few sections are returned, grouped by
 * page and in page order so steps stay in sequence.
 */

const KEYWORD_POOL = 40;
const MEANING_POOL = 40;
const RRF_K = 60;
/**
 * A section the meaning search likes less than this is not a match, however it ranks: that search always has a closest
 * section, even when nothing is relevant, and an unrelated section handed to the worker looks like reference material.
 * Tuned on real questions against EAP's pages (see the scores the admin check reports).
 */
export const MIN_MEANING_SCORE = Number(process.env.KNOWLEDGE_MIN_MEANING_SCORE) > 0 ? Number(process.env.KNOWLEDGE_MIN_MEANING_SCORE) : 0.3;
const DEFAULT_LIMIT = 6;
const MAX_PER_PAGE = 3;
const QUERY_VECTOR_CACHE = 200;

type Loaded = {
  finishedAt: number;
  sections: { id: string; pageId: string; position: number; title: string; heading: string | null; content: string; vector: Float32Array | null }[];
};

const loaded = new Map<string, Loaded>();
const queryVectors = new Map<string, number[]>();

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
  loaded.set(organizationId, fresh);
  return fresh;
}

async function queryVector(text: string, embed: Embedder): Promise<number[]> {
  const key = text.toLowerCase().replace(/\s+/g, " ").trim();
  const known = queryVectors.get(key);
  if (known) return known;
  const [vector] = await embed([text]);
  queryVectors.set(key, vector);
  if (queryVectors.size > QUERY_VECTOR_CACHE) queryVectors.delete(queryVectors.keys().next().value as string);
  return vector;
}

export type IndexSearchTimings = { keywordMs: number; meaningMs: number; totalMs: number; meaning: "used" | "failed" | "none" };
/** Why a section was returned, for tuning: its meaning score, its place in the keyword list, and the merged score. */
export type IndexMatchDetail = { title: string; heading: string | null; meaning: number | null; keywordPlace: number | null; fused: number };

export async function searchKnowledgeIndex(
  organizationId: string,
  question: string,
  options: { limit?: number; embed?: Embedder } = {},
): Promise<{ matches: KnowledgeMatch[]; timings: IndexSearchTimings; details: IndexMatchDetail[] }> {
  const started = Date.now();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const embed = options.embed ?? embedTexts;
  const focus = focusOnQuestion(question);
  const words = expandKeywords(focus, searchKeywords(focus, 12));
  const timings: IndexSearchTimings = { keywordMs: 0, meaningMs: 0, totalMs: 0, meaning: "none" };

  const keywordSearch = async (): Promise<string[]> => {
    if (words.length === 0) return [];
    const t0 = Date.now();
    const rows = await db.execute<{ id: string }>(sql`
      select id from knowledge_sections, websearch_to_tsquery('english', ${words.join(" or ")}) q
      where organization_id = ${organizationId} and source = ${INDEX_SOURCE} and search @@ q
      order by ts_rank_cd(search, q) desc limit ${KEYWORD_POOL}`);
    timings.keywordMs = Date.now() - t0;
    return rows.rows.map((row) => row.id);
  };

  const meaningScores = new Map<string, number>();
  const meaningSearch = async (all: Loaded): Promise<string[]> => {
    const t0 = Date.now();
    try {
      const vector = await queryVector(focus, embed);
      const scored = all.sections
        .filter((section) => section.vector)
        .map((section) => ({ id: section.id, score: cosine(vector, section.vector as Float32Array) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MEANING_POOL);
      timings.meaning = "used";
      for (const entry of scored) meaningScores.set(entry.id, entry.score);
      return scored.filter((entry) => entry.score >= MIN_MEANING_SCORE).map((entry) => entry.id);
    } catch (error) {
      // Without the meaning half the keyword half still answers; say so in the log.
      console.warn("[knowledge-search] meaning search failed, using keywords only:", error instanceof Error ? error.message : error);
      timings.meaning = "failed";
      return [];
    } finally {
      timings.meaningMs = Date.now() - t0;
    }
  };

  const all = await sectionsFor(organizationId);
  if (all.sections.length === 0) return { matches: [], timings: { ...timings, totalMs: Date.now() - started }, details: [] };
  const [byKeyword, byMeaning] = await Promise.all([keywordSearch(), meaningSearch(all)]);

  // Reciprocal rank fusion: a section near the top of either list scores, one near the top of both scores most.
  const fused = new Map<string, number>();
  for (const list of [byKeyword, byMeaning]) list.forEach((id, index) => fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + index + 1)));
  const byId = new Map(all.sections.map((section) => [section.id, section]));
  const ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]);

  const perPage = new Map<string, number>();
  const chosen: { section: Loaded["sections"][number]; score: number }[] = [];
  for (const [id, score] of ranked) {
    const section = byId.get(id);
    if (!section) continue;
    if ((perPage.get(section.pageId) ?? 0) >= MAX_PER_PAGE) continue;
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
