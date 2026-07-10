"use client";

import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import FileInput from "@/components/form/input/FileInput";
import { CheckCircleIcon, DocsIcon, PlusIcon, TrashBinIcon } from "@/icons";
import { API_URL, apiFetch, KnowledgeDocument } from "@/lib/mike-api";
import { useEffect, useMemo, useState } from "react";

type IngestResult = { filename: string; ok: boolean; error?: string; document?: KnowledgeDocument };

export default function KnowledgeManager() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    apiFetch<KnowledgeDocument[]>("/knowledge").then((data) => setDocuments(data)).catch(() => undefined);
  }, []);

  const visible = useMemo(() => documents.filter((document) => `${document.title} ${document.description} ${document.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [documents, query]);

  async function upload() {
    if (!files.length) return;
    setUploading(true);
    setNotice("");
    setNoticeError(false);
    try {
      const form = new FormData();
      files.forEach((item) => form.append("files", item));
      const response = await fetch(`${API_URL}/api/v1/knowledge/ingest-files`, { method: "POST", body: form });
      if (!response.ok) throw new Error(await response.text());
      const results = (await response.json()) as IngestResult[];
      const ingested = results.filter((result) => result.ok && result.document).map((result) => result.document as KnowledgeDocument);
      const failed = results.filter((result) => !result.ok);
      if (ingested.length) {
        setDocuments((items) => {
          const fresh = new Map(items.map((item) => [item.id, item]));
          ingested.forEach((document) => fresh.set(document.id, document));
          return Array.from(fresh.values());
        });
      }
      setFiles([]);
      setNoticeError(failed.length > 0);
      setNotice(
        failed.length
          ? `${ingested.length} ingested, ${failed.length} failed: ${failed.map((result) => `${result.filename} (${result.error})`).join("; ")}`
          : `${ingested.length} ${ingested.length === 1 ? "document is" : "documents are"} ready for Mike.`
      );
    } catch (error) {
      setNoticeError(true);
      setNotice(error instanceof Error ? `Upload failed: ${error.message}` : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(document: KnowledgeDocument) {
    setDocuments((items) => items.filter((item) => item.id !== document.id));
    try { await apiFetch(`/knowledge/${document.id}`, { method: "DELETE" }); } catch { setNotice("Removed from this preview. Start the API to persist changes."); }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Knowledge</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Approved product knowledge Mike can use in customer replies.</p></div>
        <Badge size="sm" color="success" startIcon={<CheckCircleIcon className="size-3.5" />}>{documents.length} concepts ready</Badge>
      </div>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] md:gap-6">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Knowledge library</h2><p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">OKF v0.1 concept documents indexed in PostgreSQL</p></div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search knowledge…" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90 sm:w-60" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {visible.map((document) => (
              <article key={document.id} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center md:px-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/10 dark:text-blue-light-400"><DocsIcon className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{document.title}</h3><Badge size="sm" color="light">{document.type}</Badge></div>
                  <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{document.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"><code className="font-mono">{document.concept_id}</code><span>·</span><span>{document.chunk_count} chunks</span>{document.tags.map((tag) => <span key={tag} className="rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-white/5">{tag}</span>)}</div>
                </div>
                <div className="flex items-center gap-3"><Badge size="sm" color="success">Ready</Badge><button onClick={() => remove(document)} aria-label={`Delete ${document.title}`} className="flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-500/10"><TrashBinIcon className="size-4" /></button></div>
              </article>
            ))}
            {!visible.length && <div className="px-6 py-12 text-center text-sm text-gray-500">{query ? "No knowledge matches your search." : "No knowledge yet. Upload an OKF concept document to get Mike started."}</div>}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"><PlusIcon className="size-5" /></span>
            <h2 className="mt-4 text-base font-semibold text-gray-800 dark:text-white/90">Add knowledge</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">Upload one or more PDF, Markdown, or text files. PDFs and text are auto-converted; Markdown must pass OKF validation.</p>
            <div className="mt-4"><FileInput multiple accept=".pdf,.md,.markdown,.txt,.text" onChange={(event) => setFiles(Array.from(event.target.files || []))} /></div>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((item) => <li key={item.name} className="truncate text-xs text-gray-500">{item.name}</li>)}
              </ul>
            )}
            {notice && <p className={`mt-3 text-xs ${noticeError ? "text-error-600" : "text-success-600"}`}>{notice}</p>}
            <Button className="mt-4 w-full" loading={uploading} disabled={!files.length} onClick={upload}>{files.length > 1 ? `Validate and ingest ${files.length} files` : "Validate and ingest"}</Button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">OKF minimum</h2>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 p-4 font-mono text-[11px] leading-5 text-gray-200">{`---\ntype: Product Guide\ntitle: Product name\ndescription: One-line summary\ntags: [setup, support]\n---\n# Setup\nApproved guidance goes here.`}</pre>
            <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">Keep one concept per file. Use headings for better chunks and cite source URLs when claims come from external material.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}

