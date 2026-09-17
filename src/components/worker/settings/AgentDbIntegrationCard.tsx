"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { PlugInIcon } from "@/icons";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import { NOT_CONNECTED_NOTE, panelClass } from "@/components/worker/settings/ui";
import type {
  AgentDbConnectionTest,
  AgentDbIntegration,
  AgentDbPatch,
} from "@/lib/worker-api";

/**
 * AgentDB is opt-IN, the opposite of Parchment.
 *
 * Parchment is read-only grounding, so it defaults on and its switch reads as
 * an opt-out. AgentDB connects the worker to the organization's live database,
 * so it stays off until a manager deliberately turns it on here — and the card
 * says plainly that the worker's access is read-only once it is on.
 *
 * `available` is the server's own configuration and always wins: with no
 * credentials the API refuses to enable it, so the switch is disabled rather
 * than offering a change that would come back 422.
 */
type Phase = "loading" | "ready" | "failed";

function statusBadge(integration: AgentDbIntegration) {
  if (!integration.available) return { color: "light" as const, label: "Not configured" };
  if (!integration.enabled) return { color: "light" as const, label: "Off" };
  if (integration.has_access === false) return { color: "warning" as const, label: "No access" };
  if (integration.error) return { color: "warning" as const, label: "Unreachable" };
  return { color: "success" as const, label: "Connected" };
}

function workspaceLabel(integration: AgentDbIntegration) {
  const selectedId = integration.settings.workspace_id;
  if (selectedId) {
    const named = integration.workspaces.find((workspace) => workspace.id === selectedId);
    return named ? named.name : selectedId;
  }
  const fallback = integration.workspaces.find(
    (workspace) => workspace.id === integration.default_workspace_id,
  );
  return fallback ? `Organization default: ${fallback.name}` : "Organization default";
}

export default function AgentDbIntegrationCard() {
  const [integration, setIntegration] = useState<AgentDbIntegration | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [test, setTest] = useState<AgentDbConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(
    () =>
      apiFetch<AgentDbIntegration>("/integrations/agentdb")
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

  async function patch(body: AgentDbPatch) {
    if (!integration) return;
    setSaving(true);
    setNotice("");
    // A stale pass/fail under a changed setting is worse than none.
    setTest(null);
    try {
      await apiFetch<AgentDbIntegration>("/integrations/agentdb", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      // PATCH answers with the stored status only. Re-read so the live
      // workspace lookup — and any AgentDB outage behind it — is current.
      setIntegration(await apiFetch<AgentDbIntegration>("/integrations/agentdb"));
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
      setTest(await apiFetch<AgentDbConnectionTest>("/integrations/agentdb/test", { method: "POST" }));
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
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">AgentDB</p>
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
  const workspaceOptions = integration.workspaces;

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
          aria-label={`${integration.enabled ? "Disable" : "Enable"} AgentDB`}
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

      {integration.has_access === false && (
        <p className="mt-3 text-xs font-medium leading-5 text-warning-600 dark:text-warning-400">
          This organization is not entitled to AgentDB in AIX Core.
        </p>
      )}

      {integration.error && integration.has_access !== false && (
        <p className="mt-3 text-xs font-medium leading-5 text-warning-600 dark:text-warning-400">
          AgentDB did not answer: {integration.error}
        </p>
      )}

      {notice && (
        <p className="mt-3 text-xs font-medium leading-5 text-error-600 dark:text-error-400">{notice}</p>
      )}

      {integration.enabled && integration.available && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <label className="min-w-0 flex-1 basis-56">
              <span className="block text-xs text-gray-500 dark:text-gray-400">Workspace</span>
              <select
                value={integration.settings.workspace_id ?? ""}
                disabled={saving || workspaceOptions.length === 0}
                onChange={(event) =>
                  void patch({ workspaceId: event.target.value === "" ? null : event.target.value })
                }
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">{workspaceLabel(integration)}</option>
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
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
                ? `Connected: AgentDB returned its schema guide (${test.agentsMdBytes} characters).`
                : (test.error ?? "The connection test failed.")}
            </p>
          )}

          <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            Reading from {workspaceLabel(integration).toLowerCase()}.
          </p>
        </>
      )}
    </div>
  );
}
