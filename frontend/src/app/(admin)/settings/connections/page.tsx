import { Suspense } from "react";
import ConnectionsSettings from "@/components/worker/settings/ConnectionsSettings";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connections | AI Worker" };

export default function ConnectionsSettingsPage() {
  return (
    <Suspense fallback={null}>
      <ConnectionsSettings />
    </Suspense>
  );
}
