import WorkerWidget from "@/components/worker/WorkerWidget";
import type { Metadata } from "next";
import { Suspense } from "react";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat",
  description: "Website support chat.",
};

export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WorkerWidget />
    </Suspense>
  );
}
