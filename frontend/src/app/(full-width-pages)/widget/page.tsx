import WidgetShell from "@/components/mike/WidgetShell";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Chat with Mike",
  description: "Website support chat powered by Agent Mike.",
};

export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WidgetShell />
    </Suspense>
  );
}
