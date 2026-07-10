from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass

import frontmatter
from pypdf import PdfReader
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import KnowledgeChunk, KnowledgeDocument

MARKDOWN_EXTENSIONS = {"md", "markdown"}
TEXT_EXTENSIONS = {"txt", "text"}


class InvalidOKFDocument(ValueError):
    pass


def _strip_nul(value: str) -> str:
    # PostgreSQL text columns reject NUL bytes; extracted PDF text can contain them.
    return value.replace("\x00", "")


@dataclass
class RetrievedChunk:
    document_id: str
    concept_id: str
    title: str
    content: str
    heading: str | None
    resource: str | None
    score: float

    def citation(self) -> dict:
        return {
            "document_id": self.document_id,
            "concept_id": self.concept_id,
            "title": self.title,
            "heading": self.heading,
            "resource": self.resource,
        }


def split_markdown(body: str, max_chars: int = 1800) -> list[tuple[str | None, str]]:
    sections: list[tuple[str | None, str]] = []
    heading: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer
        raw = "\n".join(buffer).strip()
        while raw:
            if len(raw) <= max_chars:
                sections.append((heading, raw))
                break
            cut = raw.rfind("\n\n", 0, max_chars)
            if cut < max_chars // 2:
                cut = raw.rfind(". ", 0, max_chars)
            if cut < max_chars // 2:
                cut = max_chars
            sections.append((heading, raw[:cut].strip()))
            raw = raw[cut:].strip()
        buffer = []

    for line in body.splitlines():
        match = re.match(r"^#{1,4}\s+(.+)$", line)
        if match:
            flush()
            heading = match.group(1).strip()
        else:
            buffer.append(line)
    flush()
    return sections or [(None, body.strip())]


async def ingest_okf(
    db: AsyncSession, content: str, concept_id: str, source_path: str | None = None
) -> KnowledgeDocument:
    try:
        parsed = frontmatter.loads(content)
    except Exception as exc:
        raise InvalidOKFDocument("The file does not contain valid YAML frontmatter.") from exc

    concept_type = str(parsed.metadata.get("type", "")).strip()
    if not concept_type:
        raise InvalidOKFDocument("OKF concept documents require a non-empty 'type' field.")
    if concept_id.endswith(".md"):
        concept_id = concept_id[:-3]
    concept_id = concept_id.strip("/")
    if not concept_id or concept_id.endswith(("index", "log")):
        raise InvalidOKFDocument("Use a concept path, not the reserved index.md or log.md name.")

    checksum = hashlib.sha256(content.encode("utf-8")).hexdigest()
    existing = await db.scalar(
        select(KnowledgeDocument)
        .options(selectinload(KnowledgeDocument.chunks))
        .where(KnowledgeDocument.concept_id == concept_id)
    )
    if existing and existing.checksum == checksum:
        return existing
    if existing:
        await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == existing.id))
        document = existing
    else:
        document = KnowledgeDocument(concept_id=concept_id, type=concept_type, title="", body="", checksum="")
        db.add(document)

    document.type = concept_type
    document.title = _strip_nul(str(parsed.metadata.get("title") or concept_id.rsplit("/", 1)[-1].replace("-", " ").title()))
    document.description = _strip_nul(str(parsed.metadata["description"])) if parsed.metadata.get("description") else None
    document.resource = parsed.metadata.get("resource")
    document.tags = [str(tag) for tag in (parsed.metadata.get("tags") or [])]
    document.source_timestamp = str(parsed.metadata.get("timestamp") or "") or None
    document.source_path = source_path
    document.body = _strip_nul(parsed.content).strip()
    document.checksum = checksum
    document.status = "ready"
    await db.flush()

    for position, (heading, chunk_content) in enumerate(split_markdown(document.body)):
        db.add(
            KnowledgeChunk(
                document_id=document.id,
                position=position,
                heading=heading,
                content=chunk_content,
            )
        )
    await db.commit()
    return await db.scalar(
        select(KnowledgeDocument)
        .options(selectinload(KnowledgeDocument.chunks))
        .where(KnowledgeDocument.id == document.id)
    )


def _split_filename(filename: str) -> tuple[str, str]:
    name = (filename or "document").rsplit("/", 1)[-1]
    if "." in name:
        stem, ext = name.rsplit(".", 1)
        return stem, ext.lower()
    return name, ""


def _concept_id_from_name(stem: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return slug or "document"


def _title_from_name(stem: str) -> str:
    words = re.sub(r"[_\-]+", " ", stem).strip()
    return words.title() if words else "Untitled Document"


def _extract_pdf_text(raw: bytes) -> str:
    reader = PdfReader(io.BytesIO(raw))
    return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()


async def ingest_upload(db: AsyncSession, filename: str, raw: bytes) -> KnowledgeDocument:
    stem, ext = _split_filename(filename)
    concept_id = _concept_id_from_name(stem)

    if ext in MARKDOWN_EXTENSIONS:
        return await ingest_okf(db, raw.decode("utf-8", errors="replace"), concept_id, filename)

    if ext == "pdf":
        body = _extract_pdf_text(raw)
        if not body:
            raise InvalidOKFDocument(
                "No extractable text found. The PDF may be scanned images rather than text."
            )
    elif ext in TEXT_EXTENSIONS:
        body = raw.decode("utf-8", errors="replace").strip()
        if not body:
            raise InvalidOKFDocument("The file is empty.")
    else:
        raise InvalidOKFDocument(
            f"Unsupported file type '.{ext}'. Upload PDF, Markdown (.md), or text (.txt)."
        )

    title = _title_from_name(stem).replace('"', "'")
    content = f'---\ntype: Reference Document\ntitle: "{title}"\ntags: []\n---\n\n{body}'
    return await ingest_okf(db, content, concept_id, filename)


async def retrieve(db: AsyncSession, query: str, limit: int = 5) -> list[RetrievedChunk]:
    dialect = db.bind.dialect.name if db.bind else ""
    if dialect == "postgresql":
        # Match ANY query term (OR), not all (AND): flip websearch_to_tsquery's `&`
        # operators to `|` so vocabulary mismatches ("create a user" vs "add a new
        # counselor") still surface the relevant docs. ts_rank_cd keeps precision by
        # ranking chunks that match more terms higher. Title + tags are indexed too.
        statement = text(
            """
            WITH q AS (
                SELECT NULLIF(replace(websearch_to_tsquery('english', :query)::text, '&', '|'), '')::tsquery AS tsq
            )
            SELECT kc.id, kc.document_id, kc.heading, kc.content,
                   kd.concept_id, kd.title, kd.resource,
                   ts_rank_cd(
                     to_tsvector('english', coalesce(kd.title, '') || ' ' || coalesce(kd.tags::text, '') || ' ' || coalesce(kc.heading, '') || ' ' || kc.content),
                     q.tsq
                   ) AS score
            FROM knowledge_chunks kc
            JOIN knowledge_documents kd ON kd.id = kc.document_id
            CROSS JOIN q
            WHERE q.tsq IS NOT NULL
              AND to_tsvector('english', coalesce(kd.title, '') || ' ' || coalesce(kd.tags::text, '') || ' ' || coalesce(kc.heading, '') || ' ' || kc.content)
                  @@ q.tsq
            ORDER BY score DESC, kc.position ASC
            LIMIT :limit
            """
        )
        rows = (await db.execute(statement, {"query": query, "limit": limit})).mappings()
        return [RetrievedChunk(**{key: row[key] for key in RetrievedChunk.__dataclass_fields__}) for row in rows]

    # Development fallback for SQLite. Production uses PostgreSQL FTS above.
    rows = (
        await db.execute(
            select(KnowledgeChunk, KnowledgeDocument)
            .join(KnowledgeDocument, KnowledgeChunk.document_id == KnowledgeDocument.id)
            .limit(300)
        )
    ).all()
    terms = {term for term in re.findall(r"[a-z0-9]+", query.lower()) if len(term) > 2}
    ranked: list[RetrievedChunk] = []
    for chunk, document in rows:
        haystack = f"{chunk.heading or ''} {chunk.content} {document.title} {' '.join(document.tags)}".lower()
        matches = sum(1 for term in terms if term in haystack)
        if matches:
            ranked.append(
                RetrievedChunk(
                    document_id=document.id,
                    concept_id=document.concept_id,
                    title=document.title,
                    content=chunk.content,
                    heading=chunk.heading,
                    resource=document.resource,
                    score=matches / max(len(terms), 1),
                )
            )
    return sorted(ranked, key=lambda item: item.score, reverse=True)[:limit]

