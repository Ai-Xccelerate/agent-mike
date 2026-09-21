import UsersSettings from "@/components/worker/settings/UsersSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "User management | AI Worker" };

export default function UsersSettingsPage() {
  return <UsersSettings />;
}
