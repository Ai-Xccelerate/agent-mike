"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { PlugInIcon } from "@/icons";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import { NOT_CONNECTED_NOTE, panelClass } from "@/components/worker/settings/ui";
import type {
  ArtifactsConnectionTest,
  ArtifactsIntegration,
  ArtifactsPatch,
} from "@/lib/worker-api";

/**
 * Agent Artifacts is the only tool here that *writes*.
 *
 * Everything else on this screen reads. This one creates decks and documents
 * that land in the workspace library, count against its quota, and can be
 * published to a live URL. So it carries two switches, not one: turning it on
 * lets the worker draft, and a second, separate opt-in lets it publish or
 * deliver. Switching the tool off clears the publish grant, so turning it back
 * on is never a quiet restoration of the right to publish.
 */
type Phase = "loading" | "ready" | "failed";

function statusBadge(integration: ArtifactsIntegration) {
  if (!integration.available) return { color: "light" as const, label: "Not configured" };
  if (!integration.enabled) return { color: "light" as const, label: "Off" };
  if (integration.error) return { color: "warning" as const, label: "Unreachable" };
  if (integration.settings.allow_publish) return { color: "success" as const, label: "Can publish" };
  return { color: "success" as const, label: "Draft only" };
}

export default function ArtifactsIntegrationCard() {
  const [integration, setIntegration] = useState<ArtifactsIntegration | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [test, setTest] = useState<ArtifactsConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(
    () =>
      apiFetch<ArtifactsIntegration>("/integrations/artifacts")
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

  async function patch(body: ArtifactsPatch) {
    if (!integration) return;
    setSaving(true);
    setNotice("");
    // A stale pass/fail under a changed setting is worse than none.
    setTest(null);
    try {
      await apiFetch<ArtifactsIntegration>("/integrations/artifacts", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      // PATCH answers with the stored status only. Re-read so the live tool
      // surface — and any engine outage behind it — is current.
      setIntegration(await apiFetch<ArtifactsIntegration>("/integrations/artifacts"));
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
      setTest(
        await apiFetch<ArtifactsConnectionTest>("/integrations/artifacts/test", { method: "POST" }),
      );
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
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Agent Artifacts</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Could not load this tool. Check that the API is running.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const badge = statusBadge(integration);
  const usableKits = integration.brand_kits.filter((kit) => kit.usable);

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
          aria-label={`${integration.enabled ? "Disable" : "Enable"} Agent Artifacts`}
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
          Artifacts did not answer: {integration.error}
        </p>
      )}

      {notice && (
        <p className="mt-3 text-xs font-medium leading-5 text-error-600 dark:text-error-400">{notice}</p>
      )}

      {integration.enabled && integration.available && (
        <>
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Allow publishing and delivery
                </p>
                <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Off, the worker can only draft into the library. On, it can publish an artifact to a
                  live URL and send that link over a connected channel.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={integration.settings.allow_publish}
                aria-label={`${integration.settings.allow_publish ? "Disallow" : "Allow"} publishing`}
                disabled={saving}
                onClick={() => void patch({ allowPublish: !integration.settings.allow_publish })}
                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40 ${
                  integration.settings.allow_publish ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform ${
                    integration.settings.allow_publish ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <label className="min-w-0 flex-1 basis-56">
              <span className="block text-xs text-gray-500 dark:text-gray-400">Brand kit</span>
              <select
                value={integration.settings.brand_kit_id ?? ""}
                disabled={saving || usableKits.length === 0}
                onChange={(event) =>
                  void patch({ brandKitId: event.target.value === "" ? null : event.target.value })
                }
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">Workspace default</option>
                {usableKits.map((kit) => (
                  <option key={kit.id} value={kit.id}>
                    {kit.name}
                    {kit.isDefault ? " (default)" : ""}
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
                ? `Connected: ${test.toolCount} tools available${
                    test.brandKits.length > 0 ? `, ${test.brandKits.length} brand kits` : ""
                  }.`
                : (test.error ?? "The connection test failed.")}
            </p>
          )}


        </>
      )}
    </div>
  );
}
