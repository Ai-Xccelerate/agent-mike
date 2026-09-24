"use client";

import Badge from "@/components/ui/badge/Badge";
import {
  getAssistantPanel,
  type AssistantPanel as PanelData,
  type AssistantPanelAction,
  type AssistantPanelItem,
  type AssistantPanelKind,
} from "@/lib/worker-api";
import Link from "next/link";
import { useEffect, useState } from "react";

const TONE_TO_BADGE = {
  success: "success",
  warning: "warning",
  error: "error",
  neutral: "light",
} as const;

/**
 * An interactive panel inside an Assistant reply: live status for skills,
 * knowledge, integrations, tools, channels, or email domains, with buttons
 * right on each row. A button never changes anything itself; it asks the
 * Assistant for a proposal, which shows up on the usual approval card.
 */
export default function AssistantPanel({
  kind,
  refreshToken,
  disabled,
  onAction,
}: {
  kind: AssistantPanelKind;
  /** Bumped whenever something may have changed, so the panel re-reads live state. */
  refreshToken: number;
  disabled: boolean;
  onAction: (action: AssistantPanelAction, item: AssistantPanelItem) => void;
}) {
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAssistantPanel(kind)
      .then((data) => {
        if (!cancelled) {
          setPanel(data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, refreshToken]);

  if (failed) {
    return (
      <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">
        Couldn&apos;t load this panel. Try again in a moment.
      </div>
    );
  }
  if (!panel) {
    return <div className="mt-3 h-24 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" />;
  }

  const visible = showAll ? panel.items : panel.items.slice(0, 8);

  return (
    <section
      aria-label={panel.title}
      className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{panel.title}</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{panel.description}</p>
        </div>
        <Link href={panel.settingsHref} className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
          Open in Settings
        </Link>
      </header>

      {panel.items.length === 0 ? (
        <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">{panel.emptyText ?? "Nothing here yet."}</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {visible.map((item) => (
            <li key={item.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">{item.title}</p>
                    {item.status && (
                      <Badge size="sm" color={TONE_TO_BADGE[item.status.tone]}>
                        {item.status.label}
                      </Badge>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                  )}
                  {item.note && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{item.note}</p>}
                  {item.detail && (
                    <button
                      type="button"
                      onClick={() => setOpen((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      aria-expanded={Boolean(open[item.id])}
                      className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                    >
                      {open[item.id] ? "Hide" : "Read"}
                    </button>
                  )}
                </div>
                {item.actions.length > 0 && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.actions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        disabled={disabled}
                        onClick={() => onAction(action, item)}
                        className={
                          action.variant === "primary"
                            ? "rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                            : "rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                        }
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {item.detail && open[item.id] && (
                <div className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-700 dark:bg-black/20 dark:text-gray-300">
                  {item.detail}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {panel.items.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="w-full border-t border-gray-100 px-4 py-2 text-xs font-medium text-brand-600 hover:bg-gray-50 dark:border-gray-800 dark:text-brand-400 dark:hover:bg-white/5"
        >
          {showAll ? "Show fewer" : `Show all ${panel.items.length}`}
        </button>
      )}
    </section>
  );
}
