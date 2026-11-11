"use client";

import { ChatPanel } from "@/components/worker/WorkerChat";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

/**
 * The customer chat on its own, filling the frame, for a page that already has a chat window to put it in (a title
 * bar, a close button, a launcher). The floating widget at /widget brings its own launcher; this does not.
 * Org tenancy comes from ?site=<org site token>, as for the floating widget.
 */
export default function WorkerWidgetPanel() {
  const searchParams = useSearchParams();
  const siteToken = useMemo(() => (searchParams.get("site") || "").trim(), [searchParams]);

  useEffect(() => {
    document.documentElement.dataset.workerWidget = "1";
    document.body.dataset.workerWidget = "1";
    return () => {
      delete document.documentElement.dataset.workerWidget;
      delete document.body.dataset.workerWidget;
    };
  }, []);

  // Escape inside the frame never reaches the page around it, so say so: the page decides what closing means.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.parent?.postMessage({ type: "worker-widget:close" }, "*");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!siteToken) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-white p-6 dark:bg-gray-900">
        <div className="max-w-sm text-center">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Missing site token</p>
          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
            This chat is not bound to an organization. Open Chat in the console and copy the embed snippet for your org.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main data-worker-widget="1" className="fixed inset-0 bg-white dark:bg-gray-900">
      <ChatPanel compact embedded siteToken={siteToken} />
    </main>
  );
}
