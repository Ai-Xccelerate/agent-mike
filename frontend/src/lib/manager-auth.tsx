"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useLayoutEffect } from "react";
import { getTokenWithRetry } from "@/lib/clerk-token";

let tokenProvider: () => Promise<string | null> = async () => null;

export async function getManagerToken(): Promise<string | null> {
  return tokenProvider();
}

export function ManagerAuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { organization } = useOrganization();

  // Register before child effects issue their initial manager API requests.
  useLayoutEffect(() => {
    tokenProvider = async () => {
      if (!isLoaded || !isSignedIn) return null;
      return getTokenWithRetry(getToken, organization?.id);
    };
    return () => {
      tokenProvider = async () => null;
    };
  }, [getToken, isLoaded, isSignedIn, organization?.id]);

  return <>{children}</>;
}
