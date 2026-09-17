import type { ReactNode } from "react";

/** Inbox fills the admin content pane; list/thread panes scroll internally. */
export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex h-full min-h-0 flex-1 flex-col overflow-hidden md:-mx-6">
      {children}
    </div>
  );
}
