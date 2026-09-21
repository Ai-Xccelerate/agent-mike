import WorkerInbox from "@/components/worker/WorkerInbox";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inbox | AI Worker",
  description: "Review conversations handled by this worker.",
};

export default function InboxPage() {
  return <WorkerInbox />;
}
