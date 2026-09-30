"use client";

import { useEffect, useState } from "react";
import { decideQueuedApproval, listPendingApprovals, type QueuedApproval } from "@/lib/worker-api";

const APP_LABEL: Record<string, string> = {
  jira: "Jira",
  confluence: "Confluence",
  linear: "Linear",
  zoho: "Zoho CRM",
  gmail: "Gmail",
  outlook: "Outlook",
  googlecalendar: "Google Calendar",
};

/** JIRA_ADD_COMMENT → "add comment". */
function humanizeAction(action: string, app: string): string {
  const prefix = `${app.toUpperCase()}_`;
  const bare = action.toUpperCase().startsWith(prefix) ? action.slice(prefix.length) : action;
  return bare.toLowerCase().replace(/_/g, " ");
}

function describe(approval: QueuedApproval): { summary: string; details: string } {
  const input = approval.input ?? {};
  if (approval.toolId === "composio_action") {
    const app = String(input.app ?? "");
    const action = String(input.action ?? "");
    return {
      summary: `${APP_LABEL[app] ?? app}: ${humanizeAction(action, app)}`,
      details: JSON.stringify(input.arguments ?? {}, null, 2),
    };
  }
  if (approval.toolId === "gmail_send_email") {
    return {
      summary: `Send an email to ${String(input.to ?? "")}${input.subject ? `. Subject: "${String(input.subject)}"` : ""}`,
      details: String(input.body ?? ""),
    };
  }
  if (approval.toolId === "gmail_reply_to_thread") {
    return { summary: `Reply by email to ${String(input.to ?? "")}`, details: String(input.body ?? "") };
  }
  return { summary: approval.toolId, details: JSON.stringify(input, null, 2) };
}

/**
 * Changes the customer-facing agent queued in this conversation (a delete, a
 * reassignment, an email to someone new…). Nothing in them has happened yet;
 * Approve runs it for real, Reject discards it. Mount it keyed by the
 * conversation id so switching conversations starts it fresh.
 */
export default function InboxApprovals({ conversationId, refreshKey }: { conversationId: string; refreshKey: number }) {
  const [pending, setPending] = useState<QueuedApproval[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPendingApprovals(conversationId)
      .then((rows) => {
        if (!cancelled) setPending(rows.filter((row) => row.status === "pending"));
      })
      .catch(() => {
        if (!cancelled) setPending([]);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, refreshKey]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    try {
      const result = await decideQueuedApproval(id, decision);
      setPending((rows) => rows.filter((row) => row.id !== id));
      if (decision === "rejected") setOutcome({ ok: true, text: "Rejected. Nothing was changed." });
      else if (result.applied && !result.applied.ok) setOutcome({ ok: false, text: `Approved, but it failed: ${result.applied.output}` });
      else setOutcome({ ok: true, text: "Approved and done." });
    } catch (error) {
      setOutcome({ ok: false, text: error instanceof Error ? error.message : "Could not record your decision." });
    } finally {
      setBusyId(null);
    }
  }

  if (pending.length === 0 && !outcome) return null;

  return (
    <div
      role="group"
      aria-label="Changes waiting for approval"
      className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-500/30 dark:bg-brand-500/10"
    >
      {pending.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
            {pending.length > 1 ? `${pending.length} changes need your approval` : "Change needs your approval"}
          </p>
          <ul className="mt-2 space-y-3">
            {pending.map((approval) => {
              const { summary, details } = describe(approval);
              return (
                <li key={approval.id} className="text-sm text-gray-800 dark:text-white/90">
                  <p>{summary}</p>
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [approval.id]: !prev[approval.id] }))}
                    aria-expanded={Boolean(expanded[approval.id])}
                    className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    {expanded[approval.id] ? "Hide details" : "Show exactly what changes"}
                  </button>
                  {expanded[approval.id] && (
                    <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2.5 text-xs leading-5 text-gray-700 dark:bg-black/20 dark:text-gray-300">
                      {details}
                    </pre>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => decide(approval.id, "approved")}
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      {busyId === approval.id ? "Working…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => decide(approval.id, "rejected")}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {outcome && (
        <p
          className={`${pending.length > 0 ? "mt-3" : ""} text-xs ${
            outcome.ok ? "text-success-700 dark:text-success-400" : "text-warning-700 dark:text-warning-400"
          }`}
        >
          {outcome.text}
        </p>
      )}
    </div>
  );
}
