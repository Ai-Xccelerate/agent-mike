"use client";

import { useEffect, useRef, useState } from "react";
import { CORRECTION_MAX_LENGTH, FEEDBACK_REASONS, FEEDBACK_REASON_LABELS, type FeedbackReason } from "@/lib/answer-feedback";
import { rateReply, unrateReply, type AnswerFeedback } from "@/lib/worker-api";

/**
 * "Was this right?" under one of the worker's replies. A manager marks it good or bad; for bad they say what was wrong
 * and, if they like, what it should have said. The rating is theirs to change or take back. Ratings are kept inside
 * Mike: they feed the Overview's answer quality and, later, the test set.
 */

function Thumb({ down = false }: { down?: boolean }) {
  return (
    <svg className={`size-4 ${down ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 3.2-6.4A1.8 1.8 0 0 1 11.8 4h.2a2 2 0 0 1 2 2v3.5h4.6a2 2 0 0 1 1.96 2.4l-1.2 6A2 2 0 0 1 17.4 19.5H9a2 2 0 0 1-2-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]";
const linkClass = "text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline dark:text-gray-400 dark:hover:text-gray-200";

export default function AnswerFeedbackControls({
  messageId,
  ratings,
  onChange,
}: {
  messageId: string;
  /** Every rating on this reply, from every manager. */
  ratings: AnswerFeedback[];
  /** The signed-in manager's rating after a change, or null when they took it back. */
  onChange: (next: AnswerFeedback | null) => void;
}) {
  const mine = ratings.find((entry) => entry.mine) ?? null;
  const others = ratings.filter((entry) => !entry.mine);
  const [editing, setEditing] = useState(false);
  const [reasons, setReasons] = useState<FeedbackReason[]>([]);
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  // The form opens at the bottom of the thread, under the reply box; bring all of it, Save included, into view.
  useEffect(() => {
    if (editing) formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [editing]);

  async function save(rating: "good" | "bad") {
    setSaving(true);
    setError("");
    try {
      const saved = await rateReply(messageId, rating === "good" ? { rating } : { rating, reasons, correction: correction.trim() || null });
      onChange(saved);
      setEditing(false);
    } catch {
      setError("Couldn't save that rating. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    setSaving(true);
    setError("");
    try {
      await unrateReply(messageId);
      onChange(null);
      setEditing(false);
    } catch {
      setError("Couldn't take that back. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function startBad() {
    setReasons(mine?.rating === "bad" ? mine.reasons : []);
    setCorrection(mine?.rating === "bad" ? (mine.correction ?? "") : "");
    setEditing(true);
  }

  const othersNote =
    others.length > 0 ? `${others.length} other ${others.length === 1 ? "rating" : "ratings"}${others.some((entry) => entry.rating === "bad") ? `, ${others.filter((entry) => entry.rating === "bad").length} bad` : ""}` : null;

  return (
    <div className="mt-1.5 flex max-w-full flex-col items-end gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      {editing ? (
        <div ref={formRef} className="w-full min-w-[16rem] max-w-md rounded-xl border border-gray-200 bg-white p-3 text-left dark:border-white/[0.12] dark:bg-white/[0.03]">
          <p className="font-medium text-gray-800 dark:text-white/90">What was wrong?</p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="What was wrong">
            {FEEDBACK_REASONS.map((reason) => {
              const on = reasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setReasons((current) => (on ? current.filter((entry) => entry !== reason) : [...current, reason]))}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    on
                      ? "border-brand-500 bg-brand-50 font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.12] dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  {FEEDBACK_REASON_LABELS[reason]}
                </button>
              );
            })}
          </div>
          <label className="mt-3 block text-gray-700 dark:text-gray-300">
            What should it have said? <span className="text-gray-400">(optional)</span>
            <textarea
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
              maxLength={CORRECTION_MAX_LENGTH}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.15] dark:text-white/90"
            />
          </label>
          <p className="mt-1 text-[11px] text-gray-400">Please leave out client or patient details.</p>
          {error && <p className="mt-2 text-error-600 dark:text-error-400">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" disabled={saving} onClick={() => void save("bad")} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              {saving ? "Saving…" : "Save rating"}
            </button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className={linkClass}>
              Cancel
            </button>
          </div>
        </div>
      ) : mine ? (
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
            <Thumb down={mine.rating === "bad"} />
            You rated this {mine.rating}
            {mine.rating === "bad" && mine.reasons.length > 0 && `: ${mine.reasons.map((reason) => FEEDBACK_REASON_LABELS[reason]).join(", ")}`}
          </span>
          <button type="button" disabled={saving} onClick={startBad} className={linkClass}>
            {mine.rating === "bad" ? "Edit" : "Change"}
          </button>
          <button type="button" disabled={saving} onClick={() => void undo()} className={linkClass}>
            Undo
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span>Was this right?</span>
          <button type="button" disabled={saving} onClick={() => void save("good")} aria-label="Rate this reply good" className={buttonClass}>
            <Thumb /> Good
          </button>
          <button type="button" disabled={saving} onClick={startBad} aria-label="Rate this reply bad" className={buttonClass}>
            <Thumb down /> Bad
          </button>
        </div>
      )}
      {mine?.rating === "bad" && mine.correction && !editing && (
        <p className="max-w-md text-right italic text-gray-500 dark:text-gray-400">&ldquo;{mine.correction}&rdquo;</p>
      )}
      {othersNote && !editing && <p className="text-gray-400">{othersNote}</p>}
      {error && !editing && <p className="text-error-600 dark:text-error-400">{error}</p>}
    </div>
  );
}
