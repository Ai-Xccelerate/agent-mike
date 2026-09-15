import SkillsSettings from "@/components/worker/settings/SkillsSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Skills | AI Worker" };

export default function SkillsSettingsPage() {
  return <SkillsSettings />;
}
