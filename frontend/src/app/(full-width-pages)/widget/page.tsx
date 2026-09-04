import WidgetShell from "@/components/mike/WidgetShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat with Mike",
  description: "Website support chat powered by Agent Mike.",
};

export default function WidgetPage() {
  return <WidgetShell />;
}
