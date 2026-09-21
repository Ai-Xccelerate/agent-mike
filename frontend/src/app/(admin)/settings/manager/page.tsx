import ManagerSettings from "@/components/worker/settings/ManagerSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Human manager | AI Worker" };

export default function ManagerSettingsPage() {
  return <ManagerSettings />;
}
