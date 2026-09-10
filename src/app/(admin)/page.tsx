import WorkerDashboard from "@/components/worker/WorkerDashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview | AI Worker",
  description: "Operations overview for this AI worker.",
};

export default function OverviewPage() {
  return <WorkerDashboard />;
}
