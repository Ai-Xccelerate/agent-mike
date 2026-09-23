"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useLayoutEffect } from "react";
import { getTokenWithRetry } from "@/lib/clerk-token";

let tokenProvider: (forceRefresh?: boolean) => Promise<string | null> = async () => null;

/**
 * `forceRefresh` bypasses Clerk's own token cache (`skipCache`) — Clerk can
 * hand back a cached token that's already expired by the time the backend
 * checks it, which still counts as "got a token" to getTokenWithRetry's own
 * retry loop. apiFetch uses this to get a guaranteed-fresh token after a
 * 401, rather than trusting whatever was cached.
 */
export async function getManagerToken(forceRefresh = false): Promise<string | null> {
  return tokenProvider(forceRefresh);
}

export function ManagerAuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { organization } = useOrganization();

  // Register before child effects issue their initial manager API requests.
  useLayoutEffect(() => {
    tokenProvider = async (forceRefresh = false) => {
      if (!isLoaded || !isSignedIn) return null;
      return getTokenWithRetry(getToken, organization?.id, undefined, forceRefresh);
    };
    return () => {
      tokenProvider = async () => null;
    };
  }, [getToken, isLoaded, isSignedIn, organization?.id]);

  return <>{children}</>;
}
