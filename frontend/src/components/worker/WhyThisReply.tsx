"use client";

import { useState } from "react";
import { GROUNDING_LABELS, ROUTE_LABELS, type GroundingVerdict, type ReplyTrace } from "@/lib/reply-trace";
import { getReplyTrace } from "@/lib/worker-api";

/**
 * "Why this reply?" under one of the worker's replies, for managers. It shows what was in play and what each check said,
 * and how closely her answer follows the pages she was given. It cannot show why a language model chose its words: that is
 * not something a model reports.
 */

const linkClass = "text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline dark:text-gray-400 dark:hover:text-gray-200";
const buttonClass =
  "inline-flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]";

const VERDICT_STYLE: Record<GroundingVerdict, string> = {
  follows_pages: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300",
  partly_in_pages: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300",
  not_in_pages: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300",
  too_few_names: "bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-0.5 py-1.5">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 break-words text-gray-800 dark:text-white/90">{children}</dd>
    </div>
  );
}

export default function WhyThisReply({ messageId, body }: { messageId: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ trace: ReplyTrace; text: string } | "none" | "failed" | null>(null);
  const [copied, setCopied] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && state === null) {
      try {
        setState(await getReplyTrace(messageId));
      } catch (error) {
        // A reply written before this existed has no record (404); anything else is a real failure.
        setState(error instanceof Error && /404|No record/i.test(error.message) ? "none" : "failed");
      }
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(`${text}\n\nThe reply:\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const loaded = state && typeof state === "object" ? state : null;
  const trace = loaded?.trace ?? null;
  const g = trace?.grounding;

  return (
    <div className="mt-1 flex max-w-full flex-col items-end gap-1.5">
      <button type="button" className={linkClass} aria-expanded={open} onClick={() => void toggle()}>
        {open ? "Hide why this reply" : "Why this reply?"}
      </button>
      {open && (
        <div className="w-full min-w-[16rem] max-w-xl rounded-xl border border-gray-200 bg-white p-3 text-left text-xs dark:border-white/[0.12] dark:bg-white/[0.03]">
          {state === null && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}
          {state === "none" && <p className="text-gray-500 dark:text-gray-400">There is no record for this reply. Replies written before this was added do not have one.</p>}
          {state === "failed" && <p className="text-error-600 dark:text-error-400">The record could not be loaded.</p>}
          {loaded && trace && g && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 font-medium ${VERDICT_STYLE[g.verdict]}`}>{GROUNDING_LABELS[g.verdict]}</span>
                {g.coverage !== null && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {Math.round(g.coverage * 100)}% of the {g.names} names she bolded are in {g.page ? `"${g.page}"` : "her pages"}
                  </span>
                )}
              </div>
              <dl className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
                <Row label="How">
                  {ROUTE_LABELS[trace.route]}
                  {trace.routeReason ? <span className="text-gray-500 dark:text-gray-400"> ({trace.routeReason})</span> : null}
                  {trace.events.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-amber-700 dark:text-amber-300">
                      {trace.events.map((event) => (
                        <li key={event}>{event}</li>
                      ))}
                    </ul>
                  )}
                </Row>
                <Row label="Pages she was given">
                  {trace.knowledge.sections.length === 0 ? (
                    "None"
                  ) : (
                    <>
                      <span className="text-gray-500 dark:text-gray-400">
                        From {trace.knowledge.via}
                        {trace.knowledge.cached ? ", remembered from a moment ago" : ""}
                      </span>
                      <ul className="mt-0.5 list-disc pl-4">
                        {trace.knowledge.sections.map((section, index) => (
                          <li key={`${section.title}-${index}`}>
                            {section.title}
                            {section.heading ? ` / ${section.heading}` : ""}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Row>
                {g.missing.length > 0 && <Row label="Not in the pages">{g.missing.join(", ")}</Row>}
                <Row label="Instructions">
                  {trace.instructions
                    ? `Role ${trace.instructions.roleChars} characters, job description ${trace.instructions.jobDescriptionChars}, additional instructions ${trace.instructions.additionalInstructions ? "on" : "off"}, tone "${trace.instructions.tone}", model ${trace.instructions.model}`
                    : "Not recorded for this kind of reply"}
                </Row>
                <Row label="Skills">
                  Available: {trace.skills.on.join(", ") || "none"}. Loaded this turn: {trace.skills.loaded.join(", ") || "none"}.
                </Row>
                <Row label="Tools">
                  Called: {trace.tools.called.join(", ") || "none"}
                </Row>
                <Row label="Checks">
                  {trace.checks.intent
                    ? `Scope: ${trace.checks.intent.outOfScope ? "outside her role" : "in scope"}, ${trace.checks.intent.escalate ? "should go to a person" : "no handoff"}, confidence ${trace.checks.intent.confidence}. `
                    : "Scope check did not run. "}
                  {trace.checks.reply ? `Reply: ${trace.checks.reply.action}.` : "Reply check did not run."}
                </Row>
                <Row label="Time">
                  {(trace.timing.elapsedMs / 1000).toFixed(1)} s{trace.timing.stages.length ? ` (${trace.timing.stages.map((stage) => `${stage.stage} ${stage.ms} ms`).join(", ")})` : ""}
                </Row>
              </dl>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" className={buttonClass} onClick={() => void copy(loaded.text)}>
                  {copied ? "Copied" : "Copy details"}
                </button>
                <span className="text-gray-400">The copy includes the reply's wording, so keep it away from places client details should not go.</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
