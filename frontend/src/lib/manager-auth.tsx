"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useLayoutEffect } from "react";
import { getTokenWithRetry } from "@/lib/clerk-token";

let tokenProvider: (forceRefresh?: boolean) => Promise<string | null> = async () => null;

// Resolved the first time ManagerAuthBridge sees Clerk finish loading.
// Sibling/child components that fetch on mount (WorkerIdentityContext etc.)
// can run before Clerk's own SDK has initialized — without this gate,
// getManagerToken would return null immediately during that window (Clerk
// simply hasn't said yes/no yet), apiFetch would send no Authorization
// header at all, and the backend's very first check ("is there a bearer
// token") rejects it in a few milliseconds — fast enough that the 401 shows
// up well before Clerk was ever going to be ready, no matter how many times
// it's retried. Traced from production logs: bursts of 401s at 2-11ms (too
// fast to be a real JWT check) followed eventually by one success.
let resolveReady: (() => void) | null = null;
let readyOnce: Promise<void> | null = null;
function readyGate(): Promise<void> {
  if (!readyOnce) {
    readyOnce = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
  }
  return readyOnce;
}

/**
 * `forceRefresh` bypasses Clerk's own token cache (`skipCache`) — Clerk can
 * hand back a cached token that's already expired by the time the backend
 * checks it, which still counts as "got a token" to getTokenWithRetry's own
 * retry loop. apiFetch uses this to get a guaranteed-fresh token after a
 * 401, rather than trusting whatever was cached.
 */
export async function getManagerToken(forceRefresh = false): Promise<string | null> {
  // Bounded wait, not an indefinite hang, in case Clerk genuinely never
  // loads (network issue, misconfigured instance) — callers still get a
  // null and their own error handling rather than hanging forever.
  await Promise.race([readyGate(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  return tokenProvider(forceRefresh);
}

export function ManagerAuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { organization } = useOrganization();

  // Register before child effects issue their initial manager API requests.
  useLayoutEffect(() => {
    if (!isLoaded) return; // don't mark ready, don't register — still initializing
    tokenProvider = async (forceRefresh = false) => {
      if (!isSignedIn) return null;
      return getTokenWithRetry(getToken, organization?.id, undefined, forceRefresh);
    };
    // Only ever unblocks getManagerToken; never re-arms the gate, so a
    // dependency change (e.g. switching active org) just swaps which
    // closure tokenProvider points to, not a fresh loading window.
    resolveReady?.();
    resolveReady = null;
    return () => {
      tokenProvider = async () => null;
    };
  }, [getToken, isLoaded, isSignedIn, organization?.id]);

  return <>{children}</>;
}
