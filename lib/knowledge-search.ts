import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeIndexState } from "@/db/schema";
import { cosine, embedTexts, type Embedder } from "@/lib/embeddings";
import { INDEX_SOURCE } from "@/lib/knowledge-index";
import { expandKeywords, focusOnQuestion, searchKeywords, stemWeights, wordStem } from "@/lib/tools-integrations/atlassian";
import type { KnowledgeMatch } from "@/lib/knowledge";
import { rewriteForSearch } from "@/lib/query-rewrite";
import { topicsForSearch } from "@/lib/query-topics";
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
  const allStems = [...new Set(words.map(wordStem))];
  // Words in nearly every title ("EAP", "Expert") count for nothing when the question has a distinctive word: two of
  // them would otherwise outscore the one rare word ("Parallels") and push the page named for it out.
  const distinctiveStems = allStems.filter((stem) => (weights[stem] ?? 1) >= DISTINCTIVE_WORD_WEIGHT);
  const stems = distinctiveStems.length > 0 ? distinctiveStems : allStems;
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

/** A word in this few titles or fewer names its topic: "Parallels" is in five of 495. */
const RARE_TITLE_PAGES = 6;
/** The most sections kept for such pages, so the rest of the answer still comes from the ranking. */
const RARE_TITLE_SECTIONS = 5;
/** How rare the word must be in the pages' text too (textRarity: about 0.5 for 'Parallels', well under that for 'system'). */
const RARE_WORD_WEIGHT = 0.35;

/**
 * The pages named for the rarest word of the question, when that word is in only a few page titles. Their opening
 * sections are always handed to the worker: a question that also says "EAP Expert" otherwise pulls every "EAP Expert"
 * page ahead of "Installing Parallels", however the words are weighed.
 */
const pageTexts = new WeakMap<Loaded, Map<string, string>>();
/** Each page's whole text (its sections, lower-cased), built once per saved copy. `Loaded.pages` holds only titles. */
function textsOf(all: Loaded): Map<string, string> {
  let texts = pageTexts.get(all);
  if (!texts) {
    texts = new Map();
    for (const section of all.sections) texts.set(section.pageId, `${texts.get(section.pageId) ?? ""}\n${section.title}\n${section.heading ?? ""}\n${section.content}`.toLowerCase());
    pageTexts.set(all, texts);
  }
  return texts;
}

/** How few pages contain the word anywhere in their text, 0 to 1 (about 0.5 for "Parallels"; "system" is in most pages). */
function textRarity(all: Loaded, stem: string): number {
  const total = all.pages.length;
  if (total === 0) return 0;
  let containing = 0;
  for (const text of textsOf(all).values()) if (text.includes(stem)) containing += 1;
  return Math.log((total + 1) / (containing + 1)) / Math.log(total + 1);
}

function rareTitlePages(all: Loaded, words: string[], titleSections: number): string[] {
  const stems = [...new Set(words.map(wordStem))].filter((stem) => stem.length >= 4);
  // The word must be rare in the pages' text as well as in their titles: "system" is in few titles but in the text of
  // most pages, so reserving "System Customization" for it crowds out the page that answers the question.
  let best: { pages: Loaded["pages"]; rarity: number } | null = null;
  for (const stem of stems) {
    const pages = all.pages.filter((page) => page.title.toLowerCase().includes(stem));
    if (pages.length < 1 || pages.length > RARE_TITLE_PAGES) continue;
    const rarity = textRarity(all, stem);
    if (rarity >= RARE_WORD_WEIGHT && (!best || rarity > best.rarity)) best = { pages, rarity };
  }
  if (!best) return [];
  const ids: string[] = [];
  for (const page of best.pages) for (const id of page.sectionIds.slice(0, titleSections)) if (ids.length < RARE_TITLE_SECTIONS) ids.push(id);
  return ids;
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
    /** The separate questions inside a long message, searched one by one; false turns it off (the experiment runner). */
    topics?: false | ((question: string) => Promise<string[]>);
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
  // The rewrite and the split of a many-part message run side by side, so neither waits for the other.
  const [rewritten, topicQuestions] = await Promise.all([
    options.rewrite === false ? null : (options.rewrite ?? rewriteForSearch)(question).catch(() => null),
    options.topics === false ? [] : (options.topics ?? topicsForSearch)(question).catch(() => [] as string[]),
  ]);
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
  const listsFor = async (query: { focus: string; words: string[] }) => {
    const [keyword, meaning] = await Promise.all([keywordSearch(query.words), meaningSearch(all, query.focus)]);
    // The words that name this product or are in nearly every page ("EAP", "Expert") can outweigh the one that says
    // what the question is about ("Parallels"). A second keyword pass on the distinctive words alone is merged in too.
    const weights = stemWeights(all.pages, query.words);
    const distinctive = query.words.filter((word) => (weights[wordStem(word)] ?? 1) >= DISTINCTIVE_WORD_WEIGHT);
    const distinctiveKeyword = distinctive.length > 0 && distinctive.length < query.words.length ? await keywordSearch(distinctive) : [];
    // The page-title signal: the first sections of the pages named for the question.
    const title = tuning.weights.title > 0 ? pagesByTitle(all, query.words, tuning.titlePages).flatMap((page) => page.sectionIds.slice(0, tuning.titleSections)) : [];
    return { keyword, distinctiveKeyword, meaning, title };
  };
  type QueryLists = Awaited<ReturnType<typeof listsFor>>;
  const fuse = (lists: QueryLists[]) => {
    const scores = new Map<string, number>();
    for (const one of lists) {
      for (const [list, weight] of [[one.keyword, tuning.weights.keyword], [one.distinctiveKeyword, tuning.weights.keyword], [one.meaning, tuning.weights.meaning], [one.title, tuning.weights.title]] as const) {
        list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + weight / (tuning.rrfK + index + 1)));
      }
    }
    return scores;
  };
  // A message with several separate questions is also searched question by question (see lib/query-topics.ts).
  const topicQueries = topicQuestions.map(buildQuery);
  if (topicQuestions.length > 0) traceSet("searchTopics", topicQuestions);
  const [perQuery, perTopic] = await Promise.all([Promise.all(queries.map(listsFor)), Promise.all(topicQueries.map(listsFor))]);
  const byKeyword = perQuery[0].keyword;

  // Reciprocal rank fusion: a section near the top of any list scores, one near the top of several scores most.
  const fused = fuse(perQuery);
  const byId = new Map(all.sections.map((section) => [section.id, section]));
  const ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]);

  // Sections of the pages named for the question's rarest word come first, then the ranking fills the rest.
  const reserved = new Set(queries.flatMap((query) => rareTitlePages(all, query.words, tuning.titleSections)));
  const ordered = [...reserved.values()].map((id) => [id, fused.get(id) ?? 0] as [string, number]).concat(ranked.filter(([id]) => !reserved.has(id)));

  // Each separate question of a many-part message gets its own share of the sections, best first, before the ranking of
  // the whole message fills what is left.
  const topicRanked = perTopic.map((lists, index) => {
    const own = fuse([lists]);
    const reservedForTopic = rareTitlePages(all, topicQueries[index].words, tuning.titleSections);
    const rest = [...own.entries()].sort((a, b) => b[1] - a[1]).filter(([id]) => !reservedForTopic.includes(id));
    return reservedForTopic.map((id) => [id, own.get(id) ?? 0] as [string, number]).concat(rest);
  });
  const perTopicSections = 3;
  const total = topicRanked.length > 0 ? Math.max(limit, Math.min(20, topicRanked.length * perTopicSections + 2)) : limit;

  const perPage = new Map<string, number>();
  const chosen: { section: Loaded["sections"][number]; score: number; topic?: string }[] = [];
  const taken = new Set<string>();
  const take = (id: string, score: number, topic?: string): boolean => {
    const section = byId.get(id);
    if (!section || taken.has(id) || (perPage.get(section.pageId) ?? 0) >= tuning.perPage) return false;
    perPage.set(section.pageId, (perPage.get(section.pageId) ?? 0) + 1);
    taken.add(id);
    chosen.push({ section, score, ...(topic ? { topic } : {}) });
    return true;
  };
  for (let round = 0; round < perTopicSections; round += 1) {
    for (const [topicIndex, ranking] of topicRanked.entries()) {
      let given = 0;
      let cursor = 0;
      // The round's section is this topic's best one not taken yet.
      while (given < 1 && cursor < ranking.length && chosen.length < total) {
        const [id, score] = ranking[cursor];
        cursor += 1;
        if (taken.has(id)) continue;
        if (take(id, score, topicQuestions[topicIndex])) given += 1;
      }
    }
  }
  for (const [id, score] of ordered) {
    if (chosen.length >= total) break;
    take(id, score);
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
    ...(entry.topic ? { topic: entry.topic } : {}),
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
