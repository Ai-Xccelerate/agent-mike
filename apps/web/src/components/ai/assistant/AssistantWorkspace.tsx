"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import {
  CalenderIcon,
  ArrowRightIcon,
  DocsIcon,
  MailIcon,
  PaperPlaneIcon,
  TaskIcon,
} from "@/icons";

interface SourceChip {
  label: string;
}

interface AssistantMessage {
  id: string;
  from: "sam" | "user";
  text: string;
  time: string;
  sources?: SourceChip[];
  actionItems?: string[];
}

const messages: AssistantMessage[] = [
  {
    id: "m1",
    from: "user",
    text: "What happened in the Acme QBR this morning?",
    time: "10:12 AM",
  },
  {
    id: "m2",
    from: "sam",
    text: "From the Scribe transcript: the QBR went well overall. They want George added to their plan to cover renewals, and they flagged that Q3 pricing needs a follow-up before their board meeting on the 18th. Renewal sentiment was positive — their VP called the outbound results \"the best quarter yet.\"",
    time: "10:12 AM",
    sources: [
      { label: "Transcript · Acme QBR" },
      { label: "Task · Follow up pricing" },
    ],
  },
  {
    id: "m3",
    from: "user",
    text: "Anything I need to do before their board meeting?",
    time: "10:14 AM",
  },
  {
    id: "m4",
    from: "sam",
    text: "Three things came out of the call that need you before the 18th:",
    time: "10:14 AM",
    actionItems: [
      "Send updated Q3 pricing with the George add-on by Friday",
      "Share the outbound results one-pager their VP asked for",
      "Confirm the renewal kickoff date with their ops lead",
    ],
  },
];

const contextChips = ["Transcripts", "Inbox", "Tasks", "Calendar"] as const;

const contextSurfaces = [
  {
    label: "Transcripts",
    detail: "128 synced",
    href: "/transcripts",
    icon: DocsIcon,
  },
  { label: "Inbox", detail: "12 unread", href: "/inbox", icon: MailIcon },
  {
    label: "Tasks",
    detail: "8 due this week",
    href: "/task-list",
    icon: TaskIcon,
  },
  {
    label: "Calendar",
    detail: "3 meetings today",
    href: "/calendar",
    icon: CalenderIcon,
  },
];

const suggestedPrompts = [
  "Summarize today's meetings",
  "Draft follow-up for Meridian",
  "What's blocking the Corewave deal?",
  "Prep me for the 2pm call",
];

const recentConversations = [
  { title: "Meridian pricing recap", time: "2 hr ago" },
  { title: "Weekly pipeline review prep", time: "Yesterday" },
  { title: "Corewave renewal risk check", time: "Tuesday" },
];

function SamAvatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-agent-sam text-xs font-bold text-white">
      S
    </span>
  );
}

export default function AssistantWorkspace() {
  const [draft, setDraft] = useState("");
  const {
    listening,
    supported: voiceSupported,
    toggle: toggleVoice,
  } = useVoiceInput((text) => {
    setDraft((prev) => (prev ? prev + " " : "") + text);
  });

  const [activeContexts, setActiveContexts] = useState<string[]>([
    "Transcripts",
    "Tasks",
  ]);

  const toggleContext = (chip: string) => {
    setActiveContexts((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:gap-6 xl:grid-cols-3 xl:[grid-template-rows:minmax(0,1fr)]">
      {/* Conversation + composer */}
      <div
        data-aix-id="AIX-155.1"
        className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white xl:col-span-2 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3 md:px-5 dark:border-gray-800">
          <SamAvatar />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
              Sam
            </p>
            <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-block size-1.5 rounded-full bg-success-500" />
              Chief of staff · connected to 4 surfaces
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Today</span>
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>

          {messages.map((m) =>
            m.from === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] text-right sm:max-w-[70%]">
                  <div className="inline-block rounded-2xl rounded-br-sm bg-brand-500 px-4 py-2.5 text-left text-sm leading-relaxed text-white">
                    {m.text}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{m.time}</p>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2.5">
                <SamAvatar />
                <div className="max-w-[85%] sm:max-w-[75%]">
                  <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5 text-sm leading-relaxed text-gray-800 dark:bg-white/[0.06] dark:text-white/90">
                    <p>{m.text}</p>
                    {m.actionItems && (
                      <ul className="mt-2 space-y-1.5 border-t border-gray-200 pt-2 dark:border-white/10">
                        {m.actionItems.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gray-400" />
                            <span className="text-sm text-gray-700 dark:text-gray-200">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {m.sources && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.sources.map((s) => (
                        <span
                          key={s.label}
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                        >
                          <DocsIcon className="size-3" />
                          {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{m.time}</p>
                </div>
              </div>
            )
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 p-3 md:p-4 dark:border-gray-800">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Context:</span>
            {contextChips.map((chip) => {
              const active = activeContexts.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleContext(chip)}
                  aria-pressed={active}
                  className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 ${
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                      : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setDraft("");
            }}
            className="rounded-lg border border-gray-200 transition-colors duration-150 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-gray-800"
          >
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                listening
                  ? "Listening — speak now…"
                  : "Ask Sam anything about your meetings, inbox, or tasks"
              }
              className="w-full resize-none border-0 bg-transparent px-4 pt-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-white/90 dark:placeholder:text-white/30"
            />
            <div className="flex items-center gap-1 px-2 pb-2">
              <button
                type="button"
                aria-label="Attach a file"
                title="Attach a file"
                className="flex size-9 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-gray-400 dark:hover:bg-white/[0.05]"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleVoice}
                disabled={!voiceSupported}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                aria-pressed={listening}
                title={
                  voiceSupported
                    ? listening
                      ? "Stop voice input"
                      : "Speak instead of typing"
                    : "Voice input isn't supported in this browser"
                }
                className={`relative flex size-9 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 disabled:cursor-not-allowed disabled:opacity-40 ${
                  listening
                    ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.05]"
                }`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {listening && (
                  <span className="absolute right-1 top-1 size-1.5 animate-pulse rounded-full bg-error-500" />
                )}
              </button>
              {listening && (
                <span className="text-xs font-medium text-error-600 dark:text-error-500">
                  Listening…
                </span>
              )}
              <span className="flex-1" />
              <button
                type="submit"
                aria-label="Send message"
                className="flex size-9 items-center justify-center rounded-lg bg-brand-500 text-white shadow-theme-xs transition-colors duration-150 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500/50"
              >
                <PaperPlaneIcon className="size-4.5" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right rail */}
      <div className="min-w-0 space-y-4 md:space-y-6">
        <div
          data-aix-id="AIX-155.2"
          className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Context
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            What Sam can see right now.
          </p>
          <ul className="mt-4 space-y-1">
            {contextSurfaces.map((s) => (
              <li key={s.label}>
                <Link
                  href={s.href}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:hover:bg-white/[0.03]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <s.icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                      {s.label}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {s.detail}
                    </span>
                  </span>
                  <ArrowRightIcon className="size-4 text-gray-300 transition-colors duration-150 group-hover:text-gray-400 dark:text-gray-600" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div
          data-aix-id="AIX-155.3"
          className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Suggested prompts
          </h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestedPrompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDraft(p)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-left text-xs font-medium text-gray-600 transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-white/[0.03]"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div
          data-aix-id="AIX-155.4"
          className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Recent conversations
          </h3>
          <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
            {recentConversations.map((c) => (
              <li
                key={c.title}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="truncate text-sm text-gray-700 dark:text-gray-200">
                  {c.title}
                </span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{c.time}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
