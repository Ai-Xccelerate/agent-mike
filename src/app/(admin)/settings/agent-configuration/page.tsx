import AgentConfigurationSettings from "@/components/worker/settings/AgentConfigurationSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Agent configuration | AI Worker" };

export default function AgentConfigurationSettingsPage() {
  return <AgentConfigurationSettings />;
}
