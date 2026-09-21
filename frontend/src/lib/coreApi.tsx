"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import NoAccessScreen from "@/components/NoAccessScreen";
import { getTokenWithRetry } from "@/lib/clerk-token";

const CORE_API = (process.env.NEXT_PUBLIC_CORE_API_URL ?? "").replace(/\/$/, "");

type MikeAccessState =
  | { status: "loading" }
  | { status: "allowed"; organizationId: string | null }
  | { status: "denied"; organizationId: string | null; reason?: string }
  | { status: "error"; organizationId: string | null };

function useMikeAccess(): MikeAccessState {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { isLoaded: organizationLoaded, organization } = useOrganization();
  const [state, setState] = useState<MikeAccessState>({ status: "loading" });

  const checkAccess = useCallback(async () => {
    const organizationId = organization?.id ?? null;
    if (!CORE_API) {
      setState({ status: "error", organizationId });
      return;
    }

    const token = await getTokenWithRetry(getToken, organization?.id);
    if (!token) {
      setState({ status: "error", organizationId });
      return;
    }

    try {
      const response = await fetch(`${CORE_API}/api/v1/agents/mike/access`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });

      if (response.status === 404) {
        setState({
          status: "denied",
          organizationId,
          reason:
            "Agent Mike is not registered in AIX Core. Ask the platform team to add mike to the agent catalog.",
        });
        return;
      }
      if (!response.ok) {
        setState({ status: "error", organizationId });
        return;
      }

      const result = (await response.json().catch(() => null)) as {
        has_access?: boolean;
        reason?: string;
      } | null;
      setState(
        result?.has_access
          ? { status: "allowed", organizationId }
          : { status: "denied", organizationId, reason: result?.reason },
      );
    } catch {
      setState({ status: "error", organizationId });
    }
  }, [getToken, organization?.id]);

  useEffect(() => {
    if (!isLoaded || !organizationLoaded || !isSignedIn) return;
    const timer = window.setTimeout(() => void checkAccess(), 0);
    return () => window.clearTimeout(timer);
  }, [checkAccess, isLoaded, isSignedIn, organizationLoaded, organization?.id]);

  if (
    state.status !== "loading" &&
    state.organizationId !== (organization?.id ?? null)
  ) {
    return { status: "loading" };
  }
  return state;
}

export function MikeAccessGate({ children }: { children: React.ReactNode }) {
  const access = useMikeAccess();

  if (access.status === "loading") return null;
  if (access.status === "allowed") return <>{children}</>;
  if (access.status === "denied") return <NoAccessScreen reason={access.reason} />;
  return (
    <NoAccessScreen reason="Could not verify access with AIX Core. Refresh and try again, or ask the platform team to check Core and Clerk configuration." />
  );
}
