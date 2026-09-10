import GuardrailsSettings from "@/components/worker/settings/GuardrailsSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Guardrails | AI Worker" };

export default function GuardrailsSettingsPage() {
  return <GuardrailsSettings />;
}
