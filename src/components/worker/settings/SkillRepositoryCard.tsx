"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { BoltIcon } from "@/icons";
import { apiFetch, WorkerApiError } from "@/lib/worker-api";
import type {
  AgentSkillsConnectionTest,
  AgentSkillsIntegration,
  AgentSkillsPatch,
  RepositorySkillResult,
} from "@/lib/worker-api";

/**
 * The organization's published skill repository.
 *
 * Unlike the catalog and custom skills above, this is not a list of toggles.
 * The worker finds a skill by describing the task it is about to do, and the
 * repository ranks by how well each skill's description matches — so nobody
 * has to predict in advance which skills will be needed. Enabling one by one
 * would defeat that, which is why the controls here are a scope rather than a
 * list.
 *
 * That also creates the one thing a manager cannot otherwise see: which skills
 * the worker will actually reach for. Hence the search preview — it runs the
 * same query the worker would, so the repository can be judged before it is
 * switched on.
 */
type Phase = "loading" | "ready" | "failed";

const RESULT_CHOICES = [3, 5, 10];

function statusBadge(integration: AgentSkillsIntegration) {
  if (!integration.available) return { color: "light" as const, label: "Not configured" };
  if (!integration.enabled) return { color: "light" as const, label: "Off" };
  if (integration.error) return { color: "warning" as const, label: "Unreachable" };
  return { color: "success" as const, label: "Connected" };
}

export default function SkillRepositoryCard() {
  const [integration, setIntegration] = useState<AgentSkillsIntegration | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const [test, setTest] = useState<AgentSkillsConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RepositorySkillResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const load = useCallback(
    () =>
      apiFetch<AgentSkillsIntegration>("/integrations/agent-skills")
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

  async function patch(body: AgentSkillsPatch) {
    if (!integration) return;
    setSaving(true);
    setNotice("");
    // A stale pass/fail under a changed scope is worse than none.
    setTest(null);
    setResults(null);
    try {
      await apiFetch<AgentSkillsIntegration>("/integrations/agent-skills", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      // PATCH answers with the stored status only. Re-read so the live category
      // list — and any repository outage behind it — is current.
      setIntegration(await apiFetch<AgentSkillsIntegration>("/integrations/agent-skills"));
    } catch (error) {
      setNotice(
        error instanceof WorkerApiError
          ? (error.errors?.enabled ?? error.message)
          : "Could not save — check that the API is running.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setNotice("");
    try {
      setTest(
        await apiFetch<AgentSkillsConnectionTest>("/integrations/agent-skills/test", {
          method: "POST",
        }),
      );
    } catch {
      setNotice("Could not run the test — check that the API is running.");
    } finally {
      setTesting(false);
    }
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError("");
    setResults(null);
    try {
      const data = await apiFetch<{ results: RepositorySkillResult[] }>(
        `/integrations/agent-skills/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(data.results);
    } catch (error) {
      setSearchError(
        error instanceof WorkerApiError ? error.message : "Could not reach the repository.",
      );
    } finally {
      setSearching(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <div className="h-4 w-36 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="mt-3 h-3 w-full max-w-md animate-pulse rounded-md bg-gray-100 dark:bg-gray-800/70" />
      </div>
    );
  }

  if (phase === "failed" || !integration) {
    return (
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Skill repository</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Could not load this integration — check that the API is running.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const badge = statusBadge(integration);

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <BoltIcon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              {integration.name}
            </p>
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
          aria-label={`${integration.enabled ? "Disable" : "Enable"} the skill repository`}
          disabled={!integration.available || saving}
          onClick={() => void patch({ enabled: !integration.enabled })}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-40 ${
            integration.enabled ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${
              integration.enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {!integration.available && (
        <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
          Not connected yet — an administrator sets this up on the API service.
        </p>
      )}

      {integration.enabled && (
        <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
          Every search and load is recorded against this organization&apos;s key, including the ones
          that find nothing.
        </p>
      )}

      {integration.error && (
        <p className="mt-3 text-xs font-medium leading-5 text-warning-600 dark:text-warning-400">
          The repository did not answer: {integration.error}
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
            <label className="min-w-0 flex-1 basis-52">
              <span className="block text-xs text-gray-500 dark:text-gray-400">Scope</span>
              <select
                value={integration.settings.category ?? ""}
                disabled={saving}
                onChange={(event) =>
                  void patch({ category: event.target.value === "" ? null : event.target.value })
                }
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">Every category</option>
                {integration.categories.map((category) => (
                  <option key={category.name} value={category.name}>
                    {category.name}
                    {category.count !== null ? ` (${category.count})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 basis-40">
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Candidates per search
              </span>
              <select
                value={integration.settings.max_results}
                disabled={saving}
                onChange={(event) => void patch({ maxResults: Number(event.target.value) })}
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              >
                {RESULT_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
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
                ? `Connected — ${test.toolCount} tools, ${test.categories.length} categories.`
                : (test.error ?? "The connection test failed.")}
            </p>
          )}

          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Try a task description to see what the worker would find.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !searching) void runSearch();
                }}
                placeholder="review a pull request for security issues"
                aria-label="Task description"
                className="h-10 min-w-0 flex-1 basis-64 rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:text-white/90"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!query.trim() || searching}
                onClick={() => void runSearch()}
              >
                {searching ? "Searching…" : "Search"}
              </Button>
            </div>

            {searchError && (
              <p className="mt-2 text-xs font-medium leading-5 text-error-600 dark:text-error-400">
                {searchError}
              </p>
            )}

            {results !== null &&
              (results.length === 0 ? (
                <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Nothing matched. The worker would carry on without a skill — and an empty search
                  is the clearest signal of a skill worth writing.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {results.map((skill) => (
                    <li
                      key={skill.slug}
                      className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-gray-800 dark:text-white/90">
                          {skill.name}
                        </span>
                        {skill.category && (
                          <Badge size="sm" color="light">
                            {skill.category}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {skill.description}
                      </p>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
