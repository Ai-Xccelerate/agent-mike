"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { authDebug } from "@/lib/auth-debug";

/** Client-side auth bootstrap diagnostics for staging troubleshooting. */
export default function AuthDiagnostics() {
  const { isLoaded: authLoaded, isSignedIn, userId } = useAuth();
  const { isLoaded: orgLoaded, organization } = useOrganization();
  const loggedReady = useRef(false);

  useEffect(() => {
    authDebug("client.bootstrap", {
      authLoaded,
      isSignedIn,
      orgLoaded,
      hasUserId: Boolean(userId),
      hasOrganization: Boolean(organization?.id),
      clerkGlobalPresent: typeof window !== "undefined" && "Clerk" in window,
    });
  }, [authLoaded, isSignedIn, orgLoaded, userId, organization?.id]);

  useEffect(() => {
    if (loggedReady.current) return;
    if (!authLoaded || !orgLoaded) return;
    loggedReady.current = true;
    authDebug("client.ready", {
      isSignedIn,
      hasUserId: Boolean(userId),
      hasOrganization: Boolean(organization?.id),
    });
  }, [authLoaded, orgLoaded, isSignedIn, userId, organization?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (authLoaded && orgLoaded) return;
      authDebug("client.stuck", {
        authLoaded,
        orgLoaded,
        isSignedIn,
        clerkGlobalPresent: "Clerk" in window,
        hint:
          "Clerk hooks never finished loading. Check NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY was present at build time, then redeploy mike-frontend.",
      });
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [authLoaded, orgLoaded, isSignedIn]);

  return null;
}
