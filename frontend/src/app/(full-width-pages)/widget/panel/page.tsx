import WorkerWidgetPanel from "@/components/worker/WorkerWidgetPanel";
import type { Metadata } from "next";
import { Suspense } from "react";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat",
  description: "Website support chat, for a page's own chat window.",
};

export default function WidgetPanelPage() {
  return (
    <Suspense fallback={null}>
      <WorkerWidgetPanel />
    </Suspense>
  );
}
