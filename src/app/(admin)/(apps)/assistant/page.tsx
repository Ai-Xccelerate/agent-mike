import WorkerAssistant from "@/components/worker/WorkerAssistant";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Assistant | AI Xccelerate",
  description: "Ask your worker's admin assistant about your business, or ask it to summarize a ticket.",
};

export default function AssistantPage() {
  return <WorkerAssistant />;
}
