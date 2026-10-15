import TicketsSettings from "@/components/worker/settings/TicketsSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tickets | AI Worker" };

export default function TicketsSettingsPage() {
  return <TicketsSettings />;
}
