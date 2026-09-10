import WorkerKnowledge from "@/components/worker/WorkerKnowledge";
import { cardClass } from "@/components/worker/settings/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Knowledge | AI Worker" };

export default function KnowledgeSettingsPage() {
  return (
    <>
      <WorkerKnowledge />

      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">External knowledge base (vector + graph)</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Only for a worker that must search a large, frequently-changing knowledge base belonging to the product or
          business it supports — connected as an external tool, separate from the worker's own knowledge above. Not
          yet built: no external RAG connector exists in this template today.
        </p>
        <span className="mt-4 inline-flex w-fit items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
          Not configured
        </span>
      </section>
    </>
  );
}
