import type { ReactNode } from "react";

/** Settings fills the admin content pane; page title stays pinned while forms scroll. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">{children}</div>;
}
