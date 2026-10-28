"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import { apiFetch, MailboxStatus } from "@/lib/worker-api";

/** Whether the worker has a mailbox to send and receive from, with the way to connect one. */
export default function MailboxStatusLine() {
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

  const badge =
    status === null
      ? null
      : status === "failed"
        ? { color: "light" as const, label: "Status unavailable" }
        : !status.available
          ? { color: "light" as const, label: "Not configured" }
          : !status.mailbox
            ? { color: "light" as const, label: "Not connected" }
            : status.mailbox.status === "invalid" || !status.connected
              ? { color: "warning" as const, label: "Reconnect needed" }
              : { color: "success" as const, label: "Connected" };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
      <span className="font-medium text-gray-700 dark:text-gray-300">Mailbox</span>
      {badge && (
        <Badge size="sm" color={badge.color}>
          {badge.label}
        </Badge>
      )}
      {status && status !== "failed" && status.mailbox?.email && <span className="text-xs text-gray-500">{status.mailbox.email}</span>}
      <Link href="/settings/tools" className="text-xs underline hover:text-brand-600 dark:hover:text-brand-400">
        {status && status !== "failed" && status.mailbox ? "Manage mailbox" : "Connect a mailbox"}
      </Link>
    </div>
  );
}
