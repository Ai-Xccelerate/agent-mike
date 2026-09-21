import ChannelsSettings from "@/components/worker/settings/ChannelsSettings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Channels | AI Worker" };

export default function ChannelsSettingsPage() {
  return <ChannelsSettings />;
}
