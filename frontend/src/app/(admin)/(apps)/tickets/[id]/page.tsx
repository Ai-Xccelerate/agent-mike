import WorkerTicketDetail from "@/components/worker/WorkerTicketDetail";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ticket | AI Worker",
  description: "One customer ticket and what the worker did.",
};

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Keyed by id so stepping to another ticket starts from a clean, loading state.
  return <WorkerTicketDetail key={id} id={id} />;
}
