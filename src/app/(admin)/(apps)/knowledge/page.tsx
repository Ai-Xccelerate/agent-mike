import WorkerKnowledge from "@/components/worker/WorkerKnowledge";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knowledge | AI Worker",
  description: "Manage this worker's knowledge bundle.",
};

export default function KnowledgePage() {
  return <WorkerKnowledge />;
}
