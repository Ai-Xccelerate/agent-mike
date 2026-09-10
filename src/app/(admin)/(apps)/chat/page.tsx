import WorkerChat from "@/components/worker/WorkerChat";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat | AI Worker",
  description: "Test this worker's conversation experience.",
};

export default function ChatPage() {
  return <WorkerChat />;
}
