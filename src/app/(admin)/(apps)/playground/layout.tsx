import type { ReactNode } from "react";

/** Playground fills the admin content pane; only the message list scrolls. */
export default function PlaygroundLayout({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex h-full min-h-0 flex-1 flex-col overflow-hidden md:-mx-6">
      {children}
    </div>
  );
}
