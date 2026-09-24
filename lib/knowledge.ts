import { createHash } from "crypto";
import matter from "gray-matter";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeChunks, knowledgeDocuments } from "@/db/schema";
import { splitMarkdown } from "@/lib/knowledge-split";

/**
 * R7: default knowledge strategy is markdown files + full-text search — no
 * vector or graph database for a worker's own operating knowledge. A worker
 * will realistically hold tens to low hundreds of files, well under a
 * model's context window, so Postgres full-text search is a low-operations
 * baseline with no embedding provider or extra infra to run.
 *
 * R8: a vector+graph layer is only added when a worker must search a large,
 * frequently-changing EXTERNAL knowledge base (e.g. a supported product's
 * docs) — that's a separate external tool the agent calls, not this module.
 */

export class InvalidOKFDocument extends Error {}

export interface OkfDocument {
  conceptId: string;
  title: string;
  description: string | null;
  tags: string[];
  resource: string | null;
  body: string;
}

function checksumOf(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function parseOkf(raw: string, fallbackConceptId: string): OkfDocument {
  const { data, content } = matter(raw);
  if (!data.type) {
    throw new InvalidOKFDocument("OKF frontmatter is missing required field 'type'");
  }
  return {
    conceptId: (data.id || fallbackConceptId) as string,
    title: (data.title || fallbackConceptId) as string,
    description: data.description ?? null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    resource: data.resource ?? null,
    body: content.trim(),
  };
}

/**
 * Wrap a plain-text/PDF-extracted upload into synthetic OKF frontmatter.
 *
 * `keep` carries forward a description/tags an earlier ingest already parsed
 * — editing a doc's title or body through a plain text field has no way to
 * express those, and re-wrapping without them would silently erase whatever
 * frontmatter the original file arrived with.
 */
export function wrapAsOkf(
  conceptId: string,
  title: string,
  body: string,
  keep?: { description?: string | null; tags?: string[] },
): string {
  const description = keep?.description
    ? `\ndescription: "${keep.description.replace(/"/g, '\\"')}"`
    : "";
  const tags = keep?.tags?.length ? `\ntags: [${keep.tags.join(", ")}]` : "";
  return `---\ntype: reference\ntitle: "${title.replace(/"/g, '\\"')}"${description}${tags}\n---\n\n${body}`;
}

/** What Settings > Knowledge accepts as an upload. Everything else is chat context only. */
export const KNOWLEDGE_FILE_EXTENSIONS = ["pdf", "md", "markdown", "txt", "text"] as const;
export const KNOWLEDGE_FILE_LABEL = "PDF, Markdown, or plain text";

function fileExtension(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

export function isKnowledgeFile(filename: string): boolean {
  return (KNOWLEDGE_FILE_EXTENSIONS as readonly string[]).includes(fileExtension(filename));
}

export function isMarkdownFile(filename: string): boolean {
  const ext = fileExtension(filename);
  return ext === "md" || ext === "markdown";
}

/** Frontmatter an upload already carries (only counted when it has the required `type`). */
export function readOkfFrontmatter(text: string): { id?: string; title?: string; data: Record<string, unknown> } | null {
  try {
    const { data } = matter(text);
    if (!data?.type) return null;
    return {
      id: typeof data.id === "string" ? data.id : undefined,
      title: typeof data.title === "string" ? data.title : undefined,
      data,
    };
  } catch {
    return null;
  }
}

/**
 * The raw OKF document for an uploaded file, by the Knowledge page's own
 * rules: Markdown that already carries OKF frontmatter is stored as written
 * (only its concept id is pinned, so it lands on the intended article);
 * PDFs and text are wrapped as a concept document titled after the file.
 * Markdown without frontmatter is wrapped the way "New doc" wraps free text.
 */
export function uploadedKnowledgeRaw(
  filename: string,
  conceptId: string,
  text: string,
  options: {
    title?: string | null;
    keep?: { description?: string | null; tags?: string[] };
    /** The upload route's rule: Markdown must carry OKF frontmatter, so pass it through and let ingest reject it. */
    strictMarkdown?: boolean;
  } = {},
): { raw: string; storedAsWritten: boolean } {
  if (isMarkdownFile(filename)) {
    const front = readOkfFrontmatter(text);
    if (front) {
      const { content } = matter(text);
      return { raw: matter.stringify(content, { ...front.data, id: conceptId }), storedAsWritten: true };
    }
    if (options.strictMarkdown) return { raw: text, storedAsWritten: true };
  }
  const fallbackTitle =
    fileExtension(filename) === "pdf" ? filename.replace(/\.pdf$/i, "") : isMarkdownFile(filename) ? filename.replace(/\.(md|markdown)$/i, "") : filename;
  return { raw: wrapAsOkf(conceptId, options.title?.trim() || fallbackTitle, text, options.keep), storedAsWritten: false };
}

/**
 * Editing an existing article, as Settings > Knowledge does: same concept id,
 * new title and body, and the description/tags it already had are kept.
 */
export async function editKnowledgeDocument(
  organizationId: string,
  existing: { conceptId: string; description: string | null; tags: string[] },
  title: string,
  content: string,
) {
  const raw = wrapAsOkf(existing.conceptId, title.trim(), content, {
    description: existing.description,
    tags: existing.tags,
  });
  return ingestOkf(organizationId, existing.conceptId, raw);
}

export async function ingestOkf(organizationId: string, conceptId: string, raw: string) {
  const doc = parseOkf(raw, conceptId);
  const checksum = checksumOf(doc.body);

  const [existing] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.organizationId, organizationId),
        eq(knowledgeDocuments.conceptId, doc.conceptId),
      ),
    )
    .limit(1);

  if (existing && existing.checksum === checksum) {
    return existing;
  }

  const [saved] = existing
    ? await db
        .update(knowledgeDocuments)
        .set({
          title: doc.title,
          description: doc.description,
          tags: doc.tags,
          body: doc.body,
          checksum,
          resource: doc.resource,
        })
        .where(eq(knowledgeDocuments.id, existing.id))
        .returning()
    : await db
        .insert(knowledgeDocuments)
        .values({
          organizationId,
          conceptId: doc.conceptId,
          title: doc.title,
          description: doc.description,
          tags: doc.tags,
          body: doc.body,
          checksum,
          resource: doc.resource,
        })
        .returning();

  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, saved.id));
  const chunks = splitMarkdown(doc.body);
  if (chunks.length > 0) {
    await db.insert(knowledgeChunks).values(
      chunks.map((chunk) => ({
        documentId: saved.id,
        heading: chunk.heading,
        content: chunk.content,
      })),
    );
  }

  return saved;
}

export interface KnowledgeMatch {
  documentId: string;
  title: string;
  heading: string | null;
  content: string;
  rank: number;
}

export async function retrieve(
  organizationId: string,
  query: string,
  limit = 5,
): Promise<KnowledgeMatch[]> {
  // websearch_to_tsquery ANDs every word, so a natural question ("what's our
  // refund window?") finds nothing whenever one word ("window") isn't in the
  // article. Strict first, for precision; only when that finds nothing, retry
  // with the same lexemes ORed together and let ts_rank_cd put the chunks
  // covering the most words first.
  const strict = await searchChunks(organizationId, sql`websearch_to_tsquery('english', ${query})`, limit);
  if (strict.length > 0) return strict;
  return searchChunks(
    organizationId,
    sql`nullif(replace(plainto_tsquery('english', ${query})::text, ' & ', ' | '), '')::tsquery`,
    limit,
  );
}

async function searchChunks(organizationId: string, tsQuery: SQL, limit: number): Promise<KnowledgeMatch[]> {
  const rows = await db.execute<{
    document_id: string;
    title: string;
    heading: string | null;
    content: string;
    rank: number;
  }>(sql`
    select kc.document_id, kd.title, kc.heading, kc.content,
           ts_rank_cd(to_tsvector('english', kd.title || ' ' || coalesce(kc.heading, '') || ' ' || kc.content), ${tsQuery}) as rank
    from knowledge_chunks kc
    join knowledge_documents kd on kd.id = kc.document_id
    where kd.organization_id = ${organizationId}
      and to_tsvector('english', kd.title || ' ' || coalesce(kc.heading, '') || ' ' || kc.content) @@ ${tsQuery}
    order by rank desc
    limit ${limit}
  `);

  return rows.rows.map((row) => ({
    documentId: row.document_id,
    title: row.title,
    heading: row.heading,
    content: row.content,
    rank: Number(row.rank),
  }));
}

const OVERLAP_STOPWORDS = new Set(
  (
    "the and for are but not you all any can had her was one our out has have this that with from they will " +
    "your what when which their there been more also into than then them some such only other about after " +
    "within should would could must may each per its it's who how where why does did just very over under " +
    "customer customers please note"
  ).split(" "),
);

/** Crude but dependency-free normalisation: lowercase, strip common suffixes. */
function keywordStem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/, "");
}

function keywordSet(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
    if (OVERLAP_STOPWORDS.has(raw)) continue;
    const stem = keywordStem(raw);
    if (stem.length < 3) continue;
    counts.set(stem, (counts.get(stem) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

export type OverlappingDocument = { conceptId: string; title: string; sharedKeywords: string[]; excerpt: string };

/**
 * Existing articles that cover much the same ground as `text` - used before
 * adding new knowledge so an updated policy lands as an update to the old
 * article instead of a second, contradicting one (the worker would then
 * cite whichever ranks higher). Keyword overlap rather than full-text
 * search, since the question is "same topic?", not "matches this query?".
 */
export async function findOverlappingDocuments(organizationId: string, text: string): Promise<OverlappingDocument[]> {
  const keywords = keywordSet(text, 15);
  if (keywords.length < 4) return [];
  const docs = await db
    .select({ conceptId: knowledgeDocuments.conceptId, title: knowledgeDocuments.title, body: knowledgeDocuments.body })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.organizationId, organizationId));
  const overlaps: OverlappingDocument[] = [];
  for (const doc of docs) {
    const present = new Set(keywordSet(`${doc.title} ${doc.body}`, 400));
    const shared = keywords.filter((word) => present.has(word));
    if (shared.length >= 4 && shared.length / keywords.length >= 0.3) {
      overlaps.push({
        conceptId: doc.conceptId,
        title: doc.title,
        sharedKeywords: shared,
        excerpt: doc.body.length > 1200 ? `${doc.body.slice(0, 1200)}…` : doc.body,
      });
    }
  }
  return overlaps.sort((a, b) => b.sharedKeywords.length - a.sharedKeywords.length).slice(0, 3);
}
