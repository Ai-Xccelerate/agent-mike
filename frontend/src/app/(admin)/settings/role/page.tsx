import RoleSettings from "@/components/worker/settings/RoleSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Role | AI Worker" };

export default function RoleSettingsPage() {
  return <RoleSettings />;
}
