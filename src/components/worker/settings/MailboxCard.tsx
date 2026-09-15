"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { EnvelopeIcon } from "@/icons";
import { NOT_CONNECTED_NOTE } from "@/components/worker/settings/ui";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import type { MailboxConnectionTest, MailboxStatus } from "@/lib/worker-api";

/**
 * The worker's own mailbox and calendar.
 *
 * This is identity, not an integration, which is why it sits on Identity next
 * to the name and the signature rather than under Tools: it is the address the
 * agent speaks as. A worker with no mailbox is a worker that cannot be emailed
 * and cannot reply.
 *
 * Connecting leaves the app — Nylas hosts the provider consent screen — so the
 * flow is: ask the API for a URL, send the browser there, and pick the result
 * back up from the query string when the callback returns here.
 */
type Phase = "loading" | "ready" | "failed";

function statusBadge(status: MailboxStatus) {
  if (!status.available) return { color: "light" as const, label: "Not configured" };
  if (!status.mailbox) return { color: "light" as const, label: "Not connected" };
  if (status.mailbox.status === "invalid" || !status.connected) {
    return { color: "warning" as const, label: "Reconnect needed" };
  }
  return { color: "success" as const, label: "Connected" };
}

/** Why the callback bounced, in words a manager can act on. */
const CALLBACK_REASONS: Record<string, string> = {
  invalid_state: "That connection link expired. Start again.",
  missing_code: "The provider did not return an authorisation code.",
  access_denied: "Permission was declined at the provider.",
  exchange_failed: "Nylas could not complete the connection.",
  grant_invalid: "The provider rejected the grant.",
  unconfigured: "Nylas is not configured on this server.",
};

export default function MailboxCard() {
  const params = useSearchParams();
  const [status, setStatus] = useState<MailboxStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [test, setTest] = useState<MailboxConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(
    () =>
      apiFetch<MailboxStatus>("/mailbox")
        .then((data) => {
          setStatus(data);
          setPhase("ready");
        })
        .catch(() => setPhase("failed")),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The connect flow leaves the app entirely, so its outcome comes back in the
  // query string rather than as a resolved promise. Read once at mount and
  // held, because the effect below strips it from the URL immediately after.
  const [callbackOutcome] = useState(() => {
    const outcome = params.get("mailbox");
    if (!outcome) return null;
    if (outcome === "connected") return { ok: true, message: "Mailbox connected." };
    const reason = params.get("reason") ?? "";
    return { ok: false, message: CALLBACK_REASONS[reason] ?? "Could not connect that mailbox." };
  });

  // Strip it so a refresh does not replay a stale "connected" banner.
  useEffect(() => {
    if (callbackOutcome) window.history.replaceState({}, "", window.location.pathname);
  }, [callbackOutcome]);

  async function connect() {
    setBusy(true);
    setNotice("");
    setTest(null);
    try {
      const { redirectUrl } = await apiFetch<{ redirectUrl: string }>("/mailbox/connect", {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.location.href = redirectUrl;
    } catch (error) {
      setNoticeError(true);
      setNotice(
        error instanceof WorkerApiError
          ? (error.errors?.mailbox ?? error.message)
          : "Could not start the connection — check that the API is running.",
      );
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setNotice("");
    setTest(null);
    try {
      await apiFetch("/mailbox", { method: "DELETE" });
      await load();
      setNoticeError(false);
      setNotice("Mailbox disconnected. The worker can no longer send or receive email.");
    } catch {
      setNoticeError(true);
      setNotice("Could not disconnect — check that the API is running.");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setNotice("");
    try {
      setTest(await apiFetch<MailboxConnectionTest>("/mailbox/test", { method: "POST" }));
    } catch {
      setNoticeError(true);
      setNotice("Could not run the test — check that the API is running.");
    } finally {
      setTesting(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <div className="h-4 w-28 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="mt-3 h-3 w-full max-w-md animate-pulse rounded-md bg-gray-100 dark:bg-gray-800/70" />
      </div>
    );
  }

  if (phase === "failed" || !status) {
    return (
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Mailbox</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Could not load the mailbox — check that the API is running.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const badge = statusBadge(status);
  const mailbox = status.mailbox;
  const needsReconnect = Boolean(mailbox) && !status.connected;

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <EnvelopeIcon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">Mailbox</p>
            <Badge size="sm" color={badge.color}>
              {badge.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            The address this worker sends from and the calendar it books into. Connect one and it
            can reply to email and schedule like a teammate.
          </p>

          {mailbox && (
            <p className="mt-2 truncate font-mono text-xs text-gray-700 dark:text-gray-300">
              {mailbox.email}
              {mailbox.provider && (
                <span className="ml-2 font-sans text-gray-400 dark:text-gray-500">
                  {mailbox.provider}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {!status.available && (
        <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{NOT_CONNECTED_NOTE}</p>
      )}

      {needsReconnect && (
        <p className="mt-3 text-xs font-medium leading-5 text-warning-600 dark:text-warning-400">
          This mailbox is no longer authorised — reconnect it before the worker can send again.
        </p>
      )}

      {status.error && !needsReconnect && (
        <p className="mt-3 text-xs font-medium leading-5 text-warning-600 dark:text-warning-400">
          Nylas did not answer: {status.error}
        </p>
      )}

      {/* An action taken on this screen outranks the banner the callback left. */}
      {(notice || callbackOutcome) && (
        <p
          className={`mt-3 text-xs font-medium leading-5 ${
            (notice ? noticeError : !callbackOutcome?.ok)
              ? "text-error-600 dark:text-error-400"
              : "text-success-600 dark:text-success-400"
          }`}
        >
          {notice || callbackOutcome?.message}
        </p>
      )}

      {status.available && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            {!mailbox || needsReconnect ? (
              <Button size="sm" loading={busy} onClick={() => void connect()}>
                {needsReconnect ? "Reconnect mailbox" : "Connect mailbox"}
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" disabled={testing} onClick={() => void runTest()}>
                  {testing ? "Testing…" : "Test connection"}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void disconnect()}>
                  Disconnect
                </Button>
              </>
            )}
          </div>

          {test && (
            <p
              className={`mt-3 text-xs font-medium leading-5 ${
                test.ok
                  ? "text-success-600 dark:text-success-400"
                  : "text-error-600 dark:text-error-400"
              }`}
            >
              {test.ok
                ? `Connected as ${test.email ?? "this mailbox"} — ${test.messageCount} recent messages, ${test.upcomingEvents.length} upcoming events.`
                : (test.error ?? "The connection test failed.")}
            </p>
          )}

          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Connecting saves straight away — the Save button above does not apply to it. Who the
            worker may write to is controlled separately, under Settings &gt; Email domains.
          </p>
        </>
      )}
    </div>
  );
}
