import WorkerKnowledge from "@/components/worker/WorkerKnowledge";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Knowledge | AI Worker" };

export default function KnowledgeSettingsPage() {
  return (
    <>
      <WorkerKnowledge />

      <p className="text-xs text-gray-400 dark:text-gray-500">
        External knowledge base (large product/business KB, kept separate from the worker&apos;s own knowledge
        above). Not available yet.
      </p>
    </>
  );
}
