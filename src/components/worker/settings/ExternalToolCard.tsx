"use client";

import Badge from "@/components/ui/badge/Badge";
import { PlugInIcon } from "@/icons";

/**
 * An external tool the worker does not connect to yet.
 *
 * A placeholder on purpose, and one that is honest about it: no credentials,
 * no calls, nothing to switch on. The toggle is present but inert so the card
 * reads as the same kind of thing as an internal tool, and disabled so nobody
 * believes they have enabled something. The link goes to the vendor's docs,
 * which is the only real thing here.
 */
export type ExternalTool = {
  name: string;
  description: string;
  /** What it would do for the worker once connected. */
  detail: string;
  docsUrl: string;
  docsLabel: string;
};

export default function ExternalToolCard({ tool }: { tool: ExternalTool }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <PlugInIcon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">{tool.name}</p>
            <Badge size="sm" color="light">
              Not connected
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {tool.description}
          </p>
        </div>

        <button
          role="switch"
          aria-checked={false}
          aria-label={`${tool.name} is not available yet`}
          disabled
          className="relative mt-0.5 h-6 w-11 shrink-0 cursor-not-allowed rounded-full bg-gray-200 opacity-40 dark:bg-gray-700"
        >
          <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-theme-sm" />
        </button>
      </div>

      <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {tool.detail}{" "}
        <a
          href={tool.docsUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-brand-500 hover:underline"
        >
          {tool.docsLabel}
        </a>
      </p>
    </div>
  );
}
