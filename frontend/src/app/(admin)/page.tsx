import MikeDashboard from "@/components/mike/MikeDashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview | Agent Mike",
  description: "Agent Mike support operations overview.",
};

export default function OverviewPage() {
  return <MikeDashboard />;
}

