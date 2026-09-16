/**
 * Grab — in-app bug and feedback reporting.
 *
 * One script tag gives every console page a reporter. The launcher reads its
 * appearance from the Grab project at load time, so changing how it looks is
 * done there, not here.
 *
 * ── Who gets attributed ──────────────────────────────────────────────────────
 *
 * `identify` tells Grab who is *reporting*, so they are not asked for their
 * details. That is the human at the keyboard — not the worker.
 *
 * Worth being explicit, because the mistake is easy and silent: this app has a
 * `worker_profiles.email`, and it would be the obvious thing to pass. It is the
 * wrong address. That is the agent's own mailbox — the identity it sends
 * customer email from — and attributing every bug report to it would file the
 * whole team's reports under one fictional person.
 *
 * So nothing is identified until there is a real signed-in human to identify.
 * Until then reporters are asked for their details, which is Grab's documented
 * fallback and the honest answer while this build has no sign-in.
 */

export interface GrabUser {
  email?: string;
  name?: string;
  userId?: string;
}

interface GrabQueue {
  q: unknown[][];
  identify: (...args: unknown[]) => void;
  reset?: () => void;
}

declare global {
  interface Window {
    Grab?: GrabQueue;
  }
}

/** Where the launcher is served from. Staging and production differ. */
export function grabScriptUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_GRAB_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.NEXT_PUBLIC_GRAB_KEY || "").trim();
  // Both halves or nothing: a launcher without a key cannot report anywhere,
  // and a key without a host has nowhere to send.
  if (!base || !key) return null;
  return `${base}/widget.js?key=${encodeURIComponent(key)}`;
}

export function isGrabConfigured(): boolean {
  return grabScriptUrl() !== null;
}

/**
 * The queue shim from Grab's own snippet.
 *
 * Calls made before the async script finishes loading are pushed onto `q` and
 * replayed once it does. Without it, identifying a user on first paint is a
 * race the page usually loses.
 */
function ensureQueue(): GrabQueue | null {
  if (typeof window === "undefined") return null;
  if (!window.Grab) {
    window.Grab = {
      q: [],
      identify(...args: unknown[]) {
        this.q.push(["identify", ...args]);
      },
    };
  }
  return window.Grab;
}

/** Attribute reports to a signed-in human. No-op with nothing to identify. */
export function identifyGrabUser(user: GrabUser): void {
  const hasSomething = Boolean(user.email || user.userId);
  if (!hasSomething) return;
  ensureQueue()?.identify(user);
}

/**
 * Clear the attribution on sign-out.
 *
 * Grab's own guidance, and it matters: without it the next person to use the
 * same browser files their reports under the previous person's name.
 */
export function resetGrab(): void {
  if (typeof window === "undefined") return;
  const grab = window.Grab;
  if (grab && typeof grab.reset === "function") {
    grab.reset();
    return;
  }
  // Loaded late, or not at all — queue it so the real reset runs on load.
  ensureQueue()?.q.push(["reset"]);
}
