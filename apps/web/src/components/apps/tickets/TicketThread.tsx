import React from "react";
import AgentAvatar from "@/components/aix/AgentAvatar";
import { LockIcon } from "@/icons";

function AiChip() {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-white/5 dark:text-gray-400">
      AI
    </span>
  );
}

function HumanAvatar({ initials }: { initials: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {initials}
    </span>
  );
}

export default function TicketThread() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Conversation
        </h3>
      </div>
      <div className="space-y-6 p-5 md:p-6">
        <div className="flex gap-3">
          <HumanAvatar initials="DW" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Dana Whitmore
              </p>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                Meridian Logistics · 42 min ago
              </p>
            </div>
            <div className="mt-2 rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
              <p>
                Hi team — since we rotated our API key this morning, none of our
                webhook deliveries are coming through. Our order-sync endpoint
                shows zero events after 9:14 AM CST, and we&apos;re seeing 401s
                in our logs. We rotated the key from the settings page and
                updated it in our middleware. Orders are piling up, so this is
                fairly urgent for us.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <AgentAvatar name="Tony" size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Tony
              </p>
              <AiChip />
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                Replied in 38 sec · 41 min ago
              </p>
            </div>
            <div className="mt-2 rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
              <p>
                Hi Dana — thanks for the detail, that helped me find it quickly.
                I checked your workspace: the new API key is active, but your
                webhook subscriptions are still signed with the old key&apos;s
                signing secret. Rotating a key does not rotate the webhook
                signing secret automatically, so your endpoint is rejecting our
                deliveries as unauthorized.
              </p>
              <p className="mt-3">
                Two ways to fix it: (1) I can re-sign your three webhook
                subscriptions with the new secret right now — takes about a
                minute and I&apos;ll replay the 47 events queued since 9:14 AM
                CST, or (2) you can update the signing secret on your side under
                Settings → Developers → Webhooks. Which would you prefer?
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <AgentAvatar name="Tony" size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Tony
              </p>
              <AiChip />
              <span className="inline-flex items-center gap-1 text-theme-xs font-medium text-warning-600 dark:text-warning-500">
                <LockIcon className="size-3.5" />
                Internal note
              </span>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                35 min ago
              </p>
            </div>
            <div className="mt-2 rounded-xl bg-warning-50 p-4 text-sm leading-relaxed text-gray-700 dark:bg-warning-500/10 dark:text-gray-300">
              <p>
                Visible to team only. Meridian is on the Growth plan with 3
                active webhook subscriptions. Confidence on root cause: high —
                signing-secret mismatch confirmed against delivery logs. If Dana
                approves re-signing, no human action needed. Flagging Sarah Kim
                as backup since this account had a similar auth issue in March
                (TKT-1904).
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <HumanAvatar initials="DW" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Dana Whitmore
              </p>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                Meridian Logistics · 12 min ago
              </p>
            </div>
            <div className="mt-2 rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
              <p>
                Option 1 please — go ahead and re-sign them and replay the
                queued events. Appreciate the fast turnaround.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
