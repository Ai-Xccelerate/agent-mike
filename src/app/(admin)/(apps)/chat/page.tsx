import WorkerChat from "@/components/worker/WorkerChat";
import type { Metadata } from "next";

// Never let this page get stuck as stale prerendered/cached HTML across deploys.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat | AI Worker",
  description: "Test this worker's conversation experience.",
};

export default function ChatPage() {
  return <WorkerChat />;
}
