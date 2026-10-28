"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, createEvalCase, type EvalCaseInput } from "@/lib/worker-api";
import { GROUNDING_LABELS, ROUTE_LABELS, SHOW_REPLY_TRACE, type GroundingVerdict, type ReplyRoute } from "@/lib/reply-trace";

type ReviewKind = "bad_rating" | "no_article" | "team_answer";
type ReviewItem = {
  id: string;
  kind: ReviewKind;
  conversationId: string;
  ticketNumber: number;
  question: string;
  answer: string;
  reasons: string[];
  correction: string | null;
  /** Why she answered that way, kept with the rating when it was made. */
  why: { route: string; routeReason: string | null; pagesUsed: string[]; skillsLoaded: string[]; events: string[]; grounding: { verdict: string; coverage: number | null; missing: string[] } } | null;
  at: string;
};
type ReviewGroup = { topic: string; count: number; kinds: Record<ReviewKind, number>; latest: string; items: ReviewItem[] };

const KIND_LABELS: Record<ReviewKind, string> = {
  bad_rating: "Rated bad",
  no_article: "No article found",
  team_answer: "Team answered",
};
const KIND_STYLES: Record<ReviewKind, string> = {
  bad_rating: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300",
  no_article: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300",
  team_answer: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300",
};

const SHOWN_GROUPS = 6;

function clip(text: string, max: number) {
  const value = text.replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** The test case a review item suggests: a correction or the team's own answer is what a good answer says. */
function suggestedCase(item: ReviewItem): { reference: string; behaviour: "answer" | "handover" | "either" } {
  const reasons = item.reasons.map((reason) => reason.toLowerCase());
  const reference = item.correction?.trim() || (item.kind === "team_answer" ? item.answer.trim() : "");
  if (reasons.some((reason) => reason.includes("should have handed over"))) return { reference, behaviour: "handover" };
  if (reasons.some((reason) => reason.includes("handed over too soon"))) return { reference, behaviour: "answer" };
  return { reference, behaviour: reference ? "answer" : "either" };
}

/** Saves one review item as a saved test question. Personal details are removed on the server. */
function MakeTestCase({ item }: { item: ReviewItem }) {
  const start = suggestedCase(item);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(item.question);
  const [reference, setReference] = useState(start.reference);
  const [behaviour, setBehaviour] = useState(start.behaviour);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  if (state === "saved") {
    return (
      <p className="mt-2 text-xs text-success-700 dark:text-success-400">
        Saved as a test question. <Link href="/settings/test-cases" className="underline">Replay it under Test questions.</Link>
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
        Add as test question
      </button>
    );
  }
  async function save() {
    setState("saving");
    setError("");
    const input: EvalCaseInput = {
      question,
      reference: behaviour === "handover" ? null : reference.trim() || null,
      expectHandover: behaviour === "handover" ? true : behaviour === "answer" ? false : null,
      sourceItem: item.id,
      sourceKind: item.kind,
    };
    try {
      await createEvalCase(input);
      setState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save it.");
      setState("idle");
    }
  }
  const field = "mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3 text-xs dark:bg-white/[0.03]">
      <label className="block font-medium text-gray-700 dark:text-gray-300">
        Question (personal details are removed when it is saved)
        <textarea className={field} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
      </label>
      <fieldset className="flex flex-wrap gap-3 text-gray-700 dark:text-gray-300">
        {([["answer", "She should answer"], ["handover", "She should hand over"], ["either", "Just record it"]] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-1.5">
            <input type="radio" checked={behaviour === value} onChange={() => setBehaviour(value)} />
            {label}
          </label>
        ))}
      </fieldset>
      {behaviour !== "handover" && (
        <label className="block font-medium text-gray-700 dark:text-gray-300">
          What a good answer says
          <textarea className={field} rows={3} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="The steps or facts the answer must contain" />
        </label>
      )}
      {error && <p className="text-error-600 dark:text-error-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={state === "saving" || question.trim().length < 3} onClick={() => void save()} className="rounded-lg bg-brand-500 px-2.5 py-1 font-medium text-white disabled:opacity-60">
          {state === "saving" ? "Saving…" : "Save test question"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-2.5 py-1 font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * What to look at to make the worker better: replies rated bad, questions with no article behind them, and what the
 * team answered after a handoff, grouped by topic. It only shows; nothing here changes the worker.
 */
export default function ReviewQueuePanel() {
  const [groups, setGroups] = useState<ReviewGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ groups: ReviewGroup[] }>("/worker/review-queue")
      .then((data) => !cancelled && setGroups(data.groups))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="text-sm text-gray-500 dark:text-gray-400">The review list could not be loaded.</p>;
  if (!groups) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>;
  if (groups.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Nothing to review. Replies rated bad, questions with no article and handed-over conversations show up here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {groups.slice(0, SHOWN_GROUPS).map((group) => {
        const expanded = open === group.topic;
        return (
          <li key={group.topic} className="py-3 first:pt-0 last:pb-0">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : group.topic)}
              aria-expanded={expanded}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-800 dark:text-white/90">{clip(group.items[0].question, 90)}</span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {(Object.keys(group.kinds) as ReviewKind[])
                    .filter((kind) => group.kinds[kind] > 0)
                    .map((kind) => (
                      <span key={kind} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_STYLES[kind]}`}>
                        {KIND_LABELS[kind]} {group.kinds[kind]}
                      </span>
                    ))}
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 dark:bg-white/[0.08] dark:text-gray-300">
                {group.count}
              </span>
            </button>
            {expanded && (
              <ul className="mt-3 space-y-3">
                {group.items.slice(0, 5).map((entry) => (
                  <li key={entry.id} className="rounded-lg border border-gray-100 p-3 text-sm dark:border-gray-800">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {KIND_LABELS[entry.kind]} ·{" "}
                      <Link href={`/inbox?conversation=${entry.conversationId}`} className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
                        Open conversation
                      </Link>
                    </p>
                    <p className="mt-1.5 text-gray-800 dark:text-white/90">
                      <span className="font-medium">Asked: </span>
                      {clip(entry.question, 240)}
                    </p>
                    <p className="mt-1 text-gray-600 dark:text-gray-300">
                      <span className="font-medium">{entry.kind === "team_answer" ? "Team said: " : "Replied: "}</span>
                      {clip(entry.answer, 240)}
                    </p>
                    {entry.reasons.length > 0 && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">What was wrong: {entry.reasons.join(", ")}</p>}
                    {entry.correction && <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">Should have said: {clip(entry.correction, 240)}</p>}
                    <MakeTestCase item={entry} />
                    {SHOW_REPLY_TRACE && entry.why && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Why she answered this way: {ROUTE_LABELS[entry.why.route as ReplyRoute] ?? entry.why.route}
                        {entry.why.routeReason ? ` (${entry.why.routeReason})` : ""}. {GROUNDING_LABELS[entry.why.grounding.verdict as GroundingVerdict] ?? ""}
                        {entry.why.grounding.missing.length > 0 ? `; not in her pages: ${entry.why.grounding.missing.join(", ")}` : ""}.
                        {entry.why.pagesUsed.length > 0 ? ` Pages: ${entry.why.pagesUsed.slice(0, 3).join("; ")}.` : ""}
                        {entry.why.skillsLoaded.length > 0 ? ` Skills loaded: ${entry.why.skillsLoaded.join(", ")}.` : ""}
                        {entry.why.events.length > 0 ? ` ${entry.why.events.join("; ")}.` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
