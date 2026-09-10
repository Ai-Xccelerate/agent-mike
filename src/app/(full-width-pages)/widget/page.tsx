import WorkerWidget from "@/components/worker/WorkerWidget";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Chat",
  description: "Website support chat.",
};

export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WorkerWidget />
    </Suspense>
  );
}
