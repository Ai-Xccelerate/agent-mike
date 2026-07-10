import KnowledgeManager from "@/components/mike/KnowledgeManager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knowledge | Agent Mike",
  description: "Manage Agent Mike's OKF knowledge bundle.",
};

export default function KnowledgePage() {
  return <KnowledgeManager />;
}

