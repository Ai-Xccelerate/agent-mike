"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import { connectionsHref } from "@/lib/connections";
import { mailStatusView, suggestedSupportEmail } from "@/lib/mail-status";
import { apiFetch, MailboxStatus } from "@/lib/worker-api";

/**
 * Whether the worker has email to send and receive from, whichever way it was connected (the mailbox, or Gmail under
 * Connections > Email), with the way to connect or change it. With a connected address that is not yet the support
 * email, offers it as the support email.
 */
export default function MailboxStatusLine({
  supportEmail,
  onUseAddress,
}: {
  supportEmail?: string | null;
  onUseAddress?: (address: string) => void;
}) {
  const [status, setStatus] = useState<MailboxStatus | null | "failed">(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch<MailboxStatus>("/mailbox")
      .then((next) => !cancelled && setStatus(next))
      .catch(() => !cancelled && setStatus("failed"));
    return () => {
      cancelled = true;
    };
  }, []);

  const view = mailStatusView(status);
  const suggestion = view.connected && onUseAddress ? suggestedSupportEmail(view.address, supportEmail) : null;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <span className="font-medium text-gray-700 dark:text-gray-300">{view.name}</span>
        {view.badge && (
          <Badge size="sm" color={view.badge.color}>
            {view.badge.label}
          </Badge>
        )}
        {view.address && <span className="text-xs text-gray-500">{view.address}</span>}
        <Link href={connectionsHref("email")} className="text-xs underline hover:text-brand-600 dark:hover:text-brand-400">
          {view.connected ? "Manage email" : "Connect email"}
        </Link>
        {suggestion && onUseAddress && (
          <button
            type="button"
            onClick={() => onUseAddress(suggestion)}
            className="text-xs font-medium text-brand-600 underline hover:text-brand-700 dark:text-brand-400"
          >
            Use {suggestion} as the support email
          </button>
        )}
      </div>
      {view.outlookNote && (
        <p className="text-xs text-warning-700 dark:text-warning-400">Outlook can read messages but cannot send. Connect the mailbox or Gmail to send.</p>
      )}
    </div>
  );
}
