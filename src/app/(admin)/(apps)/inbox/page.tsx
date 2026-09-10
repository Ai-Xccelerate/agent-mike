import WorkerInbox from "@/components/worker/WorkerInbox";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inbox | AI Worker",
  description: "Review conversations handled by this worker.",
};

export default function InboxPage() {
  return <WorkerInbox />;
}
