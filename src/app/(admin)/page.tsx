import WorkerDashboard from "@/components/worker/WorkerDashboard";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overview | AI Worker",
  description: "Operations overview for this AI worker.",
};

export default function OverviewPage() {
  return <WorkerDashboard />;
}
