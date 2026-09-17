"use client";

import WorkerChat from "@/components/worker/WorkerChat";
import { InfoIcon } from "@/icons";

/**
 * The manager's sandbox — talk to this worker the way a visitor would,
 * against whatever configuration is saved right now. Reached from Settings >
 * Channels ("Open playground") and Overview ("Open test conversation").
 *
 * Distinct from Chat (a separate, not-yet-built conversational admin
 * assistant that will change settings on request): Playground only ever
 * talks to the worker's own configured agent, never to the platform itself.
 */
export default function WorkerPlayground() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-brand-50 px-4 py-2 text-xs text-brand-700 dark:border-gray-800 dark:bg-brand-500/15 dark:text-brand-400 sm:px-6">
        <InfoIcon className="size-3.5 shrink-0" />
        <span>
          Testing your last saved configuration. Unsaved edits on other settings pages won&apos;t appear here
          until you save them.
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <WorkerChat />
      </div>
    </div>
  );
}
