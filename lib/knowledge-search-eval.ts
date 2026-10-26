import { DEFAULT_TUNING, indexedPages, primeQueryVectors, searchKnowledgeIndex, type SearchTuning } from "@/lib/knowledge-search";

/**
 * Tries settings of the saved-copy search on real questions and scores them, so the defaults are chosen from numbers.
 * Questions come from two places: one per indexed page ("Can you explain <title>?", the right answer is that page), and
 * a list the caller sends with the page title each should find. Read-only; runs in the background.
 */

export type ExperimentConfig = { name: string; tuning: Partial<SearchTuning> };
export type ExperimentQuestion = { q: string; expected: string };

export type ExperimentResult = {
  name: string;
  tuning: Partial<SearchTuning>;
  pages: { asked: number; first: number; top3: number; top5: number; found: number; realMisses: number; stubMisses: number };
  questions: { asked: number; found: number; first: number; missed: string[] };
  /** Sections returned for questions that have no page to find (more means more noise handed to the worker). */
  boundaryAverage: number;
  medianMs: number;
  p90Ms: number;
};

/** A page with less text than this cannot be found by a question about it, and does not count against a setting. */
const STUB_CHARS = 500;

export const DEFAULT_GRID: ExperimentConfig[] = [
  { name: "without the title signal (as first deployed)", tuning: { weights: { keyword: 1, meaning: 1, title: 0 } } },
  { name: "current defaults", tuning: {} },
  { name: "title counts double", tuning: { weights: { keyword: 1, meaning: 1, title: 2 } } },
  { name: "title counts triple", tuning: { weights: { keyword: 1, meaning: 1, title: 3 } } },
  { name: "meaning counts double", tuning: { weights: { keyword: 1, meaning: 2, title: 1 } } },
  { name: "keyword counts double", tuning: { weights: { keyword: 2, meaning: 1, title: 1 } } },
  { name: "keyword score favours short sections (norm 1)", tuning: { keywordNorm: 1 } },
  { name: "keyword score divided by length (norm 2)", tuning: { keywordNorm: 2 } },
  { name: "keyword score squashed (norm 32)", tuning: { keywordNorm: 32 } },
  { name: "two sections per page", tuning: { perPage: 2 } },
  { name: "four sections per page", tuning: { perPage: 4 } },
  { name: "eight sections back", tuning: { limit: 8 } },
  { name: "ten sections back", tuning: { limit: 10 } },
  { name: "meaning minimum 0.2", tuning: { minMeaning: 0.2 } },
  { name: "meaning minimum 0.4", tuning: { minMeaning: 0.4 } },
  { name: "title: 12 pages, 3 sections each", tuning: { titlePages: 12, titleSections: 3 } },
  { name: "sharper merge (k 20)", tuning: { rrfK: 20 } },
  { name: "title double, eight sections", tuning: { weights: { keyword: 1, meaning: 1, title: 2 }, limit: 8 } },
];

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await work(items[index]);
      }
    }),
  );
  return out;
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
};

const distinctPages = (documentIds: string[]) => [...new Set(documentIds.map((id) => id.replace(/^confluence:/, "")))];

export async function runSearchExperiment(
  organizationId: string,
  configs: ExperimentConfig[],
  questions: ExperimentQuestion[],
  boundary: string[],
): Promise<ExperimentResult[]> {
  const pages = await indexedPages(organizationId);
  const pageQuestions = pages.map((page) => ({ page, q: `Can you explain ${page.title}?` }));
  const byTitle = new Map(pages.map((page) => [page.title.toLowerCase(), page.pageId]));
  await primeQueryVectors([...pageQuestions.map((entry) => entry.q), ...questions.map((entry) => entry.q), ...boundary]);

  const results: ExperimentResult[] = [];
  for (const config of configs) {
    const times: number[] = [];
    const search = async (q: string) => {
      const started = Date.now();
      const { matches } = await searchKnowledgeIndex(organizationId, q, { rewrite: false, tuning: { ...DEFAULT_TUNING, ...config.tuning, weights: { ...DEFAULT_TUNING.weights, ...config.tuning.weights } } });
      times.push(Date.now() - started);
      return distinctPages(matches.map((match) => match.documentId));
    };

    const pageRuns = await pool(pageQuestions, 4, async (entry) => ({ entry, order: await search(entry.q) }));
    const tally = { asked: 0, first: 0, top3: 0, top5: 0, found: 0, realMisses: 0, stubMisses: 0 };
    for (const { entry, order } of pageRuns) {
      tally.asked += 1;
      const place = order.indexOf(entry.page.pageId) + 1;
      if (place === 1) tally.first += 1;
      if (place >= 1 && place <= 3) tally.top3 += 1;
      if (place >= 1 && place <= 5) tally.top5 += 1;
      if (place >= 1) tally.found += 1;
      else if (entry.page.chars < STUB_CHARS) tally.stubMisses += 1;
      else tally.realMisses += 1;
    }

    const questionRuns = await pool(questions, 4, async (entry) => ({ entry, order: await search(entry.q) }));
    const missed: string[] = [];
    let found = 0;
    let first = 0;
    for (const { entry, order } of questionRuns) {
      const expectedId = byTitle.get(entry.expected.toLowerCase());
      const place = expectedId ? order.indexOf(expectedId) + 1 : 0;
      if (place >= 1) found += 1;
      else missed.push(entry.expected);
      if (place === 1) first += 1;
    }

    const boundaryRuns = await pool(boundary, 4, async (q) => (await search(q)).length);
    results.push({
      name: config.name,
      tuning: config.tuning,
      pages: tally,
      questions: { asked: questions.length, found, first, missed },
      boundaryAverage: boundaryRuns.length ? Math.round((boundaryRuns.reduce((a, b) => a + b, 0) / boundaryRuns.length) * 10) / 10 : 0,
      medianMs: percentile(times, 0.5),
      p90Ms: percentile(times, 0.9),
    });
  }
  return results;
}
