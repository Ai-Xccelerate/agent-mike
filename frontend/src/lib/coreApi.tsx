"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import NoAccessScreen from "@/components/NoAccessScreen";
import { getTokenWithRetry } from "@/lib/clerk-token";
import { useLocalBypass } from "@/lib/local-mode-context";

const CORE_API = (process.env.NEXT_PUBLIC_CORE_API_URL ?? "").replace(/\/$/, "");

export type MikeAccessState =
  | { status: "loading" }
  | { status: "allowed" }
  | { status: "denied"; reason?: string }
  | { status: "error" };

function useMikeAccess(): MikeAccessState {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { isLoaded: orgLoaded, organization } = useOrganization();
  const [state, setState] = useState<MikeAccessState>({ status: "loading" });

  const check = useCallback(async () => {
    if (!CORE_API) {
      setState({ status: "error" });
      return;
    }

    const token = await getTokenWithRetry(getToken, organization?.id);
    if (!token) {
      setState({ status: "error" });
      return;
    }

    try {
      const res = await fetch(`${CORE_API}/api/v1/agents/mike/access`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 401) {
        setState({ status: "error" });
        return;
      }

      if (res.status === 404) {
        setState({
          status: "denied",
          reason:
            "Agent Mike is not registered in AIX Core yet. Ask the platform team to add mike to the agent catalog.",
        });
        return;
      }

      if (!res.ok) {
        setState({ status: "error" });
        return;
      }

      const data = (await res.json().catch(() => null)) as {
        has_access?: boolean;
        reason?: string;
      } | null;

      if (data?.has_access) setState({ status: "allowed" });
      else setState({ status: "denied", reason: data?.reason });
    } catch {
      setState({ status: "error" });
    }
  }, [getToken, organization?.id]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !orgLoaded) return;
    setState({ status: "loading" });
    void check();
  }, [isLoaded, isSignedIn, orgLoaded, organization?.id, check]);

  return state;
}

function MikeAccessGateClerk({ children }: { children: React.ReactNode }) {
  const access = useMikeAccess();

  if (access.status === "denied") {
    return <NoAccessScreen reason={access.reason} />;
  }

  if (access.status === "error") {
    return (
      <NoAccessScreen reason="Could not verify your session with AIX Core. If you just signed in, wait a moment and refresh. Otherwise ask the platform team to confirm Core and mike-api Clerk settings (CLERK_AUTHORIZED_PARTIES must include both the Core app origin and the Mike frontend origin)." />
    );
  }

  return <>{children}</>;
}

export function MikeAccessGate({ children }: { children: React.ReactNode }) {
  const bypass = useLocalBypass();
  if (bypass) return <>{children}</>;
  return <MikeAccessGateClerk>{children}</MikeAccessGateClerk>;
}
