"use client";

import type { AssistantPendingAction } from "@/lib/worker-api";
import { useState } from "react";

/**
 * The Approve / Cancel card for whatever the Assistant has proposed. Shows
 * the exact change (details), not just a summary, so the manager approves
 * what will actually be written. One decision covers the whole batch the
 * card lists - the server refuses it if that batch has changed since.
 */
export default function AssistantApprovalCard({
  actions,
  busy,
  readOnly = false,
  onDecide,
}: {
  actions: AssistantPendingAction[];
  busy: boolean;
  /** Members can see what's proposed, but only owners and admins decide. */
  readOnly?: boolean;
  onDecide: (decision: "approve" | "cancel") => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (actions.length === 0) return null;
  const isAction = actions.some((action) => action.kind === "action");

  return (
    <div
      role="group"
      aria-label="Waiting for your approval"
      className="ml-10 max-w-[82%] rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-500/30 dark:bg-brand-500/10"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
        {isAction ? "Action needs your approval" : actions.length > 1 ? "Changes need your approval" : "Change needs your approval"}
      </p>
      <ul className="mt-2 space-y-2">
        {actions.map((action) => (
          <li key={action.id} className="text-sm text-gray-800 dark:text-white/90">
            <p>{action.summary}</p>
            {action.details && (
              <>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [action.id]: !prev[action.id] }))}
                  aria-expanded={Boolean(expanded[action.id])}
                  className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  {expanded[action.id] ? "Hide details" : "Show exactly what changes"}
                </button>
                {expanded[action.id] && (
                  <div className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2.5 text-xs leading-5 text-gray-700 dark:bg-black/20 dark:text-gray-300">
                    {action.details}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {readOnly ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Only workspace owners and admins can approve changes.
        </p>
      ) : (
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide("approve")}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {actions.length > 1 ? "Approve all" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide("cancel")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
      )}
      {!readOnly && (
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          Nothing changes until you approve. You can also reply in your own words.
        </p>
      )}
    </div>
  );
}
