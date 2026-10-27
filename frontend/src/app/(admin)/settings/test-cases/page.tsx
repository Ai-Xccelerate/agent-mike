import TestCasesSettings from "@/components/worker/settings/TestCasesSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Test cases | AI Worker" };

export default function TestCasesSettingsPage() {
  return <TestCasesSettings />;
}
