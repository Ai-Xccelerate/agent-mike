import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-turn stage timings, logged as one `[timing]` line when the turn ends so
 * a slow reply can be traced to the stage that made it slow. A turn is
 * wrapped in withTurnTimer; anything inside it (including code the Agents SDK
 * calls back into, such as guardrails) records a stage with timed(). Outside a
 * turn, timed() just runs the function.
 */

type Turn = { stages: { stage: string; ms: number }[]; notes: Record<string, number> };

const store = new AsyncLocalStorage<Turn>();

/** Adds a number to the turn's log line (token counts), summed if noted twice. No-op outside a turn. */
export function noteTurn(key: string, value: number): void {
  const turn = store.getStore();
  if (turn) turn.notes[key] = (turn.notes[key] ?? 0) + value;
}

export async function timed<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  const turn = store.getStore();
  if (!turn) return fn();
  const start = Date.now();
  try {
    return await fn();
  } finally {
    turn.stages.push({ stage, ms: Date.now() - start });
  }
}

export async function withTurnTimer<T>(label: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  const turn: Turn = { stages: [], notes: {} };
  const start = Date.now();
  try {
    return await store.run(turn, fn);
  } finally {
    // Stages can overlap (guardrails run beside the main call), so they don't sum to total.
    console.info("[timing]", JSON.stringify({ ...label, totalMs: Date.now() - start, stages: turn.stages, ...turn.notes }));
  }
}
