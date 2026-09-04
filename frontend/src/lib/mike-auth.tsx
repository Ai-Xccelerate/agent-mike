"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useLayoutEffect } from "react";
import { getTokenWithRetry } from "@/lib/clerk-token";
import { useLocalBypass } from "@/lib/local-mode-context";

let tokenProvider: () => Promise<string | null> = async () => null;

export function setManagerTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

export async function getManagerToken() {
  return tokenProvider();
}

function MikeAuthBridgeClerk({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const { organization } = useOrganization();

  // useLayoutEffect so the provider is ready before child useEffects fire (Overview fetch).
  useLayoutEffect(() => {
    setManagerTokenProvider(async () => {
      if (!isLoaded || !isSignedIn) return null;
      return getTokenWithRetry(getToken, organization?.id);
    });
    return () => setManagerTokenProvider(async () => null);
  }, [getToken, isSignedIn, isLoaded, organization?.id]);

  return <>{children}</>;
}

export function MikeAuthBridge({ children }: { children: React.ReactNode }) {
  const bypass = useLocalBypass();
  if (bypass) return <>{children}</>;
  return <MikeAuthBridgeClerk>{children}</MikeAuthBridgeClerk>;
}
