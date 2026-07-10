import { ChatPanel } from "@/components/mike/ChatExperience";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat with Mike",
  description: "Website support chat powered by Agent Mike.",
};

export default function WidgetPage() {
  return (
    <main className="min-h-screen bg-transparent p-2 sm:p-4">
      <div className="mx-auto h-[calc(100vh-16px)] max-w-[420px] overflow-hidden rounded-2xl border border-gray-200 shadow-theme-xl dark:border-gray-800 sm:h-[calc(100vh-32px)]">
        <ChatPanel compact />
      </div>
    </main>
  );
}

