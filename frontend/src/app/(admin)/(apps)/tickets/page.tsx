import WorkerTickets from "@/components/worker/WorkerTickets";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tickets | AI Worker",
  description: "Every customer conversation, sorted into queues.",
};

export default function TicketsPage() {
  return <WorkerTickets />;
}
