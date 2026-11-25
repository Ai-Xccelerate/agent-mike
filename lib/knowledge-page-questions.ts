import { Agent, run } from "@openai/agents";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgePageQuestions } from "@/db/schema";
import { embedTexts, type Embedder } from "@/lib/embeddings";
import { guardrailModel, modelUnavailabilityReason } from "@/lib/env";

/**
 * The words customers use for each knowledge page.
 *
 * Customers rarely use a help page's own words: they write "add the EAP field to my open files list" for a page that
 * says "Column Chooser", or "is there a handout I can send our counselors" for a page about a downloadable PDF. In the
 * 25 Nov persona test, 70% of the answers that fell short never had the right page in front of the worker, and with the
 * right page in hand most of them became right. So each indexed page gets a few short messages, written once by a
 * model when the page is indexed or changes, in the words different people would use. The search matches a
 * customer's message against them as well as against the page itself (lib/knowledge-search.ts). They are only ever
 * matched against, never handed to the worker as reference material.
 *
 * Switched off with KNOWLEDGE_PAGE_QUESTIONS=off.
 */

/** The same source name as lib/knowledge-index.ts (not imported from there: that module starts this one after a sync). */
const INDEX_SOURCE = "confluence";
export const QUESTIONS_PER_PAGE = 8;
const MAX_QUESTION_CHARS = 200;
const PAGE_TEXT_CHARS = 6000;
const PAGES_PER_RUN = Number(process.env.KNOWLEDGE_PAGE_QUESTIONS_PER_RUN) > 0 ? Number(process.env.KNOWLEDGE_PAGE_QUESTIONS_PER_RUN) : 600;

export function pageQuestionsEnabled(): boolean {
  return (process.env.KNOWLEDGE_PAGE_QUESTIONS || "").trim().toLowerCase() !== "off";
}

/** Writes the questions for one page. */
export type QuestionWriter = (title: string, text: string) => Promise<string[]>;

/** One question per line of the model's reply: bullets, numbers and quotes removed, repeats and blanks dropped. */
export function cleanQuestions(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const text = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^["'`“”]+|["'`“”]+$/g, "")
      .trim();
    if (text.length < 4) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.slice(0, MAX_QUESTION_CHARS));
    if (out.length >= QUESTIONS_PER_PAGE) break;
  }
  return out;
}

const INSTRUCTIONS =
  "You write the messages people would type into a support chat when they need the help page you are given. " +
  `Write ${QUESTIONS_PER_PAGE} short messages, one per line, no numbering. Write them the way different users of this product would: ` +
  "beginners and experts, staff in different roles, someone in a hurry. Use their everyday words, synonyms, abbreviations and " +
  "descriptions of the task or the problem they have, not the page's title or its distinctive phrases. Mix questions with statements " +
  "of a problem. Cover the different things the page helps with. Reply with the messages only.";

export const writeQuestionsWithModel: QuestionWriter = async (title, text) => {
  if (modelUnavailabilityReason()) return [];
  const writer = new Agent({
    name: "Page question writer",
    instructions: INSTRUCTIONS,
    model: guardrailModel(),
    modelSettings: { reasoning: { effort: "low" }, text: { verbosity: "low" } },
  });
  const result = await run(writer, `Help page title: ${title}\n\n${text.slice(0, PAGE_TEXT_CHARS)}`, { maxTurns: 1 });
  return cleanQuestions(typeof result.finalOutput === "string" ? result.finalOutput : String(result.finalOutput ?? ""));
};

export type PageQuestionsReport = { pages: number; written: number; removed: number; failed: number; skipped?: string };

const running = new Set<string>();

/**
 * Brings the questions in step with the saved pages: removes the questions of pages that changed or are gone, and
 * writes questions for every page that has none for its current text. Idempotent, so it can run after every sync.
 */
export async function syncPageQuestions(
  organizationId: string,
  deps: { write?: QuestionWriter; embed?: Embedder; concurrency?: number } = {},
): Promise<PageQuestionsReport> {
  const report: PageQuestionsReport = { pages: 0, written: 0, removed: 0, failed: 0 };
  if (!pageQuestionsEnabled()) return { ...report, skipped: "switched off" };
  if (running.has(organizationId)) return { ...report, skipped: "already running" };
  running.add(organizationId);
  try {
    const write = deps.write ?? writeQuestionsWithModel;
    const embed = deps.embed ?? embedTexts;

    // Questions written for text the page no longer has, or for a page that is gone.
    const removed = await db.execute(sql`
      delete from knowledge_page_questions q
      where q.organization_id = ${organizationId} and q.source = ${INDEX_SOURCE}
        and not exists (
          select 1 from knowledge_index_pages p
          where p.organization_id = q.organization_id and p.source = q.source and p.page_id = q.page_id and p.content_hash = q.content_hash
        )`);
    report.removed = removed.rowCount ?? 0;

    const pending = (
      await db.execute<{ page_id: string; title: string; content_hash: string }>(sql`
        select p.page_id, p.title, p.content_hash from knowledge_index_pages p
        where p.organization_id = ${organizationId} and p.source = ${INDEX_SOURCE}
          and not exists (
            select 1 from knowledge_page_questions q
            where q.organization_id = p.organization_id and q.source = p.source and q.page_id = p.page_id and q.content_hash = p.content_hash
          )
        order by p.page_id limit ${PAGES_PER_RUN}`)
    ).rows;

    let next = 0;
    const worker = async () => {
      while (next < pending.length) {
        const page = pending[next++];
        try {
          const text = (
            await db.execute<{ t: string | null }>(sql`
              select string_agg(coalesce(heading, '') || E'\n' || content, E'\n' order by position) t
              from knowledge_sections where organization_id = ${organizationId} and source = ${INDEX_SOURCE} and page_id = ${page.page_id}`)
          ).rows[0]?.t ?? "";
          if (!text.trim()) continue;
          const questions = await write(page.title, text);
          if (questions.length === 0) continue;
          const vectors = await embed(questions);
          await db.transaction(async (tx) => {
            await tx
              .delete(knowledgePageQuestions)
              .where(and(eq(knowledgePageQuestions.organizationId, organizationId), eq(knowledgePageQuestions.source, INDEX_SOURCE), eq(knowledgePageQuestions.pageId, page.page_id)));
            await tx.insert(knowledgePageQuestions).values(
              questions.map((question, i) => ({ organizationId, source: INDEX_SOURCE, pageId: page.page_id, contentHash: page.content_hash, question, embedding: vectors[i] ?? null })),
            );
          });
          report.pages += 1;
          report.written += questions.length;
        } catch (error) {
          report.failed += 1;
          console.warn("[page-questions] could not write questions for a page", page.page_id, error instanceof Error ? error.message : error);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, deps.concurrency ?? 4) }, worker));
    return report;
  } finally {
    running.delete(organizationId);
  }
}
