import SupportInbox from "@/components/mike/SupportInbox";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inbox | Agent Mike",
  description: "Review email and chat conversations handled by Mike.",
};

export default function InboxPage() {
  return <SupportInbox />;
}

