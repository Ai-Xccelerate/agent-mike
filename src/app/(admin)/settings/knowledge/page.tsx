import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import { cardClass } from "@/components/worker/settings/ui";
import Link from "next/link";
import Button from "@/components/ui/button/Button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Knowledge settings | AI Worker" };

export default function KnowledgeSettingsPage() {
  return (
    <>
      <SettingsPageHeader
        title="Knowledge"
        description="How this worker's own operating knowledge is stored and searched."
      />
      <section className={cardClass}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Default: markdown + full-text search</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          No vector or graph database for a worker's own operating knowledge. A worker's file count realistically stays
          in the tens to low hundreds — well under a model's context window — so Postgres full-text search is a
          low-operations baseline with no embedding provider to run, and it tends to be more accurate for exact
          product names, error codes, and terminology.
        </p>
        <Link href="/knowledge" className="mt-4 inline-block">
          <Button size="sm" variant="outline">
            Manage documents
          </Button>
        </Link>
      </section>

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
