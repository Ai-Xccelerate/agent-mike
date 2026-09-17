"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { PlugInIcon } from "@/icons";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import type { ScribeConnectionTest, ScribeIntegration, ScribePatch } from "@/lib/worker-api";
import { NOT_CONNECTED_NOTE, panelClass } from "@/components/worker/settings/ui";

/**
 * Scribe is opt-IN.
 *
 * Every Scribe tool is read-only, so the concern is not what the worker might
 * change — it is what the worker might repeat. Meeting transcripts are
 * internal talk, so the card is explicit about that above the switch rather
 * than burying it, and stays off until a manager decides otherwise.
 */
type Phase = "loading" | "ready" | "failed";

/** Null means the whole corpus — no lower bound on meeting age. */
const LOOKBACK_CHOICES: Array<{ value: number | null; label: string }> = [
  { value: null, label: "All meetings" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last year" },
];

function statusBadge(integration: ScribeIntegration) {
  if (!integration.available) return { color: "light" as const, label: "Not configured" };
  if (!integration.enabled) return { color: "light" as const, label: "Off" };
  if (integration.error) return { color: "warning" as const, label: "Unreachable" };
  return { color: "success" as const, label: "Connected" };
}

export default function ScribeIntegrationCard() {
  const [integration, setIntegration] = useState<ScribeIntegration | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [test, setTest] = useState<ScribeConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(
    () =>
      apiFetch<ScribeIntegration>("/integrations/scribe")
        .then((data) => {
          setIntegration(data);
          setPhase("ready");
        })
        .catch(() => setPhase("failed")),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function retry() {
    setPhase("loading");
    setNotice("");
    void load();
  }

  async function patch(body: ScribePatch) {
    if (!integration) return;
    setSaving(true);
    setNotice("");
    // A stale pass/fail under a changed setting is worse than none.
    setTest(null);
    try {
      await apiFetch<ScribeIntegration>("/integrations/scribe", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      // PATCH answers with the stored status only. Re-read so the live corpus
      // lookup — and any Scribe outage behind it — is current.
      setIntegration(await apiFetch<ScribeIntegration>("/integrations/scribe"));
    } catch (error) {
      if (error instanceof WorkerApiError) {
        setNotice(error.errors?.enabled ?? error.message);
      } else {
        setNotice("Could not save. Check that the API is running.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setNotice("");
    try {
      setTest(await apiFetch<ScribeConnectionTest>("/integrations/scribe/test", { method: "POST" }));
    } catch {
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

  if (phase === "failed" || !integration) {
    return (
      <div className={panelClass}>
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Scribe</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Could not load this integration. Check that the API is running.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const badge = statusBadge(integration);

  return (
    <div className={panelClass}>
      <div className="flex items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <PlugInIcon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">{integration.name}</p>
            <Badge size="sm" color={badge.color}>
              {badge.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {integration.description}
          </p>
        </div>

        <button
          role="switch"
          aria-checked={integration.enabled}
          aria-label={`${integration.enabled ? "Disable" : "Enable"} Scribe`}
          disabled={!integration.available || saving}
          onClick={() => void patch({ enabled: !integration.enabled })}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40 ${
            integration.enabled ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform ${
              integration.enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {!integration.available && (
        <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{NOT_CONNECTED_NOTE}</p>
      )}

      {integration.error && (
        <p className="mt-3 text-xs font-medium leading-5 text-warning-600 dark:text-warning-400">
          Scribe did not answer: {integration.error}
        </p>
      )}

      {notice && (
        <p className="mt-3 text-xs font-medium leading-5 text-error-600 dark:text-error-400">{notice}</p>
      )}

      {integration.enabled && integration.available && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <label className="min-w-0 flex-1 basis-56">
              <span className="block text-xs text-gray-500 dark:text-gray-400">Meeting window</span>
              <select
                value={integration.settings.lookback_days ?? ""}
                disabled={saving}
                onChange={(event) =>
                  void patch({
                    lookbackDays: event.target.value === "" ? null : Number(event.target.value),
                  })
                }
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                {LOOKBACK_CHOICES.map((choice) => (
                  <option key={choice.label} value={choice.value ?? ""}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>

            <Button size="sm" variant="outline" disabled={testing} onClick={() => void runTest()}>
              {testing ? "Testing…" : "Test connection"}
            </Button>
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
                ? `Connected: ${test.meetingCount} meetings available.`
                : (test.error ?? "The connection test failed.")}
            </p>
          )}

          {integration.recent_meetings.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Most recent of {integration.meeting_count ?? integration.recent_meetings.length} meetings
              </p>
              <ul className="mt-2 space-y-1">
                {integration.recent_meetings.map((meeting) => (
                  <li key={meeting.id} className="truncate text-xs text-gray-700 dark:text-gray-300">
                    {meeting.title}
                    {meeting.startTime && (
                      <span className="text-gray-400 dark:text-gray-500">
                        {" "}
                        ({meeting.startTime.slice(0, 10)})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
