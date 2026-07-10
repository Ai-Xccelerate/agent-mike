import MikeSettings from "@/components/mike/MikeSettings";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings | Agent Mike",
  description: "Configure Agent Mike's identity, role, guardrails, manager, and integrations.",
};

export default function SettingsPage() {
  return <MikeSettings />;
}

