"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import manifest from "../../../aix-manifest.json";

interface ManifestBlock {
  id: string;
  description: string;
}

interface ManifestPage {
  id: string;
  title: string;
  route: string;
  area: string;
  file: string;
  blocks: ManifestBlock[];
  keywords: string[];
}

interface ManifestPrimitive {
  id: string;
  name: string;
  path: string;
  props: string;
  description: string;
}

const AREA_LABELS: Record<string, string> = {
  "global-chrome": "Global chrome & docs",
  dashboards: "Dashboards",
  ecommerce: "E-commerce",
  apps: "Applications",
  "ai-tools": "AI tools",
  "ui-elements": "UI elements",
  "forms-tables": "Forms & tables",
  "charts-maps": "Charts & maps",
  "misc-pages": "Pages",
  auth: "Authentication",
  errors: "Errors & system",
  layouts: "Layout variants",
};

export default function ReferenceIndex() {
  const [query, setQuery] = useState("");
  const pages = manifest.pages as ManifestPage[];
  const primitives = manifest.primitives as ManifestPrimitive[];

  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.route.toLowerCase().includes(q) ||
        p.keywords.some((k) => k.toLowerCase().includes(q)) ||
        p.blocks.some((b) => b.description.toLowerCase().includes(q))
    );
  }, [pages, query]);

  const filteredPrimitives = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return primitives;
    return primitives.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [primitives, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ManifestPage[]>();
    for (const p of filteredPages) {
      const list = map.get(p.area) ?? [];
      list.push(p);
      map.set(p.area, list);
    }
    return map;
  }, [filteredPages]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by ID, title, route, or keyword — e.g. AIX-311, kanban, pagination…"
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:text-white/90"
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {filteredPages.length} pages · {filteredPrimitives.length} primitives.
          Toggle the AIX-ID button (bottom left) to see these IDs on any page.
        </p>
      </div>

      {Array.from(grouped.entries()).map(([area, areaPages]) => (
        <div
          key={area}
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {AREA_LABELS[area] ?? area}
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {areaPages.map((p) => (
              <div key={p.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg bg-brand-50 px-2 py-0.5 font-mono text-xs font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                    {p.id}
                  </span>
                  <Link
                    href={p.route}
                    className="text-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90 dark:hover:text-brand-400"
                  >
                    {p.title}
                  </Link>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                    {p.route}
                  </span>
                </div>
                {p.blocks.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.blocks.map((b) => (
                      <span
                        key={b.id}
                        title={b.description}
                        className="cursor-help rounded-lg border border-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:border-gray-700 dark:text-gray-400"
                      >
                        {b.id.replace(p.id, "…")} · {b.description}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Reusable primitives (LIB)
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Generic, prop-driven components — the reusable payload of this theme.
          </p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {filteredPrimitives.map((p) => (
            <div key={p.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {p.id}
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {p.name}
                </span>
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                  {p.path}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                {p.description}
              </p>
              <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                props: {p.props}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
