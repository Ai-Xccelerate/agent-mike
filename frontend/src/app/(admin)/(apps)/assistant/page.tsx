import WorkerAssistant from "@/components/worker/WorkerAssistant";
import type { Metadata } from "next";
import { Suspense } from "react";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Assistant | AI Xccelerate",
  description: "Ask your worker's admin assistant about your business, or ask it to summarize a ticket.",
};

export default function AssistantPage() {
  // WorkerAssistant reads the open chat from the URL (useSearchParams).
  return (
    <Suspense fallback={null}>
      <WorkerAssistant />
    </Suspense>
  );
}
