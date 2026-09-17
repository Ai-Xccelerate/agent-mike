import WorkerPlayground from "@/components/worker/WorkerPlayground";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Playground | AI Worker",
  description: "Test this worker's conversation experience against its current configuration.",
};

export default function PlaygroundPage() {
  return <WorkerPlayground />;
}
