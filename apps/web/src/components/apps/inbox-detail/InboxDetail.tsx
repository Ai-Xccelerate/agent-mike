"use client";
import React, { useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, FileIcon } from "@/icons";

interface CollapsedMessage {
  id: string;
  sender: string;
  initials: string;
  snippet: string;
  time: string;
  body: string[];
}

const earlierMessages: CollapsedMessage[] = [
  {
    id: "t1",
    sender: "Rahul Bhavsar",
    initials: "RB",
    snippet: "Great question — George handles renewal health monitoring, usage...",
    time: "Jun 28",
    body: [
      "Great question — George handles renewal health monitoring, usage tracking, and proactive check-ins across your whole book of business. Most teams pair him with Joy so deal ops and retention share the same data.",
      "Happy to walk through what onboarding looks like whenever you're ready.",
    ],
  },
  {
    id: "t2",
    sender: "Dana Whitfield",
    initials: "DW",
    snippet: "Thanks Rahul. Before we commit, can you tell me more about how...",
    time: "Jun 30",
    body: [
      "Thanks Rahul. Before we commit, can you tell me more about how George integrates with our existing CRM? We're on HubSpot and I'd rather not add another manual sync to the team's plate.",
    ],
  },
];

const attachments = [
  { name: "Meridian-renewal-summary.pdf", size: "1.2 MB", type: "PDF" },
  { name: "Account-usage-Q2.xlsx", size: "348 KB", type: "XLSX" },
];

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      aria-hidden="true"
    >
      <path
        d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 17H7A5 5 0 0 1 7 7h9m0 0-4-4m4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="scale(-1,1) translate(-24,0)"
      />
    </svg>
  );
}

export default function InboxDetail() {
  const [starred, setStarred] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState("");

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div data-aix-id="AIX-109.1">
        <Link
          href="/inbox"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors duration-150 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon className="size-4" />
          Back to inbox
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-800 md:text-2xl dark:text-white/90">
            Adding George to our plan
          </h1>
          <Badge size="sm" color="primary">
            Customers
          </Badge>
        </div>
      </div>

      {/* Earlier collapsed messages */}
      <div data-aix-id="AIX-109.2" className="space-y-3">
        {earlierMessages.map((m) => {
          const isOpen = expanded.has(m.id);
          return (
            <div
              key={m.id}
              className="rounded-2xl border border-gray-200 bg-white transition-colors duration-150 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700"
            >
              <button
                onClick={() => toggleExpanded(m.id)}
                className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-brand-500/50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {m.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-800 dark:text-white/90">
                    {m.sender}
                  </span>
                  {!isOpen && (
                    <span className="block truncate text-sm text-gray-500 dark:text-gray-400">
                      {m.snippet}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{m.time}</span>
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-gray-100 px-4 py-4 pl-16 text-sm leading-relaxed text-gray-600 dark:border-gray-800 dark:text-gray-300">
                  {m.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Latest message */}
      <div
        data-aix-id="AIX-109.3"
        className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        {/* Sender card */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-4 md:p-5 dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              DW
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Dana Whitfield
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                dana.whitfield@meridianlogistics.com · to me
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-gray-500 dark:text-gray-400">Today, 9:24 AM</span>
            <button
              onClick={() => setStarred((s) => !s)}
              aria-label={starred ? "Unstar message" : "Star message"}
              className={`flex size-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:hover:bg-white/[0.05] ${
                starred ? "text-warning-500" : "text-gray-400"
              }`}
            >
              <StarIcon filled={starred} />
            </button>
            <button
              aria-label="Reply to message"
              className="flex size-9 items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:hover:bg-white/[0.05] dark:hover:text-gray-300"
            >
              <ReplyIcon />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4 text-sm leading-relaxed text-gray-600 md:p-5 dark:text-gray-300">
          <p>Hi Rahul,</p>
          <p>
            Thanks for the detail on the HubSpot integration — that answered our
            last open question. We ran the numbers on our side: we have 62
            accounts up for renewal between now and December, and honestly the
            team can barely keep up with the check-ins. The renewal summary
            attached shows where things stand today.
          </p>
          <p>
            We&apos;d like to move forward with adding George to our plan
            starting August 1. Two things before we sign: can George pick up the
            usage data we&apos;re already tracking (Q2 export attached), and
            what does the first 30 days of onboarding look like for the team?
            If those check out, send over the updated agreement and I&apos;ll
            get it through procurement this week.
          </p>
          <p>
            Best,
            <br />
            Dana
          </p>
        </div>

        {/* Attachments */}
        <div className="border-t border-gray-100 p-4 md:p-5 dark:border-gray-800">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            2 attachments
          </p>
          <div className="flex flex-wrap gap-3">
            {attachments.map((a) => (
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
      </div>

      {/* Reply composer */}
      <div
        data-aix-id="AIX-109.4"
        className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <label
          htmlFor="reply-body"
          className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Reply to Dana Whitfield
        </label>
        <textarea
          id="reply-body"
          rows={5}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write your reply — George's onboarding plan, updated agreement, next steps..."
          className="w-full resize-y rounded-lg border border-gray-200 bg-transparent p-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            aria-label="Attach a file"
            className="flex size-10 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-gray-400 dark:hover:bg-white/[0.05]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <Button size="sm" onClick={() => setReply("")}>
            Send reply
          </Button>
        </div>
      </div>
    </div>
  );
}
