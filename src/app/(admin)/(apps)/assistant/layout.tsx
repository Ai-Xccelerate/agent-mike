import type { ReactNode } from "react";

/** Assistant fills the admin content pane; only the message list scrolls. */
export default function AssistantLayout({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">{children}</div>;
}
