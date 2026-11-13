"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import IntegrationCategorySection from "@/components/worker/settings/IntegrationCategorySection";
import MailboxCard from "@/components/worker/settings/MailboxCard";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsSection from "@/components/worker/settings/SettingsSection";
import { cardClass, hintClass } from "@/components/worker/settings/ui";
import { GmailIcon, OutlookIcon } from "@/icons";
import { apiFetch, type MailConnection, type MailboxStatus } from "@/lib/worker-api";

const iconClass = "size-6";

const PLATFORM_NAME: Record<NonNullable<MailConnection["platform"]>, string> = { mailbox: "your mailbox", gmail: "Gmail" };

/** What the worker is connected to for email, whichever of the two ways it was connected. */
function MailSummary() {
  const [mail, setMail] = useState<MailConnection | null | "failed">(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch<MailboxStatus>("/mailbox")
      .then((status) => !cancelled && setMail(status.mail ?? null))
      .catch(() => !cancelled && setMail("failed"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (mail === null || mail === "failed") return null;
  const connected = mail.state === "connected" && mail.platform;
  const badge = connected
    ? { color: "success" as const, label: "Connected" }
    : mail.state === "reconnect"
      ? { color: "warning" as const, label: "Reconnect needed" }
      : { color: "light" as const, label: "Not connected" };
  return (
    <section className={`${cardClass} space-y-2`} aria-label="Email status">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white/90">Email</h2>
        <Badge size="sm" color={badge.color}>
          {badge.label}
        </Badge>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {connected
          ? `Connected through ${PLATFORM_NAME[mail.platform!]}${mail.address ? ` as ${mail.address}` : ""}. Identity shows the same.`
          : mail.state === "reconnect"
            ? "The connection stopped working. Reconnect below."
            : "No email is connected yet. Connect the mailbox or Gmail below."}
      </p>
      {mail.outlookReadOnly && (
        <p className="text-sm text-warning-700 dark:text-warning-400">
          Outlook can read messages but cannot send. To send the verification code and handoff emails, connect the mailbox or Gmail.
        </p>
      )}
    </section>
  );
}

/**
 * Connections > Email: every way to connect mail in one place, so it is clear which one the worker uses. The mailbox
 * (sign in with Google or Outlook) used to be under Tools, and Gmail and Outlook under Integrations.
 */
export default function EmailConnections() {
  return (
    <>
      <SettingsPageHeader title="Email" description="Where the worker sends and receives email. One connection is enough." />

      <MailSummary />

      <SettingsSection
        title="Mailbox"
        description="Sign in with Google or Outlook. The worker sends and receives email from this address."
        aixId="AIX-163.3"
        interactive={false}
      >
        <Suspense fallback={null}>
          <MailboxCard />
        </Suspense>
      </SettingsSection>

      <IntegrationCategorySection
        integrationType="email"
        vendors={[
          { system: "gmail", label: "Gmail", icon: <GmailIcon className={iconClass} /> },
          { system: "outlook", label: "Outlook", icon: <OutlookIcon className={iconClass} /> },
        ]}
        title="Gmail or Outlook"
        description="Gmail can send and receive. Outlook can only read messages, so use the mailbox above to send."
      />

      <SettingsSection
        title="Email domains"
        description="Decide which outside email domains the worker may share activity with."
        aixId="AIX-163.4"
        interactive={false}
      >
        <Link href="/settings/email-domains" className="text-sm font-medium text-brand-600 underline hover:text-brand-700 dark:text-brand-400">
          Manage email domains
        </Link>
        <p className={hintClass}>Adding and verifying your own sending domain is not available here yet.</p>
      </SettingsSection>
    </>
  );
}
