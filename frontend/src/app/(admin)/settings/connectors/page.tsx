import ConnectorsSettings from "@/components/worker/settings/ConnectorsSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connectors | AI Worker" };

export default function ConnectorsSettingsPage() {
  return (
    <div className="space-y-5 md:space-y-6" data-aix-id="AIX-167">
      <ConnectorsSettings />
    </div>
  );
}
