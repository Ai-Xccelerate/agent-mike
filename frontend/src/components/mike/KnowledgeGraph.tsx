"use client";

import { apiFetch } from "@/lib/mike-api";
import { useEffect, useRef, useState } from "react";

type GraphNode = {
  id: string;
  label: string;
  group: "concept" | "section";
  type: string;
  concept_id?: string;
  tags?: string[];
  val: number;
};

type GraphData = {
  nodes: GraphNode[];
  links: { source: string; target: string; kind?: string }[];
  stats: { concepts: number; sections: number; links: number };
};

const CONCEPT_COLOR = "#EC7200";
const SECTION_COLOR = "#64748b";

export default function KnowledgeGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [stats, setStats] = useState<GraphData["stats"] | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let disposed = false;
    let cleanupResize: (() => void) | undefined;

    (async () => {
      try {
        const data = await apiFetch<GraphData>("/knowledge/graph");
        if (disposed || !containerRef.current) return;
        setStats(data.stats);

        const ForceGraph = (await import("force-graph")).default;
        if (disposed || !containerRef.current) return;
        const element = containerRef.current;

        const graph = new ForceGraph(element)
          .width(element.clientWidth || 600)
          .height(element.clientHeight || 520)
          .backgroundColor("rgba(0,0,0,0)")
          .graphData(data)
          .nodeRelSize(4)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .nodeVal((node: any) => node.val)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .nodeColor((node: any) => (node.group === "concept" ? CONCEPT_COLOR : SECTION_COLOR))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .nodeLabel((node: any) => `${node.label}${node.group === "concept" ? " · concept" : " · section"}`)
          .linkColor(() => "rgba(100,116,139,0.18)")
          .linkWidth(0.6)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .onNodeClick((node: any) => {
            setSelected(node as GraphNode);
            graph.centerAt(node.x, node.y, 600);
            graph.zoom(4, 600);
          })
          .cooldownTicks(150)
          .onEngineStop(() => graph.zoomToFit(500, 60));

        // Keep the layout compact: cap repulsion range so disconnected concepts
        // don't drift off, shorten links, and let the built-in center force pull
        // everything toward the middle.
        const charge = graph.d3Force("charge");
        if (charge) charge.strength(-38).distanceMax(240);
        const linkForce = graph.d3Force("link");
        if (linkForce) linkForce.distance(26);
        graph.d3VelocityDecay(0.35);

        graphRef.current = graph;

        const observer = new ResizeObserver(() => {
          graph.width(element.clientWidth || 600).height(element.clientHeight || 520);
        });
        observer.observe(element);
        cleanupResize = () => observer.disconnect();
      } catch {
        if (!disposed) setError(true);
      }
    })();

    return () => {
      disposed = true;
      cleanupResize?.();
      graphRef.current?._destructor?.();
      graphRef.current = null;
    };
  }, []);

  function focusSearch() {
    const graph = graphRef.current;
    if (!graph || !query.trim()) return;
    const term = query.trim().toLowerCase();
    const match = (graph.graphData().nodes as GraphNode[]).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node: any) => node.label.toLowerCase().includes(term) && node.x !== undefined
    );
    if (match) {
      setSelected(match);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      graph.centerAt((match as any).x, (match as any).y, 600);
      graph.zoom(4, 600);
    }
  }

  return (
    <div className="grid h-[calc(100dvh-17rem)] min-h-[360px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="relative h-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-25 dark:border-gray-800 dark:bg-gray-950/40">
        <div className="pointer-events-none absolute left-4 top-4 z-10 text-xs font-medium text-gray-500 dark:text-gray-400">
          {error ? "Could not load the graph." : stats ? `${stats.concepts} concepts · ${stats.sections} sections · ${stats.links} links` : "Loading graph…"}
        </div>
        <div className="absolute right-4 top-4 z-10">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && focusSearch()}
            placeholder="Search concepts…"
            className="h-9 w-52 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <div ref={containerRef} className="h-full w-full" />
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: CONCEPT_COLOR }} /> Concept</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: SECTION_COLOR }} /> Section</span>
          <span className="hidden sm:inline">· drag to pan · scroll to zoom · click a node</span>
        </div>
      </div>

      <aside className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        {selected ? (
          <div>
            <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600 dark:bg-white/10 dark:text-gray-300">{selected.group}</span>
            <h3 className="mt-2 text-base font-semibold text-gray-800 dark:text-white/90">{selected.label}</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-xs text-gray-500 dark:text-gray-400">Type</dt><dd className="mt-0.5 text-gray-700 dark:text-gray-300">{selected.type}</dd></div>
              {selected.concept_id && <div><dt className="text-xs text-gray-500 dark:text-gray-400">Concept</dt><dd className="mt-0.5 break-all font-mono text-xs text-gray-700 dark:text-gray-300">{selected.concept_id}</dd></div>}
              {selected.tags && selected.tags.length > 0 && (
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Tags</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">{selected.tags.map((tag) => <span key={tag} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">{tag}</span>)}</dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Click a node to inspect the concept.</p>
        )}
      </aside>
    </div>
  );
}
