import CannedRepliesSettings from "@/components/worker/settings/CannedRepliesSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Approved wording | AI Worker" };

export default function CannedRepliesSettingsPage() {
  return <CannedRepliesSettings />;
}
