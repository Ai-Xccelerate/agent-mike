"use client";
import React, { useState } from "react";
import AgentAvatar, { AgentName } from "@/components/aix/AgentAvatar";
import { ChevronLeftIcon, PaperPlaneIcon } from "@/icons";

type Participant =
  | { kind: "agent"; name: AgentName; role: string }
  | { kind: "human"; name: string; initials: string; role: string };

interface Conversation {
  id: string;
  participant: Participant;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

interface Message {
  id: string;
  direction: "in" | "out";
  text: string;
  time: string;
}

const conversations: Conversation[] = [
  {
    id: "pepper",
    participant: { kind: "agent", name: "Pepper", role: "Inbound" },
    lastMessage: "Routing the Meridian lead to you now — SLA clock started.",
    time: "2 min ago",
    unread: 2,
    online: true,
  },
  {
    id: "jules",
    participant: { kind: "agent", name: "Jules", role: "Outbound" },
    lastMessage: "Sequence 3 finished — 14 replies, 5 positive. Want a recap?",
    time: "25 min ago",
    unread: 0,
    online: true,
  },
  {
    id: "sarah",
    participant: {
      kind: "human",
      name: "Sarah Okafor",
      initials: "SO",
      role: "VP Sales",
    },
    lastMessage: "Can we review the Q3 pipeline before Thursday's call?",
    time: "1 hr ago",
    unread: 1,
    online: true,
  },
  {
    id: "tony",
    participant: { kind: "agent", name: "Tony", role: "Technical" },
    lastMessage: "Posted the API scoping answers to the Brightline thread.",
    time: "3 hr ago",
    unread: 0,
    online: true,
  },
  {
    id: "marcus",
    participant: {
      kind: "human",
      name: "Marcus Lee",
      initials: "ML",
      role: "Account exec",
    },
    lastMessage: "Thanks — closing notes are in the CRM.",
    time: "Yesterday",
    unread: 0,
    online: false,
  },
  {
    id: "george",
    participant: { kind: "agent", name: "George", role: "Retention" },
    lastMessage: "Renewal health check for Northwind is complete.",
    time: "Yesterday",
    unread: 0,
    online: true,
  },
];

const thread: Message[] = [
  {
    id: "m1",
    direction: "in",
    text: "New inbound lead from Meridian Logistics — Dana Whitfield, VP of Operations. She filled out the pricing form and mentioned a 40-person sales team.",
    time: "9:42 AM",
  },
  {
    id: "m2",
    direction: "in",
    text: "I scored it 87/100: right revenue band ($60M), active buying signal, and she asked specifically about outbound coverage.",
    time: "9:42 AM",
  },
  {
    id: "m3",
    direction: "out",
    text: "Nice catch. Did she mention a timeline anywhere in the form?",
    time: "9:45 AM",
  },
  {
    id: "m4",
    direction: "in",
    text: "Yes — she selected \"this quarter\" for implementation timing. I also found that Meridian posted two SDR openings last month, so headcount pressure is real.",
    time: "9:46 AM",
  },
  {
    id: "m5",
    direction: "out",
    text: "Perfect. Route it to me and book a discovery call for early next week. Send her the standard intro with the outbound case study attached.",
    time: "9:48 AM",
  },
  {
    id: "m6",
    direction: "in",
    text: "Done. Calendar invite drafted for Tuesday 10 AM CST, intro email queued with the case study. I'll confirm once she accepts.",
    time: "9:49 AM",
  },
];

function ParticipantAvatar({
  participant,
  online,
}: {
  participant: Participant;
  online: boolean;
}) {
  if (participant.kind === "agent") {
    return (
      <AgentAvatar
        name={participant.name}
        showStatus
        status={online ? "active" : "paused"}
      />
    );
  }
  return (
    <span className="relative inline-flex shrink-0">
      <span className="flex size-10 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        {participant.initials}
      </span>
      <span
        className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white dark:border-gray-900 ${
          online ? "bg-success-500" : "bg-gray-400"
        }`}
      />
    </span>
  );
}

function participantName(p: Participant) {
  return p.kind === "agent" ? p.name : p.name;
}

export default function ChatApp() {
  const [activeId, setActiveId] = useState("pepper");
  const [showThread, setShowThread] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});

  const copyMessage = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };
  const setVote = (id: string, vote: "up" | "down") =>
    setFeedback((f) => {
      const next = { ...f };
      if (next[id] === vote) delete next[id];
      else next[id] = vote;
      return next;
    });

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const filtered = conversations.filter((c) =>
    participantName(c.participant).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[560px] w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white lg:flex-row dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Conversation list */}
      <div
        data-aix-id="AIX-105.1"
        className={`w-full flex-col border-gray-200 lg:flex lg:w-80 lg:shrink-0 lg:border-r xl:w-96 dark:border-gray-800 ${
          showThread ? "hidden" : "flex"
        }`}
      >
        <div className="border-b border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Chats
          </h3>
          <div className="relative mt-3">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3.04 9.37a6.33 6.33 0 1 1 12.67 0 6.33 6.33 0 0 1-12.67 0Zm6.33-7.83a7.83 7.83 0 1 0 4.98 13.88l2.53 2.53a.75.75 0 1 0 1.06-1.06l-2.53-2.53A7.83 7.83 0 0 0 9.37 1.54Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              className="h-10 w-full rounded-lg border border-gray-200 bg-transparent pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-800 dark:text-white/90 dark:placeholder:text-white/30"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No conversations match your search.
            </li>
          )}
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => {
                  setActiveId(c.id);
                  setShowThread(true);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:hover:bg-white/[0.03] ${
                  c.id === activeId ? "bg-gray-50 dark:bg-white/[0.05]" : ""
                }`}
              >
                <ParticipantAvatar participant={c.participant} online={c.online} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                      {participantName(c.participant)}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {c.time}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${
                        c.unread > 0
                          ? "font-medium text-gray-700 dark:text-gray-200"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {c.lastMessage}
                    </span>
                    {c.unread > 0 && (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-semibold text-white">
                        {c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Thread */}
      <div
        data-aix-id="AIX-105.2"
        className={`w-full flex-1 flex-col lg:flex ${
          showThread ? "flex" : "hidden"
        }`}
      >
        {/* Thread header */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 md:px-5 dark:border-gray-800">
          <button
            onClick={() => setShowThread(false)}
            aria-label="Back to conversations"
            className="flex size-9 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 lg:hidden dark:text-gray-400 dark:hover:bg-white/[0.05]"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <ParticipantAvatar participant={active.participant} online={active.online} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
              {participantName(active.participant)}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span
                className={`inline-block size-1.5 rounded-full ${
                  active.online ? "bg-success-500" : "bg-gray-400"
                }`}
              />
              {active.online ? "Active now" : "Away"}
              {active.participant.kind === "agent" &&
                ` · ${active.participant.role} agent`}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Today</span>
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>
          {thread.map((m) => (
            <div
              key={m.id}
              className={`group flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[70%] ${
                  m.direction === "out" ? "text-right" : "text-left"
                }`}
              >
                <div
                  className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.direction === "out"
                      ? "rounded-br-sm bg-brand-500 text-white"
                      : "rounded-bl-sm bg-gray-100 text-gray-800 dark:bg-white/[0.06] dark:text-white/90"
                  }`}
                >
                  {m.text}
                </div>
                <div
                  className={`mt-1 flex items-center gap-1 ${
                    m.direction === "out" ? "justify-end" : "justify-start"
                  }`}
                >
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {m.time}
                  </span>
                  {/* Incoming messages get hover actions — copy + feedback. */}
                  {m.direction !== "out" && (
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label="Copy message"
                        onClick={() => copyMessage(m.text)}
                        className="flex size-6 items-center justify-center rounded-md text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
                      >
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
                          <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label="Good response"
                        aria-pressed={feedback[m.id] === "up"}
                        onClick={() => setVote(m.id, "up")}
                        className={`flex size-6 items-center justify-center rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                          feedback[m.id] === "up"
                            ? "text-brand-500"
                            : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
                        }`}
                      >
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M7 10v10M7 10l3.2-6.4A1.8 1.8 0 0 1 13 4.4V8h4.6a2 2 0 0 1 2 2.3l-1.1 7a2 2 0 0 1-2 1.7H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label="Bad response"
                        aria-pressed={feedback[m.id] === "down"}
                        onClick={() => setVote(m.id, "down")}
                        className={`flex size-6 items-center justify-center rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                          feedback[m.id] === "down"
                            ? "text-brand-500"
                            : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
                        }`}
                      >
                        <svg className="size-3.5 rotate-180" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M7 10v10M7 10l3.2-6.4A1.8 1.8 0 0 1 13 4.4V8h4.6a2 2 0 0 1 2 2.3l-1.1 7a2 2 0 0 1-2 1.7H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {/* Typing indicator — only while the participant is actually online
              (an offline/away participant can't be typing). */}
          {active.online && (
            <div className="flex items-center gap-2">
              <ParticipantAvatar
                participant={active.participant}
                online={active.online}
              />
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3 dark:bg-white/[0.06]">
                <span className="size-1.5 animate-typing rounded-full bg-gray-400 [animation-delay:0ms]" />
                <span className="size-1.5 animate-typing rounded-full bg-gray-400 [animation-delay:200ms]" />
                <span className="size-1.5 animate-typing rounded-full bg-gray-400 [animation-delay:400ms]" />
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 p-3 md:p-4 dark:border-gray-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setDraft("");
            }}
            className="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-theme-xs transition-colors duration-150 focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <button
              type="button"
              aria-label="Attach a file"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-gray-400 dark:hover:bg-white/[0.06]"
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
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${participantName(active.participant)}`}
              className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-white/90 dark:placeholder:text-gray-500"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!draft.trim()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white transition-colors duration-150 hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-gray-900"
            >
              <PaperPlaneIcon className="size-4.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
