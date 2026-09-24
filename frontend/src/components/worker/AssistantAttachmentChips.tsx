"use client";

import { CloseLineIcon, FileIcon } from "@/icons";
import type { AttachmentIntent, MessageAttachment } from "@/lib/worker-api";

export const ATTACHMENT_INTENT_LABELS: Record<AttachmentIntent, string> = {
  context: "Use in this chat",
  knowledge: "Add to knowledge base",
  skill: "Turn into a skill",
};

// Same list as Settings > Knowledge accepts; other files can still be used as chat context.
const KNOWLEDGE_FILE = /\.(pdf|md|markdown|txt|text)$/i;

/** A file picked in the composer, before it's sent. */
export type StagedAttachment = {
  localId: string;
  filename: string;
  intent: AttachmentIntent;
  status: "uploading" | "ready" | "error";
  id?: string;
  error?: string;
  truncated?: boolean;
};

/**
 * Files staged in the composer. Each one carries its own intent picker -
 * one message can mix "read this for context" with "add that to the
 * knowledge base" - and upload errors stay on the chip that caused them.
 */
export function StagedAttachmentChips({
  attachments,
  onIntentChange,
  onRemove,
}: {
  attachments: StagedAttachment[];
  onIntentChange: (localId: string, intent: AttachmentIntent) => void;
  onRemove: (localId: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Attached files">
      {attachments.map((file) => (
        <li
          key={file.localId}
          className={`flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
            file.status === "error"
              ? "border-error-300 bg-error-50 text-error-700 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-400"
              : "border-gray-200 bg-white/70 text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300"
          }`}
        >
          <FileIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 max-w-[12rem] truncate font-medium" title={file.filename}>
            {file.filename}
          </span>
          {file.status === "uploading" && <span className="text-gray-400">Reading…</span>}
          {file.status === "error" && <span className="max-w-[16rem] truncate" title={file.error}>{file.error}</span>}
          {file.status === "ready" && (
            <select
              value={file.intent}
              onChange={(event) => onIntentChange(file.localId, event.target.value as AttachmentIntent)}
              aria-label={`What to do with ${file.filename}`}
              className="rounded-md border border-gray-200 bg-transparent py-0.5 pl-1.5 pr-6 text-xs text-gray-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-gray-300 [&>option]:text-gray-800"
            >
              {(Object.keys(ATTACHMENT_INTENT_LABELS) as AttachmentIntent[]).map((intent) => {
                const unsupported = intent === "knowledge" && !KNOWLEDGE_FILE.test(file.filename);
                return (
                  <option key={intent} value={intent} disabled={unsupported}>
                    {unsupported ? `${ATTACHMENT_INTENT_LABELS[intent]} (PDF, Markdown, or text only)` : ATTACHMENT_INTENT_LABELS[intent]}
                  </option>
                );
              })}
            </select>
          )}
          {file.truncated && <span title="Only the first part of this file was read">Partial</span>}
          <button
            type="button"
            onClick={() => onRemove(file.localId)}
            aria-label={`Remove ${file.filename}`}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <CloseLineIcon className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The files a sent message carried, shown above its bubble. */
export function SentAttachmentChips({ attachments }: { attachments: MessageAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mb-1.5 flex flex-wrap justify-end gap-1.5">
      {attachments.map((file) => (
        <li
          key={file.id}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300"
        >
          <FileIcon className="size-3.5 shrink-0" />
          <span className="max-w-[12rem] truncate font-medium" title={file.filename}>
            {file.filename}
          </span>
          <span className="text-gray-400">· {ATTACHMENT_INTENT_LABELS[file.intent]}</span>
        </li>
      ))}
    </ul>
  );
}
