"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AutoGrowTextarea from "@/components/aix/AutoGrowTextarea";
import Markdown from "@/components/worker/Markdown";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  AlertIcon,
  ChevronDownIcon,
  DocsIcon,
  FileIcon,
  PlusIcon,
  TrashBinIcon,
} from "@/icons";
import { apiFetch, KnowledgeDocument, WorkerApiError } from "@/lib/worker-api";

/**
 * Knowledge base.
 *
 * Two ways in, because they are genuinely different jobs: uploading material
 * that already exists (PDF, Markdown, text), and writing a short doc by hand
 * that never existed as a file. Both end up in the same place — one OKF
 * concept document, indexed for retrieval.
 *
 * Uploading is the primary path, so it accepts a drop anywhere on the library
 * panel as well as through the picker. Ingestion is per file and partial
 * success is normal — five files where two fail is a real outcome, so results
 * are reported per file rather than collapsed into one pass/fail.
 *
 * A knowledge doc is a real document, not a short skill snippet — content has
 * no length cap (R7). View and Edit are therefore near-full-screen panels,
 * not small centered dialogs; a multi-page policy or onboarding guide needs
 * room to actually read and edit, not a cramped box.
 */

type IngestResult = { filename: string; ok: boolean; error?: string; document?: KnowledgeDocument };

const ACCEPT = ".pdf,.md,.markdown,.txt,.text";
const PANEL_CLASS = "m-4 w-full max-w-5xl overflow-hidden bg-white p-0 dark:bg-gray-900";

/** The doc id a title becomes, mirroring the server's own slugify. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export default function WorkerKnowledge() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<IngestResult[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [conceptId, setConceptId] = useState("");
  const [conceptTouched, setConceptTouched] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [composeError, setComposeError] = useState("");

  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  useEffect(() => {
    apiFetch<KnowledgeDocument[]>("/knowledge")
      .then(setDocuments)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () =>
      documents.filter((document) =>
        `${document.title} ${document.description ?? ""} ${document.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [documents, query],
  );

  const viewing = documents.find((item) => item.id === viewingId) ?? null;

  const addFiles = useCallback((incoming: File[]) => {
    if (!incoming.length) return;
    setResults([]);
    // De-duplicated by name so dropping the same file twice does not queue it
    // twice — the second would only overwrite the first on the server anyway.
    setFiles((current) => {
      const seen = new Set(current.map((file) => file.name));
      return [...current, ...incoming.filter((file) => !seen.has(file.name))];
    });
    setUploadOpen(true);
  }, []);

  function openUpload() {
    setResults([]);
    setUploadOpen(true);
  }

  function closeUpload() {
    setUploadOpen(false);
    setFiles([]);
    setResults([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function openCompose() {
    setEditingId(null);
    setTitle("");
    setConceptId("");
    setConceptTouched(false);
    setContent("");
    setComposeError("");
    setComposeOpen(true);
  }

  function openEdit(document: KnowledgeDocument) {
    setViewingId(null);
    setEditingId(document.id);
    setTitle(document.title);
    setConceptId(document.conceptId);
    setConceptTouched(true);
    setContent(document.body);
    setComposeError("");
    setComposeOpen(true);
  }

  function closeCompose() {
    setComposeOpen(false);
    setEditingId(null);
  }

  async function upload() {
    if (!files.length) return;
    setUploading(true);
    setNotice("");
    setNoticeError(false);
    try {
      const form = new FormData();
      files.forEach((item) => form.append("files", item));
      const ingested = await apiFetch<IngestResult[]>("/knowledge/ingest-files", {
        method: "POST",
        body: form,
      });
      setResults(ingested);

      const added = ingested
        .filter((result) => result.ok && result.document)
        .map((result) => result.document as KnowledgeDocument);
      const failed = ingested.filter((result) => !result.ok);

      if (added.length) {
        setDocuments((items) => {
          // Re-ingesting an existing concept replaces it rather than adding a
          // duplicate row, so merge by id.
          const fresh = new Map(items.map((item) => [item.id, item]));
          added.forEach((document) => fresh.set(document.id, document));
          return Array.from(fresh.values());
        });
      }

      // Only the files that failed stay queued, so "try again" means the ones
      // that actually need trying again.
      setFiles(files.filter((file) => failed.some((result) => result.filename === file.name)));
      if (inputRef.current) inputRef.current.value = "";

      if (!failed.length) {
        setNoticeError(false);
        setNotice(`${added.length} ${added.length === 1 ? "document is" : "documents are"} ready.`);
        closeUpload();
      }
    } catch (error) {
      setResults([]);
      setNoticeError(true);
      setNotice(
        error instanceof WorkerApiError
          ? `Upload failed: ${error.message}`
          : "Upload failed. Check that the API is running.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function saveDoc() {
    if (!title.trim() || !content.trim()) {
      setComposeError("A title and some content are both required.");
      return;
    }
    setSaving(true);
    setComposeError("");
    try {
      const document = editingId
        ? await apiFetch<KnowledgeDocument>(`/knowledge/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify({ title: title.trim(), content }),
          })
        : await apiFetch<KnowledgeDocument>("/knowledge", {
            method: "POST",
            body: JSON.stringify({
              conceptId: (conceptTouched ? conceptId : slugify(title)).trim(),
              title: title.trim(),
              content,
            }),
          });
      setDocuments((items) => [document, ...items.filter((item) => item.id !== document.id)]);
      closeCompose();
      setNoticeError(false);
      setNotice(editingId ? `“${document.title}” updated.` : `“${document.title}” is ready.`);
    } catch (error) {
      setComposeError(
        error instanceof WorkerApiError
          ? error.message
          : "Could not save. Check that the API is running.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(document: KnowledgeDocument) {
    const previous = documents;
    setDocuments((items) => items.filter((item) => item.id !== document.id));
    try {
      await apiFetch(`/knowledge/${document.id}`, { method: "DELETE" });
    } catch {
      // Put it back rather than leaving the screen claiming a deletion that
      // did not happen.
      setDocuments(previous);
      setNoticeError(true);
      setNotice("Could not delete on the server.");
    }
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files || []));
  }

  const derivedConceptId = conceptTouched ? conceptId : slugify(title);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Knowledge base
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Approved reference material this worker reads when it answers. Every doc is indexed for
            search and cited back in replies, so what goes in here is what it is allowed to claim.
          </p>
        </div>
        {!loading && documents.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" startIcon={<FileIcon className="size-4" />} onClick={openUpload}>
              Upload files
            </Button>
            <Button size="sm" startIcon={<PlusIcon className="size-4" />} onClick={openCompose}>
              New doc
            </Button>
          </div>
        )}
      </div>

      {notice && (
        <p
          className={`text-sm font-medium ${
            noticeError ? "text-error-600 dark:text-error-400" : "text-success-600 dark:text-success-400"
          }`}
        >
          {notice}
        </p>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative overflow-hidden rounded-2xl border bg-white transition-colors dark:bg-white/[0.03] ${
          dragging
            ? "border-brand-500 ring-2 ring-brand-500/20"
            : "border-gray-200 dark:border-gray-800"
        }`}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-brand-50/90 dark:bg-brand-500/10">
            <p className="text-sm font-medium text-brand-700 dark:text-brand-400">
              Drop to add to the knowledge base
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Library</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {documents.length === 0
                ? "Nothing indexed yet"
                : `${documents.length} ${documents.length === 1 ? "doc" : "docs"} indexed with Postgres full-text search`}
            </p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search knowledge…"
            aria-label="Search knowledge"
            className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90 sm:w-64"
          />
        </div>

        {loading ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-4 px-4 py-4 md:px-6">
                <div className="size-10 shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
                <div className="min-w-0 flex-1">
                  <div className="h-3.5 w-40 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
                  <div className="mt-2 h-3 w-64 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800/70" />
                </div>
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <DocsIcon className="size-6" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-gray-800 dark:text-white/90">
              No knowledge yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
              Add the playbooks, policies and reference material this worker should know. Drop
              files anywhere on this panel, or start with a short doc written by hand.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button size="sm" variant="outline" startIcon={<FileIcon className="size-4" />} onClick={openUpload}>
                Upload files
              </Button>
              <Button size="sm" startIcon={<PlusIcon className="size-4" />} onClick={openCompose}>
                Create the first doc
              </Button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            No knowledge matches “{query}”.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {visible.map((document) => (
              <article
                key={document.id}
                className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center md:px-6"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/10 dark:text-blue-light-400">
                  <DocsIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    {document.title}
                  </h3>
                  <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                    {document.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <code className="font-mono">{document.conceptId}</code>
                    {document.tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-white/5">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setViewingId(document.id)}>
                    View
                  </Button>
                  <button
                    onClick={() => remove(document)}
                    aria-label={`Delete ${document.title}`}
                    className="flex size-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-500/10"
                  >
                    <TrashBinIcon className="size-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <button
          onClick={() => setGuideOpen((open) => !open)}
          className="flex w-full items-center justify-between px-5 py-3 text-left md:px-6"
        >
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Formatting guide: what to add and the OKF frontmatter format
          </span>
          <ChevronDownIcon
            className={`size-4 shrink-0 text-gray-400 transition-transform ${guideOpen ? "rotate-180" : ""}`}
          />
        </button>
        {guideOpen && (
          <div className="grid grid-cols-1 gap-5 border-t border-gray-200 p-5 dark:border-gray-800 md:grid-cols-2 md:p-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">What to add</h3>
              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                PDF, Markdown and plain text. PDFs and text are wrapped into a concept document
                automatically; Markdown that already carries OKF frontmatter is ingested as written.
              </p>
              <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
                Keep one concept per doc and use headings. Retrieval works on chunks, and a doc that
                covers six things answers none of them cleanly.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">OKF minimum</h3>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 p-4 font-mono text-[11px] leading-5 text-gray-200">{`---\ntype: reference\ntitle: Concept name\ndescription: One-line summary\ntags: [setup, support]\n---\n# Setup\nApproved guidance goes here.`}</pre>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={uploadOpen}
        onClose={closeUpload}
        ariaLabel="Upload knowledge files"
        className="m-4 w-full max-w-xl rounded-2xl bg-white p-6 dark:bg-gray-900"
      >
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Upload files</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          PDF, Markdown or text. Each file becomes one concept document.
        </p>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`mt-5 cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging
              ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
              : "border-gray-300 hover:border-brand-400 dark:border-gray-700"
          }`}
        >
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400">
            <FileIcon className="size-5" />
          </span>
          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            Drop files here, or click to choose
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            PDF, MD, TXT. Several at once is fine
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => addFiles(Array.from(event.target.files || []))}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-4 max-h-40 space-y-1.5 overflow-y-auto">
            {files.map((file) => (
              <li
                key={file.name}
                className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5"
              >
                <span className="truncate text-xs text-gray-700 dark:text-gray-300">{file.name}</span>
                <button
                  onClick={() => setFiles((current) => current.filter((item) => item.name !== file.name))}
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 text-xs font-medium text-gray-400 transition-colors hover:text-error-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {results.some((result) => !result.ok) && (
          <ul className="mt-4 space-y-1.5">
            {results
              .filter((result) => !result.ok)
              .map((result) => (
                <li
                  key={result.filename}
                  className="flex items-start gap-2 text-xs leading-5 text-error-600 dark:text-error-400"
                >
                  <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="font-medium">{result.filename}</span>: {result.error}
                  </span>
                </li>
              ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button size="sm" variant="outline" onClick={closeUpload}>
            Cancel
          </Button>
          <Button size="sm" loading={uploading} disabled={!files.length} onClick={() => void upload()}>
            {files.length > 1 ? `Ingest ${files.length} files` : "Ingest"}
          </Button>
        </div>
      </Modal>

      {/* View: near-full-screen, not a small dialog — a knowledge doc has no
          length cap, so it needs room to actually read. */}
      <Modal
        isOpen={Boolean(viewing)}
        onClose={() => setViewingId(null)}
        ariaLabel={viewing ? `View ${viewing.title}` : "View document"}
        className={`${PANEL_CLASS} rounded-2xl`}
      >
        {viewing && (
          <div className="flex h-[85vh] flex-col">
            <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-16 dark:border-gray-800 sm:px-8">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{viewing.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <code className="font-mono">{viewing.conceptId}</code>
                {viewing.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-white/5">
                    {tag}
                  </span>
                ))}
                <span>&middot;</span>
                <span>Added {relativeDate(viewing.createdAt)}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 text-gray-700 dark:text-gray-300 sm:px-8">
              <Markdown>{viewing.body}</Markdown>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800 sm:px-8">
              <Button size="sm" variant="outline" onClick={() => setViewingId(null)}>
                Close
              </Button>
              <Button size="sm" onClick={() => openEdit(viewing)}>
                Edit
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* New doc / Edit doc share this same panel — Edit just pre-fills it
          and locks the doc id, since that's what the worker's own citations
          point at. Same near-full-screen sizing as View, for the same
          reason: this is a real document, not a short snippet. */}
      <Modal
        isOpen={composeOpen}
        onClose={closeCompose}
        ariaLabel={editingId ? "Edit knowledge doc" : "Write a knowledge doc"}
        className={`${PANEL_CLASS} rounded-2xl`}
      >
        <div className="flex h-[85vh] flex-col">
          <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-16 dark:border-gray-800 sm:px-8">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {editingId ? "Edit doc" : "New doc"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {editingId
                ? "Changes save to this concept document and re-index it right away."
                : "For guidance that does not already exist as a file. It is wrapped as an OKF concept document and indexed straight away."}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Refund policy"
                  className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
                />
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Doc id
                <input
                  value={derivedConceptId}
                  disabled={Boolean(editingId)}
                  onChange={(event) => {
                    setConceptTouched(true);
                    setConceptId(slugify(event.target.value));
                  }}
                  placeholder="refund-policy"
                  className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 font-mono text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:text-white/90 dark:disabled:bg-white/5"
                />
                <span className="mt-1.5 block text-xs font-normal text-gray-500">
                  {editingId
                    ? "Locked. The worker's citations point at this id."
                    : "Follows the title. Reusing an id replaces that doc."}
                </span>
              </label>
            </div>

            <label className="mt-4 flex h-full min-h-[320px] flex-col text-sm font-medium text-gray-700 dark:text-gray-300">
              Content
              <AutoGrowTextarea
                minRows={12}
                maxRows={9999}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={"# Refunds\nRefunds are issued within 14 days of purchase…"}
                className="mt-2 w-full flex-1 resize-none rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 font-mono text-xs leading-5 text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
              />
              <span className="mt-1.5 block text-xs font-normal text-gray-500">
                Markdown. Use headings. They become the retrieval chunks.
              </span>
            </label>

            {composeError && (
              <p className="mt-3 text-xs font-medium leading-5 text-error-600 dark:text-error-400">
                {composeError}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800 sm:px-8">
            <Button size="sm" variant="outline" onClick={closeCompose}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={saving}
              disabled={!title.trim() || !content.trim()}
              onClick={() => void saveDoc()}
            >
              {editingId ? "Save changes" : "Create doc"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
