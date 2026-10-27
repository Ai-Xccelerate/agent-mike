"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import SettingsToggle from "@/components/worker/settings/SettingsToggle";
import { cardClass } from "@/components/worker/settings/ui";
import { TrashBinIcon } from "@/icons";
import {
  deleteEvalCase,
  getEvalCases,
  getChanges,
  getEvalRuns,
  revertChange,
  startEvalRun,
  updateEvalCase,
  type ChangeEntry,
  type EvalCaseEntry,
  type EvalCaseList,
  type EvalRunEntry,
} from "@/lib/worker-api";

const SOURCE_LABELS: Record<string, string> = { bad_rating: "Rated bad", no_article: "No article", team_answer: "Team answered", manual: "Added by hand" };

function expectation(entry: EvalCaseEntry): string {
  if (entry.expectHandover === true) return "Should hand over to a person";
  if (entry.reference) return `Should answer like: ${entry.reference.length > 140 ? `${entry.reference.slice(0, 140)}…` : entry.reference}`;
  return entry.expectHandover === false ? "Should answer (no wording checked)" : "Not scored";
}

const percent = (score: number | null) => (score === null ? "–" : `${Math.round(score * 100)}%`);

/**
 * Saved test questions, and a replay that scores them. A case is made from the Needs review list on the Overview. A replay
 * asks every case through the real worker, in a mode that emails, routes and tickets nothing, and shows what passed.
 */
export default function TestCasesSettings() {
  const [cases, setCases] = useState<EvalCaseList | null>(null);
  const [runs, setRuns] = useState<EvalRunEntry[]>([]);
  const [canRun, setCanRun] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const [caseList, runList, changeList] = await Promise.all([getEvalCases(), getEvalRuns(), getChanges()]);
      setChanges(changeList.changes);
      setCases(caseList);
      setRuns(runList.runs);
      setCanRun(runList.canChange);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the test cases.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const running = runs.some((run) => run.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [running, load]);

  async function act(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const canChange = cases?.canChange ?? false;
  const finished = runs.filter((run) => run.status === "done");
  const latest = finished[0];
  const before = finished[1];

  return (
    <>
      <SettingsPageHeader
        title="Test cases"
        description="Saved questions with what a good answer says, made from the Needs review list on the Overview. A replay asks each one through the real worker and scores it, so you can see whether a change made things better or worse. A replay emails nobody and raises no tickets."
      />

      {error && <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>}

      <section className={`${cardClass} mt-4 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Score</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {latest
                ? `${latest.passed} of ${latest.total} passed on the last replay (${percent(latest.score)})${before ? `, ${(latest.score ?? 0) >= (before.score ?? 0) ? "up from" : "down from"} ${percent(before.score)} before` : ""}.`
                : running
                  ? "A replay is running."
                  : "No replay yet."}
            </p>
          </div>
          {canRun && (
            <Button size="sm" loading={busy || running} disabled={!cases || cases.cases.filter((c) => c.enabled).length === 0} onClick={() => void act(() => startEvalRun(), "Could not start the replay.")}>
              {running ? "Replaying…" : "Replay all"}
            </Button>
          )}
        </div>
        {runs.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
            {runs.slice(0, 5).map((run) => (
              <li key={run.id} className="py-2.5">
                <button type="button" onClick={() => setOpenRun(openRun === run.id ? null : run.id)} className="flex w-full items-center justify-between gap-3 text-left text-sm">
                  <span className="text-gray-700 dark:text-gray-300">
                    {new Date(run.startedAt).toLocaleString()} · {run.status === "running" ? `running, ${run.results.length} of ${run.total} done` : run.status === "failed" ? `failed${run.error ? `: ${run.error}` : ""}` : `${run.passed} of ${run.total} passed`}
                    {run.context.model ? <span className="text-gray-400"> · {run.context.model}</span> : null}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">{run.status === "done" ? percent(run.score) : ""}</span>
                </button>
                {openRun === run.id && (
                  <ul className="mt-2 space-y-2">
                    {run.results.map((result) => (
                      <li key={result.caseId} className="rounded-lg border border-gray-100 p-3 text-xs dark:border-gray-800">
                        <p className={`font-medium ${result.pass ? "text-success-700 dark:text-success-400" : "text-error-700 dark:text-error-400"}`}>
                          {result.pass ? "Passed" : "Failed"}
                          {result.score !== null ? ` (${percent(result.score)} match)` : ""}: {result.reason}
                        </p>
                        <p className="mt-1 text-gray-700 dark:text-gray-300">Asked: {result.question}</p>
                        <p className="mt-1 text-gray-500 dark:text-gray-400">{result.handedOver ? "Handed over to a person." : `Replied: ${result.reply.length > 220 ? `${result.reply.slice(0, 220)}…` : result.reply}`}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${cardClass} mt-4 p-5`}>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Changes the Assistant made</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Each change you confirmed in the Assistant, with the score before it and the score of the replay that ran after. Undo puts the old text back.
        </p>
        {changes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Nothing yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
            {changes.map((change) => (
              <li key={change.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-800 dark:text-white/90">{change.summary}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(change.createdAt).toLocaleString()} ·{" "}
                    {change.scoreAfter !== null
                      ? `score ${percent(change.scoreBefore)} → ${percent(change.scoreAfter)}`
                      : change.runStatus === "running"
                        ? "measuring…"
                        : "no score for this change"}
                    {change.revertedAt ? " · undone" : ""}
                  </p>
                </div>
                {canRun && !change.revertedAt && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => revertChange(change.id), "Could not undo that change.")}>
                    Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${cardClass} mt-4 p-5`}>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Saved questions</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{cases ? `${cases.cases.length} of ${cases.limits.perOrganization}. Add one with "Make test case" on a review item in the Overview.` : ""}</p>
        {!cases && !error && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
        {cases && cases.cases.length === 0 && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No test cases yet. Open the Overview, find a question she got wrong or the team answered, and choose "Make test case".</p>}
        {cases && cases.cases.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2.5">
            {cases.cases.map((entry) => (
              <li key={entry.id} className="flex items-start gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 dark:text-white/90">{entry.question}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{expectation(entry)}</p>
                  <p className="mt-1 text-[11px] text-gray-400">{SOURCE_LABELS[entry.sourceKind] ?? entry.sourceKind}</p>
                </div>
                {canChange && (
                  <div className="flex shrink-0 items-center gap-2">
                    <SettingsToggle checked={entry.enabled} label="this test case" disabled={busy} onChange={() => void act(() => updateEvalCase(entry.id, { enabled: !entry.enabled }), "Could not change it.")} />
                    <Button size="sm" variant="outline" startIcon={<TrashBinIcon className="size-4" />} disabled={busy} onClick={() => void act(() => deleteEvalCase(entry.id), "Could not delete it.")}>
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
