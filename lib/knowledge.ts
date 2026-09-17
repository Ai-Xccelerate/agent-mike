import { createHash } from "crypto";
import matter from "gray-matter";
import { and, eq, sql } from "drizzle-orm";
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
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;
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
