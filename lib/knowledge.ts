import { createHash, randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import matter from "gray-matter";
import { db } from "@/lib/db";
import { knowledgeChunks, knowledgeDocuments } from "@/db/schema";
import { splitMarkdown } from "@/lib/knowledge-split";

export { splitMarkdown };

export class InvalidOKFDocument extends Error {}

export type RetrievedChunk = {
  document_id: string;
  concept_id: string;
  title: string;
  content: string;
  heading: string | null;
  resource: string | null;
  score: number;
};

function stripNul(value: string) {
  return value.replace(/\x00/g, "");
}

export async function ingestOkf(
  organizationId: string,
  content: string,
  conceptId: string,
  sourcePath?: string | null,
) {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(content);
  } catch {
    throw new InvalidOKFDocument("The file does not contain valid YAML frontmatter.");
  }
  const conceptType = String(parsed.data.type ?? "").trim();
  if (!conceptType) {
    throw new InvalidOKFDocument("OKF concept documents require a non-empty 'type' field.");
  }
  conceptId = conceptId.replace(/\.md$/, "").replace(/^\/+|\/+$/g, "");
  if (!conceptId || conceptId.endsWith("index") || conceptId.endsWith("log")) {
    throw new InvalidOKFDocument("Use a concept path, not the reserved index.md or log.md name.");
  }

  const checksum = createHash("sha256").update(content).digest("hex");
  const [existing] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.organizationId, organizationId),
        eq(knowledgeDocuments.conceptId, conceptId),
      ),
    )
    .limit(1);

  if (existing && existing.checksum === checksum) return existing;

  const title = stripNul(
    String(parsed.data.title || conceptId.split("/").pop()?.replace(/-/g, " ") || conceptId),
  );
  const body = stripNul(parsed.content).trim();
  const tags = Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : [];
  const documentId = existing?.id ?? randomUUID();

  if (existing) {
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, existing.id));
    await db
      .update(knowledgeDocuments)
      .set({
        type: conceptType,
        title,
        description: parsed.data.description ? stripNul(String(parsed.data.description)) : null,
        resource: parsed.data.resource ? String(parsed.data.resource) : null,
        tags,
        sourceTimestamp: parsed.data.timestamp ? String(parsed.data.timestamp) : null,
        sourcePath: sourcePath ?? null,
        body,
        checksum,
        status: "ready",
      })
      .where(eq(knowledgeDocuments.id, existing.id));
  } else {
    await db.insert(knowledgeDocuments).values({
      id: documentId,
      organizationId,
      conceptId,
      type: conceptType,
      title,
      description: parsed.data.description ? stripNul(String(parsed.data.description)) : null,
      resource: parsed.data.resource ? String(parsed.data.resource) : null,
      tags,
      sourcePath: sourcePath ?? null,
      body,
      checksum,
      status: "ready",
      sourceTimestamp: parsed.data.timestamp ? String(parsed.data.timestamp) : null,
    });
  }

  const chunks = splitMarkdown(body);
  if (chunks.length) {
    await db.insert(knowledgeChunks).values(
      chunks.map(([heading, chunkContent], position) => ({
        id: randomUUID(),
        documentId,
        position,
        heading,
        content: chunkContent,
      })),
    );
  }

  const [saved] = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, documentId))
    .limit(1);
  return saved;
}

function splitFilename(filename: string): [string, string] {
  const name = (filename || "document").split("/").pop() || "document";
  if (name.includes(".")) {
    const cut = name.lastIndexOf(".");
    return [name.slice(0, cut), name.slice(cut + 1).toLowerCase()];
  }
  return [name, ""];
}

function conceptIdFromName(stem: string) {
  const slug = stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "document";
}

function titleFromName(stem: string) {
  const words = stem.replace(/[_-]+/g, " ").trim();
  return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : "Untitled Document";
}

async function extractPdfText(raw: Buffer) {
  const pdf = (await import("pdf-parse")).default as (buf: Buffer) => Promise<{ text: string }>;
  const parsed = await pdf(raw);
  return (parsed.text || "").trim();
}

export async function ingestUpload(organizationId: string, filename: string, raw: Buffer) {
  const [stem, ext] = splitFilename(filename);
  const conceptId = conceptIdFromName(stem);
  const markdownExt = new Set(["md", "markdown"]);
  const textExt = new Set(["txt", "text"]);

  if (markdownExt.has(ext)) {
    return ingestOkf(organizationId, raw.toString("utf8"), conceptId, filename);
  }

  let body: string;
  if (ext === "pdf") {
    body = await extractPdfText(raw);
    if (!body) {
      throw new InvalidOKFDocument(
        "No extractable text found. The PDF may be scanned images rather than text.",
      );
    }
  } else if (textExt.has(ext)) {
    body = raw.toString("utf8").trim();
    if (!body) throw new InvalidOKFDocument("The file is empty.");
  } else {
    throw new InvalidOKFDocument(
      `Unsupported file type '.${ext}'. Upload PDF, Markdown (.md), or text (.txt).`,
    );
  }

  const title = titleFromName(stem).replace(/"/g, "'");
  const content = `---\ntype: Reference Document\ntitle: "${title}"\ntags: []\n---\n\n${body}`;
  return ingestOkf(organizationId, content, conceptId, filename);
}

export async function retrieve(organizationId: string, query: string, limit = 5): Promise<RetrievedChunk[]> {
  const result = await db.execute(sql`
    WITH q AS (
      SELECT NULLIF(replace(websearch_to_tsquery('english', ${query})::text, '&', '|'), '')::tsquery AS tsq
    )
    SELECT kc.document_id, kc.heading, kc.content,
           kd.concept_id, kd.title, kd.resource,
           ts_rank_cd(
             to_tsvector('english', coalesce(kd.title, '') || ' ' || coalesce(kd.tags::text, '') || ' ' || coalesce(kc.heading, '') || ' ' || kc.content),
             q.tsq
           ) AS score
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    CROSS JOIN q
    WHERE kd.organization_id = ${organizationId}
      AND q.tsq IS NOT NULL
      AND to_tsvector('english', coalesce(kd.title, '') || ' ' || coalesce(kd.tags::text, '') || ' ' || coalesce(kc.heading, '') || ' ' || kc.content)
          @@ q.tsq
    ORDER BY score DESC, kc.position ASC
    LIMIT ${limit}
  `);

  const rows = (
    Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  ) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    document_id: String(row.document_id),
    concept_id: String(row.concept_id),
    title: String(row.title),
    content: String(row.content),
    heading: row.heading ? String(row.heading) : null,
    resource: row.resource ? String(row.resource) : null,
    score: Number(row.score) || 0,
  }));
}
