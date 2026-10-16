import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-turn stage timings, logged as one `[timing]` line when the turn ends so
 * a slow reply can be traced to the stage that made it slow. A turn is
 * wrapped in withTurnTimer; anything inside it (including code the Agents SDK
 * calls back into, such as guardrails) records a stage with timed(). Outside a
 * turn, timed() just runs the function.
 */

type Stages = { stage: string; ms: number }[];

const store = new AsyncLocalStorage<Stages>();

export async function timed<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  const stages = store.getStore();
  if (!stages) return fn();
  const start = Date.now();
  try {
    return await fn();
  } finally {
    stages.push({ stage, ms: Date.now() - start });
  }
}

export async function withTurnTimer<T>(label: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  const stages: Stages = [];
  const start = Date.now();
  try {
    return await store.run(stages, fn);
  } finally {
    // Stages can overlap (guardrails run beside the main call), so they don't sum to total.
    console.info("[timing]", JSON.stringify({ ...label, totalMs: Date.now() - start, stages }));
  }
}
