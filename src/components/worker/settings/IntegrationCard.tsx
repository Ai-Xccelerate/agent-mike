"use client";

import type { ReactNode } from "react";
import { panelClass } from "@/components/worker/settings/ui";

export type IntegrationCardStatus = "connected" | "disconnected" | "pending" | "failed" | "unavailable";

const PILL_STYLES: Record<IntegrationCardStatus, string> = {
  connected: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
  disconnected: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400",
  pending: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  failed: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  unavailable: "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500",
};

const PILL_LABEL: Record<IntegrationCardStatus, string> = {
  connected: "Connected",
  disconnected: "Not connected",
  pending: "Connecting…",
  failed: "Failed",
  unavailable: "Unavailable",
};

/** One `{used}/{max}`-style pill — reused so every card in the grid reads the state the same way. */
export function IntegrationStatusPill({ status }: { status: IntegrationCardStatus }) {
  return (
    <span className={`inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL_STYLES[status]}`}>
      {PILL_LABEL[status]}
    </span>
  );
}

/**
 * One connectable vendor: icon + name + status row, a one-line description,
 * optional extra note, and a single full-width action. Purely presentational
 * — the category section above owns the connect/disconnect state, since a
 * category can have several vendors sharing one connection slot (Email is
 * Gmail *or* Outlook, never both at once).
 */
export function IntegrationCard({
  icon,
  title,
  description,
  status,
  note,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status: IntegrationCardStatus;
  /** Shown under the description — e.g. why a vendor is unavailable right now. */
  note?: ReactNode;
  /** The connect/disconnect/retry control. Omitted entirely when there's nothing to do. */
  action?: ReactNode;
}) {
  const surfaceClass =
    status === "connected"
      ? "border-success-200 bg-success-50/40 dark:border-success-500/25 dark:bg-success-500/[0.04]"
      : "bg-white dark:bg-white/[0.03]";

  return (
    <div
      className={`flex h-full flex-col gap-5 p-6 ${panelClass} ${surfaceClass} ${
        status === "unavailable" ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
            <IntegrationStatusPill status={status} />
          </div>
          <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {note && <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{note}</p>}
      {action && <div className="mt-auto">{action}</div>}
    </div>
  );
}

/** Category heading above a grid of IntegrationCards — plain text, not a card; the vendors are the cards. */
export function IntegrationCategoryHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}
