import ChatExperience from "@/components/mike/ChatExperience";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat | Agent Mike",
  description: "Test Agent Mike's website support conversation.",
};

export default function ChatPage() {
  return <ChatExperience />;
}

