"use client";
import React, { useEffect, useRef } from "react";
import {
  CATEGORIES,
  CategoryId,
  Email,
  FolderId,
  LABEL_META,
} from "./inboxData";
import {
  ArchiveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DotsIcon,
  MailClosedIcon,
  MailOpenIcon,
  RefreshIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
} from "./InboxIcons";

const PAGE_SIZE = 15;

const iconBtn =
  "flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-300";

interface InboxListProps {
  emails: Email[];
  folder: FolderId;
  tab: CategoryId;
  onTabChange: (tab: CategoryId) => void;
  tabCounts: Record<CategoryId, number>;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (select: boolean) => void;
  onOpen: (id: string) => void;
  onToggleStar: (id: string) => void;
  onArchive: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onMarkRead: (ids: string[], read: boolean) => void;
  onSnooze: (id: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}

export default function InboxList({
  emails,
  folder,
  tab,
  onTabChange,
  tabCounts,
  selected,
  onToggleSelect,
  onSelectAll,
  onOpen,
  onToggleStar,
  onArchive,
  onDelete,
  onMarkRead,
  onSnooze,
  page,
  onPageChange,
}: InboxListProps) {
  const selectAllRef = useRef<HTMLInputElement>(null);
  // Real pagination: slice the current page out of the filtered list and report
  // the true total (no fabricated count).
  const total = emails.length;
  const pageEmails = emails.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedInView = pageEmails.filter((e) => selected.has(e.id));
  const allSelected =
    pageEmails.length > 0 && selectedInView.length === pageEmails.length;
  const someSelected = selectedInView.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const selectedIds = selectedInView.map((e) => e.id);
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <>
      {/* Toolbar */}
      <div className="flex min-h-[52px] flex-wrap items-center gap-1 border-b border-gray-200 px-3 py-2 sm:px-4 dark:border-gray-800">
        <label className="mr-1 flex size-8 items-center justify-center">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onSelectAll(e.target.checked)}
            aria-label="Select all messages"
            className="size-4 cursor-pointer rounded border-gray-300 accent-brand-500 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:border-gray-700"
          />
        </label>
        {selectedInView.length === 0 ? (
          <>
            <button aria-label="Refresh" className={iconBtn}>
              <RefreshIcon className="size-4" />
            </button>
            <button aria-label="More options" className={iconBtn}>
              <DotsIcon className="size-[18px]" />
            </button>
          </>
        ) : (
          <>
            <button
              aria-label="Archive selected"
              onClick={() => onArchive(selectedIds)}
              className={iconBtn}
            >
              <ArchiveIcon className="size-[18px]" />
            </button>
            <button
              aria-label="Delete selected"
              onClick={() => onDelete(selectedIds)}
              className={iconBtn}
            >
              <TrashIcon className="size-[18px]" />
            </button>
            <button
              aria-label="Mark selected as read"
              onClick={() => onMarkRead(selectedIds, true)}
              className={iconBtn}
            >
              <MailOpenIcon className="size-[18px]" />
            </button>
            <button aria-label="Label selected" className={iconBtn}>
              <TagIcon className="size-[18px]" />
            </button>
            <span className="ml-1 text-sm font-medium text-gray-600 dark:text-gray-300">
              {selectedInView.length} selected
            </span>
          </>
        )}
      </div>

      {/* Category tabs */}
      {folder === "inbox" && (
        <div className="flex border-b border-gray-200 px-2 sm:px-3 dark:border-gray-800">
          {CATEGORIES.map((c) => {
            const active = tab === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onTabChange(c.id)}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 ${
                  active
                    ? "font-semibold text-brand-600 dark:text-brand-400"
                    : "font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
              >
                {c.name}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    active
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                      : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                  }`}
                >
                  {tabCounts[c.id]}
                </span>
                {active && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Rows */}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {emails.length === 0 && (
          <li className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <MailClosedIcon className="size-8 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nothing here — try another folder or category.
            </p>
          </li>
        )}
        {pageEmails.map((email) => {
          const labelMeta = email.label ? LABEL_META[email.label] : null;
          return (
            <li
              key={email.id}
              className="group border-b border-gray-100 last:border-b-0 dark:border-gray-800"
            >
              <div
                className={`relative flex items-center gap-1.5 border border-transparent px-3 py-3 transition-colors duration-150 hover:z-10 hover:border-gray-200 hover:shadow-theme-xs sm:gap-2 sm:px-4 sm:py-2.5 dark:hover:border-gray-700 ${
                  email.unread
                    ? "bg-white dark:bg-white/[0.045]"
                    : "bg-gray-50/70 dark:bg-transparent"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(email.id)}
                  onChange={() => onToggleSelect(email.id)}
                  aria-label={`Select message from ${email.sender}`}
                  className="hidden size-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-500 focus-visible:outline-2 focus-visible:outline-brand-500/50 sm:block dark:border-gray-700"
                />
                <button
                  onClick={() => onToggleStar(email.id)}
                  aria-label={email.starred ? "Unstar message" : "Star message"}
                  className={`shrink-0 rounded-lg p-1 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 ${
                    email.starred
                      ? "text-warning-500"
                      : "text-gray-300 hover:text-gray-400 dark:text-gray-600 dark:hover:text-gray-500"
                  }`}
                >
                  <StarIcon filled={email.starred} className="size-[18px]" />
                </button>

                <button
                  onClick={() => onOpen(email.id)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 text-left focus-visible:outline-2 focus-visible:outline-brand-500/50 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="flex w-full shrink-0 items-center gap-1.5 sm:w-44 xl:w-52">
                    {email.unread && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-brand-500"
                        aria-label="Unread"
                      />
                    )}
                    <span
                      className={`truncate text-sm ${
                        email.unread
                          ? "font-semibold text-gray-800 dark:text-white/90"
                          : "font-medium text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {email.sender}
                    </span>
                    {email.isAgent && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-px text-[10px] font-semibold text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">
                        AI
                      </span>
                    )}
                    <span
                      className={`ml-auto shrink-0 text-xs sm:hidden ${
                        email.unread
                          ? "font-semibold text-gray-700 dark:text-gray-300"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {email.time}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span
                      className={
                        email.unread
                          ? "font-semibold text-gray-800 dark:text-white/90"
                          : "text-gray-700 dark:text-gray-300"
                      }
                    >
                      {email.subject}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {" — "}
                      {email.snippet}
                    </span>
                  </span>
                </button>

                {labelMeta && (
                  <span
                    className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium md:inline-flex ${labelMeta.chip}`}
                  >
                    {labelMeta.name}
                  </span>
                )}

                {/* Time — swapped for hover actions on sm+ */}
                <div className="hidden w-24 shrink-0 items-center justify-end sm:flex">
                  <span
                    className={`text-xs group-hover:hidden ${
                      email.unread
                        ? "font-semibold text-gray-700 dark:text-gray-300"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {email.time}
                  </span>
                  <div className="hidden items-center group-hover:flex">
                    <button
                      aria-label="Archive"
                      onClick={() => onArchive([email.id])}
                      className={iconBtn}
                    >
                      <ArchiveIcon className="size-4" />
                    </button>
                    <button
                      aria-label="Delete"
                      onClick={() => onDelete([email.id])}
                      className={iconBtn}
                    >
                      <TrashIcon className="size-4" />
                    </button>
                    <button
                      aria-label={
                        email.unread ? "Mark as read" : "Mark as unread"
                      }
                      onClick={() => onMarkRead([email.id], email.unread)}
                      className={iconBtn}
                    >
                      {email.unread ? (
                        <MailOpenIcon className="size-4" />
                      ) : (
                        <MailClosedIcon className="size-4" />
                      )}
                    </button>
                    <button
                      aria-label="Snooze"
                      onClick={() => onSnooze(email.id)}
                      className={iconBtn}
                    >
                      <ClockIcon className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {rangeStart}–{rangeEnd} of {total}
        </p>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            className={`${iconBtn} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            aria-label="Next page"
            disabled={rangeEnd >= total}
            onClick={() => onPageChange(page + 1)}
            className={`${iconBtn} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
