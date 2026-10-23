import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeIndexPages, knowledgeIndexState, knowledgeSections } from "@/db/schema";
import { chunkPage, embeddingInput } from "@/lib/knowledge-chunker";
import { embedTexts, type Embedder } from "@/lib/embeddings";
import { confluenceIndexSource, type IndexSource } from "@/lib/tools-integrations/atlassian";

/**
 * Keeps a searchable copy of an organization's Confluence in Mike's own database, cut into sections.
 *
 * A sync asks Confluence for the list of pages with their version numbers (a few hundred KB for about 500 pages),
 * compares it with what was saved, and reads, splits and embeds only the pages that are new or changed. Pages that
 * are gone from Confluence are removed. A lease in `knowledge_index_state` stops two servers syncing the same source
 * at once. Nothing here answers a customer; the index is only searched when an organization switches it on.
 */

export const INDEX_SOURCE = "confluence";
/** A sync that has not finished by then is treated as dead, so a crash never blocks the next one. */
const LEASE_MINUTES = 15;
const INSERT_BATCH = 100;

export type SyncReport = {
  /** Why nothing was done, e.g. Confluence is not connected or another sync is running. */
  skipped?: string;
  /** The reason a sync stopped early. Pages already saved are untouched. */
  error?: string;
  pages: number;
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
  sections: number;
  embedded: number;
  ms: number;
};

type Deps = { source: IndexSource | null; embed: Embedder };

const empty = (): SyncReport => ({ pages: 0, added: 0, changed: 0, removed: 0, unchanged: 0, sections: 0, embedded: 0, ms: 0 });

const hashOf = (title: string, text: string) => createHash("sha256").update(`${title}\n${text}`).digest("hex");

async function acquireLease(organizationId: string): Promise<boolean> {
  const rows = await db.execute(sql`
    insert into knowledge_index_state (organization_id, source, running_until, last_started_at)
    values (${organizationId}, ${INDEX_SOURCE}, now() + make_interval(mins => ${LEASE_MINUTES}), now())
    on conflict (organization_id, source) do update
      set running_until = now() + make_interval(mins => ${LEASE_MINUTES}), last_started_at = now()
      where knowledge_index_state.running_until is null or knowledge_index_state.running_until < now()
    returning 1 as acquired`);
  return rows.rows.length > 0;
}

async function release(organizationId: string, error: string | null): Promise<void> {
  const [pages] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(knowledgeIndexPages)
    .where(and(eq(knowledgeIndexPages.organizationId, organizationId), eq(knowledgeIndexPages.source, INDEX_SOURCE)));
  const [sections] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(knowledgeSections)
    .where(and(eq(knowledgeSections.organizationId, organizationId), eq(knowledgeSections.source, INDEX_SOURCE)));
  await db
    .update(knowledgeIndexState)
    .set({ runningUntil: null, lastFinishedAt: new Date(), lastError: error, pages: pages?.n ?? 0, chunks: sections?.n ?? 0 })
    .where(and(eq(knowledgeIndexState.organizationId, organizationId), eq(knowledgeIndexState.source, INDEX_SOURCE)));
}

export async function syncKnowledgeIndex(organizationId: string, deps: Partial<Deps> = {}): Promise<SyncReport> {
  const started = Date.now();
  const report = empty();
  const source = deps.source !== undefined ? deps.source : await confluenceIndexSource(organizationId);
  if (!source) return { ...report, skipped: "Confluence is not connected" };
  if (!(await acquireLease(organizationId))) return { ...report, skipped: "another sync is already running" };

  let failure: string | null = null;
  try {
    const embed = deps.embed ?? embedTexts;
    const listed = await source.listMetadata();
    const saved = await db
      .select()
      .from(knowledgeIndexPages)
      .where(and(eq(knowledgeIndexPages.organizationId, organizationId), eq(knowledgeIndexPages.source, INDEX_SOURCE)));
    const savedById = new Map(saved.map((row) => [row.pageId, row]));

    // A listing that comes back empty while we hold pages is far more likely a permission or API problem than every
    // page being deleted. Keep what we have.
    if (listed.length === 0 && saved.length > 0) {
      failure = "Confluence returned no pages, so the index was left as it is";
      return { ...report, pages: saved.length, error: failure, ms: Date.now() - started };
    }

    const listedIds = new Set(listed.map((page) => page.id));
    const toFetch = listed.filter((page) => {
      const was = savedById.get(page.id);
      return !was || page.version === null || was.version !== page.version || was.title !== page.title;
    });
    report.pages = listed.length;
    report.unchanged = listed.length - toFetch.length;
    report.added = toFetch.filter((page) => !savedById.has(page.id)).length;

    const fetched = await source.fetchPages(toFetch.map((page) => page.id));
    const textById = new Map(fetched.map((page) => [page.id, page]));

    type Work = { id: string; title: string; link: string | null; version: number | null; hash: string; sections: ReturnType<typeof chunkPage> };
    const needsEmbedding: Work[] = [];
    const sameContent: Work[] = [];
    for (const meta of toFetch) {
      const page = textById.get(meta.id);
      if (!page) continue;
      const title = page.title || meta.title;
      const work: Work = { id: meta.id, title, link: page.link ?? meta.link, version: meta.version, hash: hashOf(title, page.text), sections: chunkPage(title, page.text) };
      (savedById.get(meta.id)?.contentHash === work.hash ? sameContent : needsEmbedding).push(work);
    }

    // All embedding happens before anything is written, so a failure leaves the index exactly as it was.
    const inputs = needsEmbedding.flatMap((work) => work.sections.map((section) => embeddingInput(work.title, section)));
    const vectors = inputs.length > 0 ? await embed(inputs) : [];
    report.embedded = vectors.length;

    let cursor = 0;
    for (const work of needsEmbedding) {
      const rows = work.sections.map((section) => ({
        organizationId,
        source: INDEX_SOURCE,
        pageId: work.id,
        position: section.position,
        title: work.title,
        heading: section.heading,
        content: section.content,
        embedding: vectors[cursor++],
      }));
      await db.transaction(async (tx) => {
        await tx
          .delete(knowledgeSections)
          .where(and(eq(knowledgeSections.organizationId, organizationId), eq(knowledgeSections.source, INDEX_SOURCE), eq(knowledgeSections.pageId, work.id)));
        for (let i = 0; i < rows.length; i += INSERT_BATCH) await tx.insert(knowledgeSections).values(rows.slice(i, i + INSERT_BATCH));
        await tx
          .insert(knowledgeIndexPages)
          .values({ organizationId, source: INDEX_SOURCE, pageId: work.id, title: work.title, link: work.link, version: work.version, contentHash: work.hash })
          .onConflictDoUpdate({
            target: [knowledgeIndexPages.organizationId, knowledgeIndexPages.source, knowledgeIndexPages.pageId],
            set: { title: work.title, link: work.link, version: work.version, contentHash: work.hash, syncedAt: new Date() },
          });
      });
      if (savedById.has(work.id)) report.changed += 1;
    }

    // Edited, but the text came out the same: remember the new version so it is not read again.
    for (const work of sameContent) {
      await db
        .update(knowledgeIndexPages)
        .set({ title: work.title, link: work.link, version: work.version, syncedAt: new Date() })
        .where(and(eq(knowledgeIndexPages.organizationId, organizationId), eq(knowledgeIndexPages.source, INDEX_SOURCE), eq(knowledgeIndexPages.pageId, work.id)));
    }
    report.unchanged += sameContent.length;

    const gone = saved.filter((row) => !listedIds.has(row.pageId)).map((row) => row.pageId);
    if (gone.length > 0) {
      await db
        .delete(knowledgeSections)
        .where(and(eq(knowledgeSections.organizationId, organizationId), eq(knowledgeSections.source, INDEX_SOURCE), inArray(knowledgeSections.pageId, gone)));
      await db
        .delete(knowledgeIndexPages)
        .where(and(eq(knowledgeIndexPages.organizationId, organizationId), eq(knowledgeIndexPages.source, INDEX_SOURCE), inArray(knowledgeIndexPages.pageId, gone)));
      report.removed = gone.length;
    }
    return { ...report, ms: Date.now() - started };
  } catch (error) {
    failure = error instanceof Error ? error.message : "sync failed";
    return { ...report, error: failure, ms: Date.now() - started };
  } finally {
    await release(organizationId, failure);
  }
}

export type IndexStatus = {
  connected: boolean;
  pages: number;
  sections: number;
  withMeaning: number;
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
};

export async function knowledgeIndexStatus(organizationId: string): Promise<IndexStatus> {
  const [state] = await db
    .select()
    .from(knowledgeIndexState)
    .where(and(eq(knowledgeIndexState.organizationId, organizationId), eq(knowledgeIndexState.source, INDEX_SOURCE)))
    .limit(1);
  const [pages] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(knowledgeIndexPages)
    .where(and(eq(knowledgeIndexPages.organizationId, organizationId), eq(knowledgeIndexPages.source, INDEX_SOURCE)));
  const [sections] = await db
    .select({ n: sql<number>`count(*)::int`, meaning: sql<number>`count(*) filter (where embedding is not null)::int` })
    .from(knowledgeSections)
    .where(and(eq(knowledgeSections.organizationId, organizationId), eq(knowledgeSections.source, INDEX_SOURCE)));
  return {
    connected: true,
    pages: pages?.n ?? 0,
    sections: sections?.n ?? 0,
    withMeaning: sections?.meaning ?? 0,
    running: Boolean(state?.runningUntil && state.runningUntil.getTime() > Date.now()),
    lastStartedAt: state?.lastStartedAt?.toISOString() ?? null,
    lastFinishedAt: state?.lastFinishedAt?.toISOString() ?? null,
    lastError: state?.lastError ?? null,
  };
}
