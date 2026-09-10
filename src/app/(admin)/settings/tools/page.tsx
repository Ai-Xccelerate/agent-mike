import ToolsSettings from "@/components/worker/settings/ToolsSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tools | AI Worker" };

export default function ToolsSettingsPage() {
  return <ToolsSettings />;
}
