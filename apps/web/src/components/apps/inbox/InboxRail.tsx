"use client";
import React from "react";
import { PlusIcon } from "@/icons";
import { FolderId, LabelId, LABEL_META } from "./inboxData";

interface RailFolder {
  id: FolderId;
  name: string;
  count?: number;
}

interface InboxRailProps {
  activeFolder: FolderId;
  onFolderChange: (folder: FolderId) => void;
  activeLabel: LabelId | null;
  onLabelChange: (label: LabelId | null) => void;
  onCompose: () => void;
  counts: Partial<Record<FolderId, number>>;
}

const FOLDERS: { id: FolderId; name: string }[] = [
  { id: "inbox", name: "Inbox" },
  { id: "starred", name: "Starred" },
  { id: "snoozed", name: "Snoozed" },
  { id: "sent", name: "Sent" },
  { id: "drafts", name: "Drafts" },
  { id: "archive", name: "Archive" },
  { id: "trash", name: "Trash" },
];

const LABEL_IDS: LabelId[] = ["clients", "agents", "billing", "internal"];

export default function InboxRail({
  activeFolder,
  onFolderChange,
  activeLabel,
  onLabelChange,
  onCompose,
  counts,
}: InboxRailProps) {
  const folders: RailFolder[] = FOLDERS.map((f) => ({
    ...f,
    count: counts[f.id],
  }));

  return (
    <aside className="w-full shrink-0 rounded-2xl border border-gray-200 bg-white p-4 lg:w-56 lg:self-start xl:w-60 dark:border-gray-800 dark:bg-white/[0.03]">
      <button
        onClick={onCompose}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-theme-xs transition-colors duration-150 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500/50 lg:w-full"
      >
        <PlusIcon className="size-4" />
        Compose
      </button>

      <nav className="mt-4">
        <ul className="flex flex-wrap gap-1 lg:flex-col">
          {folders.map((f) => {
            const active = activeFolder === f.id;
            return (
              <li key={f.id} className="lg:w-full">
                <button
                  onClick={() => onFolderChange(f.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 ${
                    active
                      ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                      : "font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  {f.name}
                  {typeof f.count === "number" && f.count > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        active
                          ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400"
                          : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                      }`}
                    >
                      {f.count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
        <p className="px-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Labels
        </p>
        <ul className="mt-2 flex flex-wrap gap-1 lg:flex-col">
          {LABEL_IDS.map((id) => {
            const meta = LABEL_META[id];
            const active = activeLabel === id;
            return (
              <li key={id} className="lg:w-full">
                <button
                  onClick={() => onLabelChange(active ? null : id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 ${
                    active
                      ? "bg-gray-100 font-medium text-gray-800 dark:bg-white/[0.06] dark:text-white/90"
                      : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} />
                  {meta.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
