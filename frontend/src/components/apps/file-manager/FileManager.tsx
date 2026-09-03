"use client";

import React, { useMemo, useState } from "react";
import Button from "@/components/ui/button/Button";
import ProgressBar from "@/components/ui/progress/ProgressBar";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import {
  AudioIcon,
  DocsIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  GroupIcon,
  ListIcon,
  MoreDotIcon,
  PageIcon,
  TrashBinIcon,
  VideoIcon,
} from "@/icons";

type FileType = "doc" | "sheet" | "video" | "audio" | "pdf";
type Section = "all" | "documents" | "media" | "shared" | "trash";

interface FileRow {
  id: number;
  name: string;
  type: FileType;
  size: string;
  modified: string;
  sharedWith: string[];
  section: Exclude<Section, "all">;
}

const files: FileRow[] = [
  { id: 1, name: "AIX outbound playbook v4.docx", type: "doc", size: "1.8 MB", modified: "2 hours ago", sharedWith: ["Rahul Bhavsar", "Maya Chen"], section: "documents" },
  { id: 2, name: "Stark Industries discovery call.mp4", type: "video", size: "412 MB", modified: "Yesterday", sharedWith: ["Maya Chen", "Sam Okafor", "Priya Nair"], section: "media" },
  { id: 3, name: "Q3 pipeline review deck.pdf", type: "pdf", size: "6.4 MB", modified: "Yesterday", sharedWith: ["Rahul Bhavsar"], section: "documents" },
  { id: 4, name: "Pepper routing rules matrix.xlsx", type: "sheet", size: "324 KB", modified: "2 days ago", sharedWith: ["Sam Okafor", "Priya Nair"], section: "shared" },
  { id: 5, name: "Meridian Health kickoff recording.mp3", type: "audio", size: "58 MB", modified: "3 days ago", sharedWith: ["Priya Nair"], section: "media" },
  { id: 6, name: "MSA — Northwind Traders (signed).pdf", type: "pdf", size: "2.1 MB", modified: "Jun 30", sharedWith: ["Rahul Bhavsar", "Maya Chen"], section: "shared" },
  { id: 7, name: "Jules sequence copy — EU localization.docx", type: "doc", size: "940 KB", modified: "Jun 28", sharedWith: ["Maya Chen"], section: "documents" },
  { id: 8, name: "Brand voice guidelines 2026.pdf", type: "pdf", size: "12.7 MB", modified: "Jun 26", sharedWith: ["Rahul Bhavsar", "Sam Okafor", "Maya Chen", "Priya Nair"], section: "shared" },
  { id: 9, name: "Renewal forecast model.xlsx", type: "sheet", size: "1.2 MB", modified: "Jun 24", sharedWith: ["Rahul Bhavsar"], section: "documents" },
  { id: 10, name: "Old ICP worksheet (archived).xlsx", type: "sheet", size: "210 KB", modified: "Jun 12", sharedWith: [], section: "trash" },
];

const folders = [
  { name: "Playbooks", count: 24 },
  { name: "Call recordings", count: 61 },
  { name: "Contracts", count: 18 },
  { name: "Brand assets", count: 37 },
];

const railItems: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All files", icon: <FileIcon className="size-5" /> },
  { key: "documents", label: "Documents", icon: <DocsIcon className="size-5" /> },
  { key: "media", label: "Media", icon: <VideoIcon className="size-5" /> },
  { key: "shared", label: "Shared", icon: <GroupIcon className="size-5" /> },
  { key: "trash", label: "Trash", icon: <TrashBinIcon className="size-5" /> },
];

const typeIcon: Record<FileType, React.ReactNode> = {
  doc: <DocsIcon className="size-5 text-blue-light-500" />,
  sheet: <PageIcon className="size-5 text-success-500" />,
  video: <VideoIcon className="size-5 text-theme-purple-500" />,
  audio: <AudioIcon className="size-5 text-warning-500" />,
  pdf: <FileIcon className="size-5 text-error-500" />,
};

function AvatarStack({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-sm text-gray-500 dark:text-gray-400">Only you</span>;
  }
  return (
    <div className="flex -space-x-2">
      {names.slice(0, 3).map((name) => (
        <span
          key={name}
          title={name}
          className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-theme-xs font-semibold text-gray-600 dark:border-gray-900 dark:bg-gray-700 dark:text-gray-300"
        >
          {name
            .split(" ")
            .map((p) => p.charAt(0))
            .slice(0, 2)
            .join("")}
        </span>
      ))}
      {names.length > 3 && (
        <span className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-theme-xs font-medium text-gray-500 dark:border-gray-900 dark:bg-gray-800 dark:text-gray-400">
          +{names.length - 3}
        </span>
      )}
    </div>
  );
}

function RowMenu({ fileId }: { fileId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="dropdown-toggle flex size-8 items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-300"
        aria-label={`Actions for file ${fileId}`}
      >
        <MoreDotIcon className="size-5 rotate-90" />
      </button>
      <Dropdown isOpen={open} onClose={() => setOpen(false)} className="w-44 p-1.5">
        {["Download", "Rename", "Share", "Move to trash"].map((action) => (
          <DropdownItem
            key={action}
            onItemClick={() => setOpen(false)}
            className={`rounded-lg dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white/90 ${
              action === "Move to trash" ? "text-error-600 dark:text-error-500" : ""
            }`}
          >
            {action}
          </DropdownItem>
        ))}
      </Dropdown>
    </div>
  );
}

export default function FileManager() {
  const [section, setSection] = useState<Section>("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [query, setQuery] = useState("");

  const visibleFiles = useMemo(() => {
    return files.filter((f) => {
      if (section === "all" && f.section === "trash") return false;
      if (section !== "all" && f.section !== section) return false;
      if (query && !f.name.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [section, query]);

  const sectionCount = (key: Section) =>
    key === "all"
      ? files.filter((f) => f.section !== "trash").length
      : files.filter((f) => f.section === key).length;

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
      {/* Left rail */}
      <aside className="w-full shrink-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] lg:w-60 lg:self-start">
        <nav className="flex flex-row flex-wrap gap-1 lg:flex-col">
          {railItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 lg:flex-none ${
                section === item.key
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
              }`}
            >
              {item.icon}
              <span className="whitespace-nowrap">{item.label}</span>
              <span className="ml-auto hidden text-theme-xs text-gray-500 lg:inline dark:text-gray-400">
                {sectionCount(item.key)}
              </span>
            </button>
          ))}
        </nav>
        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Storage
          </p>
          <ProgressBar value={55} size="sm" />
          <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
            8.2 GB of 15 GB used
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1 space-y-5">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <svg
              className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gray-400"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
                fill="currentColor"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files"
              className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-11 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-700">
              <button
                onClick={() => setView("grid")}
                aria-label="Grid view"
                className={`flex size-9 items-center justify-center rounded-md transition-colors duration-150 ${
                  view === "grid"
                    ? "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white/90"
                    : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                }`}
              >
                <GridIcon className="size-5" />
              </button>
              <button
                onClick={() => setView("list")}
                aria-label="List view"
                className={`flex size-9 items-center justify-center rounded-md transition-colors duration-150 ${
                  view === "list"
                    ? "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white/90"
                    : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                }`}
              >
                <ListIcon className="size-5" />
              </button>
            </div>
            <Button size="sm" startIcon={<DownloadIcon className="rotate-180" />}>
              Upload
            </Button>
          </div>
        </div>

        {/* Folder cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {folders.map((folder) => (
            <button
              key={folder.name}
              className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left transition-colors duration-150 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <FolderIcon className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                  {folder.name}
                </span>
                <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                  {folder.count} files
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* Files */}
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between px-5 py-4 md:px-6">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {railItems.find((r) => r.key === section)?.label}
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {visibleFiles.length} {visibleFiles.length === 1 ? "file" : "files"}
            </span>
          </div>
          {visibleFiles.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 pb-12 pt-6 text-center">
              <FileIcon className="size-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No files match — try a different search or upload one.
              </p>
            </div>
          ) : view === "list" ? (
            <>
              {/* Mobile: file cards — no horizontal scroll. */}
              <div className="space-y-3 px-5 pb-5 md:hidden">
                {visibleFiles.map((file) => (
                  <div
                    key={file.id}
                    className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {typeIcon[file.type]}
                        <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                          {file.name}
                        </span>
                      </div>
                      <div className="shrink-0">
                        <RowMenu fileId={file.id} />
                      </div>
                    </div>
                    <dl className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                          Size
                        </dt>
                        <dd className="text-right text-theme-sm text-gray-700 dark:text-gray-300">
                          {file.size}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                          Modified
                        </dt>
                        <dd className="text-right text-theme-sm text-gray-700 dark:text-gray-300">
                          {file.modified}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                          Shared with
                        </dt>
                        <dd className="flex flex-1 justify-end">
                          <AvatarStack names={file.sharedWith} />
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-y border-gray-100 dark:border-gray-800">
                    <th className="px-5 py-3 text-theme-xs font-medium text-gray-500 dark:text-gray-400 md:px-6">
                      Name
                    </th>
                    <th className="px-4 py-3 text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Size
                    </th>
                    <th className="px-4 py-3 text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Modified
                    </th>
                    <th className="px-4 py-3 text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                      Shared with
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {visibleFiles.map((file) => (
                    <tr
                      key={file.id}
                      className="transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3.5 md:px-6">
                        <span className="flex items-center gap-3">
                          {typeIcon[file.type]}
                          <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                            {file.name}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                        {file.size}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                        {file.modified}
                      </td>
                      <td className="px-4 py-3.5">
                        <AvatarStack names={file.sharedWith} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <RowMenu fileId={file.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3 md:px-6 md:pb-6">
              {visibleFiles.map((file) => (
                <div
                  key={file.id}
                  className="rounded-xl bg-gray-50 p-4 transition-colors duration-150 hover:bg-gray-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                      {typeIcon[file.type]}
                    </span>
                    <RowMenu fileId={file.id} />
                  </div>
                  <p className="mb-1 truncate text-sm font-medium text-gray-800 dark:text-white/90">
                    {file.name}
                  </p>
                  <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
                    {file.size} · {file.modified}
                  </p>
                  <AvatarStack names={file.sharedWith} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
