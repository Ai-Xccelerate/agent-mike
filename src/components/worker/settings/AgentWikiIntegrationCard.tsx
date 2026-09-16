"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { PlugInIcon } from "@/icons";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import { NOT_CONNECTED_NOTE, panelClass } from "@/components/worker/settings/ui";
import type {
  AgentWikiConnectionTest,
  AgentWikiIntegration,
  AgentWikiPatch,
} from "@/lib/worker-api";

/**
 * Agent Wiki is opt-IN, and opt-in again before it may write.
 *
 * Two separate permissions decide whether the worker can change a page, and
 * the card has to be honest that only one of them lives here:
 *
 *   `settings.allow_write` — this manager's decision, editable below.
 *   `key_can_write`        — what the API key itself was granted when it was
 *                            created in Agent Wiki. The server enforces it and
 *                            it outranks the switch.
 *
 * So a read-only key with writing switched on is a real state, and the card
 * says so rather than letting someone believe the worker can edit the wiki.
 */
type Phase = "loading" | "ready" | "failed";

function statusBadge(integration: AgentWikiIntegration) {
  if (!integration.available) return { color: "light" as const, label: "Not configured" };
  if (!integration.enabled) return { color: "light" as const, label: "Off" };
  if (integration.error) return { color: "warning" as const, label: "Unreachable" };
  return { color: "success" as const, label: "Connected" };
}

export default function AgentWikiIntegrationCard() {
  const [integration, setIntegration] = useState<AgentWikiIntegration | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [test, setTest] = useState<AgentWikiConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(
    () =>
      apiFetch<AgentWikiIntegration>("/integrations/agent-wiki")
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

  async function patch(body: AgentWikiPatch) {
    if (!integration) return;
    setSaving(true);
    setNotice("");
    // A stale pass/fail under a changed setting is worse than none.
    setTest(null);
    try {
      await apiFetch<AgentWikiIntegration>("/integrations/agent-wiki", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      // PATCH answers with the stored status only. Re-read so the live tool
      // surface — and any Agent Wiki outage behind it — is current.
      setIntegration(await apiFetch<AgentWikiIntegration>("/integrations/agent-wiki"));
    } catch (error) {
      if (error instanceof WorkerApiError) {
        setNotice(error.errors?.enabled ?? error.errors?.allowWrite ?? error.message);
      } else {
        setNotice("Could not save — check that the API is running.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setNotice("");
    try {
      setTest(
        await apiFetch<AgentWikiConnectionTest>("/integrations/agent-wiki/test", {
          method: "POST",
        }),
      );
    } catch {
      setNotice("Could not run the test — check that the API is running.");
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
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Agent Wiki</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Could not load this integration — check that the API is running.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const badge = statusBadge(integration);
  const allowWrite = integration.settings.allow_write;
  // Only meaningful once the tool surface has actually been read.
  const keyIsReadOnly = integration.key_can_write === false;

  return (
    <div className={panelClass}>
      <div className="flex items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <PlugInIcon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              {integration.name}
            </p>
            <Badge size="sm" color={badge.color}>
              {badge.label}
            </Badge>
            {integration.enabled && allowWrite && !keyIsReadOnly && (
              <Badge size="sm" color="warning">
                Can edit pages
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {integration.description}
          </p>
        </div>

        <button
          role="switch"
          aria-checked={integration.enabled}
          aria-label={`${integration.enabled ? "Disable" : "Enable"} Agent Wiki`}
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
          Agent Wiki did not answer: {integration.error}
        </p>
      )}

      {notice && (
        <p className="mt-3 text-xs font-medium leading-5 text-error-600 dark:text-error-400">
          {notice}
        </p>
      )}

      {integration.enabled && integration.available && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <label className="min-w-0 flex-1 basis-56">
              <span className="block text-xs text-gray-500 dark:text-gray-400">Space</span>
              <select
                value={integration.settings.space_id ?? ""}
                disabled={saving || integration.spaces.length === 0}
                onChange={(event) =>
                  void patch({ spaceId: event.target.value === "" ? null : event.target.value })
                }
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">All spaces this key reaches</option>
                {integration.spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                    {space.role ? ` — ${space.role}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <Button size="sm" variant="outline" disabled={testing} onClick={() => void runTest()}>
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </div>

          <div className="mt-4 flex items-start justify-between gap-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Let this worker change pages
              </p>
              <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Off, the worker reads and searches only. On, it can also write, rename, move and
                delete pages in the space above.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={allowWrite}
              aria-label={`${allowWrite ? "Stop" : "Allow"} Agent Wiki changing pages`}
              disabled={saving}
              onClick={() => void patch({ allowWrite: !allowWrite })}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40 ${
                allowWrite ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform ${
                  allowWrite ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          {allowWrite && keyIsReadOnly && (
            <p className="mt-3 text-xs font-medium leading-5 text-warning-600 dark:text-warning-400">
              This key cannot change pages, so Agent Wiki will refuse every write regardless of this
              switch. Create a key with &ldquo;let this key change pages&rdquo; enabled to allow it.
            </p>
          )}

          {test && (
            <p
              className={`mt-3 text-xs font-medium leading-5 ${
                test.ok
                  ? "text-success-600 dark:text-success-400"
                  : "text-error-600 dark:text-error-400"
              }`}
            >
              {test.ok
                ? `Connected — ${test.toolCount} tools, ${test.spaces.length} spaces, ${
                    test.canWrite ? "key can change pages" : "read-only key"
                  }.`
                : (test.error ?? "The connection test failed.")}
            </p>
          )}


        </>
      )}
    </div>
  );
}
