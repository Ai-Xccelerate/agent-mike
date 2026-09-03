"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import { FileIcon } from "@/icons";
import { Email, LABEL_META } from "./inboxData";
import {
  ArchiveIcon,
  BackArrowIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MailClosedIcon,
  StarIcon,
  TrashIcon,
} from "./InboxIcons";

const iconBtn =
  "flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-300";

interface InboxThreadProps {
  email: Email;
  position: number;
  total: number;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkUnread: () => void;
  onToggleStar: () => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function InboxThread({
  email,
  position,
  total,
  onBack,
  onPrev,
  onNext,
  onArchive,
  onDelete,
  onMarkUnread,
  onToggleStar,
}: InboxThreadProps) {
  const [reply, setReply] = useState("");
  const labelMeta = email.label ? LABEL_META[email.label] : null;

  return (
    <>
      {/* Thread toolbar */}
      <div className="flex min-h-[52px] flex-shrink-0 items-center gap-1 border-b border-gray-200 px-3 py-2 sm:px-4 dark:border-gray-800">
        <button aria-label="Back to list" onClick={onBack} className={iconBtn}>
          <BackArrowIcon className="size-[18px]" />
        </button>
        <button aria-label="Archive" onClick={onArchive} className={iconBtn}>
          <ArchiveIcon className="size-[18px]" />
        </button>
        <button aria-label="Delete" onClick={onDelete} className={iconBtn}>
          <TrashIcon className="size-[18px]" />
        </button>
        <button
          aria-label="Mark as unread"
          onClick={onMarkUnread}
          className={iconBtn}
        >
          <MailClosedIcon className="size-[18px]" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {position} of {total}
          </span>
          <button
            aria-label="Previous message"
            onClick={onPrev}
            disabled={position <= 1}
            className={`${iconBtn} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            aria-label="Next message"
            onClick={onNext}
            disabled={position >= total}
            className={`${iconBtn} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {/* Subject */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800 md:text-xl dark:text-white/90">
            {email.subject}
          </h2>
          {labelMeta && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${labelMeta.chip}`}
            >
              {labelMeta.name}
            </span>
          )}
        </div>

        {/* Sender card */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {initials(email.sender)}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-white/90">
                {email.sender}
                {email.isAgent && (
                  <span className="rounded-full bg-gray-100 px-1.5 py-px text-[10px] font-semibold text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">
                    AI
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                {email.senderEmail} · to me
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">{email.fullTime}</span>
            <button
              onClick={onToggleStar}
              aria-label={email.starred ? "Unstar message" : "Star message"}
              className={`flex size-8 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:hover:bg-white/[0.06] ${
                email.starred ? "text-warning-500" : "text-gray-400"
              }`}
            >
              <StarIcon filled={email.starred} className="size-[18px]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="mt-5 space-y-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {email.body.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {email.attachments.length}{" "}
              {email.attachments.length === 1 ? "attachment" : "attachments"}
            </p>
            <div className="flex flex-wrap gap-3">
              {email.attachments.map((a) => (
                <button
                  key={a.name}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-gray-300 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:border-gray-800 dark:hover:border-gray-700"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <FileIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[200px] truncate text-sm font-medium text-gray-800 dark:text-white/90">
                      {a.name}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {a.type} · {a.size}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick reply */}
        <div className="mt-6 border-t border-gray-100 pt-5 dark:border-gray-800">
          <label htmlFor="quick-reply" className="sr-only">
            Reply to {email.sender}
          </label>
          <textarea
            id="quick-reply"
            rows={4}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={`Reply to ${email.sender}...`}
            className="w-full resize-y rounded-lg border border-gray-200 bg-transparent p-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setReply("")}>
              Send reply
            </Button>
            <Button size="sm" variant="outline">
              Forward
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
