import type { ReactNode } from "react";

/**
 * Inbox fills the admin content pane with no card of its own, so it sits on
 * the LiquidBackdrop like Jules' inbox; list/thread panes scroll internally.
 */
export default function InboxLayout({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">{children}</div>;
}
