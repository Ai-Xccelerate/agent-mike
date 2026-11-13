import CannedRepliesSettings from "@/components/worker/settings/CannedRepliesSettings";
import FeatureGate from "@/components/worker/settings/FeatureGate";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Canned replies | AI Worker" };

export default function CannedRepliesSettingsPage() {
  return (
    <FeatureGate feature="cannedReplies" title="Canned replies">
      <CannedRepliesSettings />
    </FeatureGate>
  );
}
