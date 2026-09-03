"use client";

import { useOrganization } from "@clerk/nextjs";
import { useEffect } from "react";
import { authDebug } from "@/lib/auth-debug";
import { useLocalBypass } from "@/lib/local-mode-context";

const CORE_APP = (process.env.NEXT_PUBLIC_CORE_APP_URL ?? "").replace(/\/$/, "");

function OrgGateClerk({ children }: { children: React.ReactNode }) {
  const { isLoaded, organization } = useOrganization();

  useEffect(() => {
    authDebug("orgGate.state", {
      isLoaded,
      hasOrganization: Boolean(organization?.id),
    });
  }, [isLoaded, organization?.id]);

  if (!isLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Loading…</div>
    );
  }

  if (!organization) {
    const dashboardUrl = CORE_APP ? `${CORE_APP}/dashboard` : CORE_APP;
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-[420px] rounded-xl border border-gray-200 bg-white px-7 py-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 text-lg font-bold text-gray-900 dark:text-white">Organization required</div>
          <p className="mb-5 text-sm leading-normal text-gray-500">
            Agent Mike runs in the context of an AIX organization. Create or join an organization in AIX Core, then return here.
          </p>
          {dashboardUrl && (
            <a
              href={dashboardUrl}
              className="inline-block rounded-lg bg-brand-500 px-[18px] py-2.5 text-sm font-semibold text-white no-underline"
            >
              Open AIX Core
            </a>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function OrgGate({ children }: { children: React.ReactNode }) {
  const bypass = useLocalBypass();
  if (bypass) return <>{children}</>;
  return <OrgGateClerk>{children}</OrgGateClerk>;
}
