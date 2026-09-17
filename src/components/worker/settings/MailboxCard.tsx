"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ChevronDownIcon, EnvelopeIcon } from "@/icons";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import type { MailboxConnectionTest, MailboxStatus } from "@/lib/worker-api";
import { panelClass } from "@/components/worker/settings/ui";

/**
 * The worker's own mailbox and calendar, connected through Nylas.
 *
 * Sits under Tools > External tools, in place of the Nylas placeholder it
 * replaced. Worth remembering what it actually is, though: not a tool the
 * worker borrows, but the address it speaks as. A worker with no mailbox
 * cannot be emailed and cannot reply, which is why Identity points here.
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

  // Null means the manager has not decided, so the form follows the state of
  // the card: open when there is nothing configured and something must be done,
  // shut once an application is in place. Either way it can be toggled — an
  // unconfigured card that cannot be collapsed is a wall, not a form.
  const [setupOverride, setSetupOverride] = useState<boolean | null>(null);
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiUri, setApiUri] = useState("https://api.us.nylas.com");
  const [savingCreds, setSavingCreds] = useState<"idle" | "saving" | "error">("idle");
  const [credsError, setCredsError] = useState("");

  const load = useCallback(
    () =>
      apiFetch<MailboxStatus>("/mailbox")
        .then((data) => {
          setStatus(data);
          // Seed the region select from what's actually configured — not just
          // on first load but every refresh, so "Change application" on an
          // agent with an EU app shows EU rather than the US default, which
          // could otherwise get silently re-saved and orphan every mailbox.
          if (data.api_url) setApiUri(data.api_url);
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

  async function saveCredentials() {
    setSavingCreds("saving");
    setCredsError("");
    setNotice("");
    try {
      await apiFetch("/mailbox/credentials", {
        method: "PUT",
        body: JSON.stringify({ clientId: clientId.trim(), apiKey: apiKey.trim(), apiUri }),
      });
      // Never keep the secret in component state once it is stored.
      setClientId("");
      setApiKey("");
      setSavingCreds("idle");
      setSetupOverride(false);
      await load();
      setNoticeError(false);
      setNotice("Nylas application saved. You can connect a mailbox now.");
    } catch (error) {
      setSavingCreds("error");
      setCredsError(
        error instanceof WorkerApiError
          ? (error.errors?.clientId ?? error.errors?.apiKey ?? error.message)
          : "Could not save. Check that the API is running.",
      );
    }
  }

  async function clearCredentials() {
    setSavingCreds("saving");
    setCredsError("");
    try {
      await apiFetch("/mailbox/credentials", { method: "DELETE" });
      setSavingCreds("idle");
      setSetupOverride(false);
      await load();
      setNoticeError(false);
      setNotice("Now using the shared Nylas application.");
    } catch {
      setSavingCreds("error");
      setCredsError("Could not clear. Check that the API is running.");
    }
  }

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
          : "Could not start the connection. Check that the API is running.",
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
      setNotice("Could not disconnect. Check that the API is running.");
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
      setNotice("Could not run the test. Check that the API is running.");
    } finally {
      setTesting(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className={panelClass}>
        <div className="h-4 w-28 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="mt-3 h-3 w-full max-w-md animate-pulse rounded-md bg-gray-100 dark:bg-gray-800/70" />
      </div>
    );
  }

  if (phase === "failed" || !status) {
    return (
      <div className={panelClass}>
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Nylas</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Could not load the mailbox. Check that the API is running.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const badge = statusBadge(status);
  const mailbox = status.mailbox;
  const setupOpen = setupOverride ?? !status.available;
  // Same condition statusBadge uses for its "Reconnect needed" warning — kept
  // in sync so the badge and the reconnect action never disagree.
  const needsReconnect = Boolean(mailbox) && (mailbox?.status === "invalid" || !status.connected);

  return (
    <div className={panelClass}>
      <div className="flex items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <EnvelopeIcon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">Nylas</p>
            <Badge size="sm" color={badge.color}>
              {badge.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            The address this worker sends from and the calendar it books into. Connect one and it
            can reply to email and schedule like a teammate.
          </p>

          {!status.available && status.unavailableReason && (
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {status.unavailableReason}
            </p>
          )}

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

      {/*
        The setup form, rather than a note telling someone to go and edit env.
        An agent can bring its own Nylas application; if it does not, it uses
        the fleet's. Either way this is where it is decided, with no redeploy.
      */}
      <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <button
          type="button"
          aria-expanded={setupOpen}
          onClick={() => setSetupOverride(!setupOpen)}
          className="flex w-full items-start justify-between gap-3 p-4 text-left"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Nylas application
            </p>
            {!setupOpen && (
              <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                {status.credentials.source === "org"
                  ? "This agent has its own."
                  : status.credentials.source === "env"
                    ? "Using the shared application."
                    : "Not set up yet."}
              </p>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-2">
            {status.credentials.source !== "none" && (
              <Badge size="sm" color="light">
                {status.credentials.source === "org" ? "Own application" : "Shared"}
              </Badge>
            )}
            <ChevronDownIcon
              className={`size-4 text-gray-400 transition-transform ${setupOpen ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        {setupOpen && (
          <div className="border-t border-gray-100 p-4 dark:border-gray-800">
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                {status.credentials.source === "env"
                  ? "Using your organization's shared app. Enter values below to give this agent its own instead."
                  : status.credentials.source === "org"
                    ? "This agent has its own application. Clear it to fall back to the shared one."
                    : "Paste the client ID and API key from your Nylas dashboard."}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Client ID
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="1a2b3c4d-…"
                className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 font-mono text-xs text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
              />
            </label>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              API key
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  status.credentials.present.includes("apiKey") ? "•••••••• (set)" : "nyk_…"
                }
                autoComplete="new-password"
                className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 font-mono text-xs text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
              />
            </label>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:col-span-2">
              Region
              <select
                value={apiUri}
                onChange={(event) => setApiUri(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="https://api.us.nylas.com">United States</option>
                <option value="https://api.eu.nylas.com">Europe</option>
              </select>
              <span className="mt-1.5 block font-normal text-gray-500">
                Separate data residencies. Changing this after mailboxes are connected orphans
                every one of them.
              </span>
            </label>
          </div>

          {savingCreds === "error" && credsError && (
            <p className="mt-3 text-xs font-medium leading-5 text-error-600 dark:text-error-400">
              {credsError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              loading={savingCreds === "saving"}
              disabled={!clientId.trim() || !apiKey.trim()}
              onClick={() => void saveCredentials()}
            >
              Save application
            </Button>
            {status.credentials.source === "org" && (
              <Button size="sm" variant="outline" onClick={() => void clearCredentials()}>
                Use the shared one
              </Button>
            )}
          </div>

          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Register{" "}
            <code className="break-all font-mono text-[11px] text-gray-600 dark:text-gray-400">
              {status.callback_uri}
            </code>{" "}
              as a callback URI on the application, and add a connector for the provider you use.
              Nylas cannot create a grant without one.
            </p>
          </div>
        )}
      </div>

      {needsReconnect && (
        <p className="mt-3 text-xs font-medium leading-5 text-warning-600 dark:text-warning-400">
          This mailbox is no longer authorised. Reconnect it before the worker can send again.
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
              <>
                <Button size="sm" loading={busy} onClick={() => void connect()}>
                  {needsReconnect ? "Reconnect mailbox" : "Connect mailbox"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSetupOverride(true)}>
                  Change application
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" disabled={testing || busy} onClick={() => void runTest()}>
                  {testing ? "Testing…" : "Test connection"}
                </Button>
                <Button size="sm" variant="outline" disabled={busy || testing} onClick={() => void disconnect()}>
                  Disconnect
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSetupOverride(true)}>
                  Change application
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
                ? `Connected as ${test.email ?? "this mailbox"}: ${test.messageCount} recent messages, ${test.upcomingEvents.length} upcoming events.`
                : (test.error ?? "The connection test failed.")}
            </p>
          )}

          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Connecting saves straight away. The Save button above does not apply to it. Who the
            worker may write to is controlled separately, under Settings &gt; Email domains.
          </p>
        </>
      )}
    </div>
  );
}
