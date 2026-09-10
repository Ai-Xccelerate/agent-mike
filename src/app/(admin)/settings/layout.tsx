"use client";

import SettingsNav from "@/components/worker/settings/SettingsNav";

/**
 * R14: dedicated pages per capability, grouped the way the original
 * settings catalog was planned. Live staging routes stay clickable;
 * screens that are not built yet are marked Coming soon.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-5 md:gap-6 lg:flex-row">
        <aside className="shrink-0 lg:w-60">
          <SettingsNav />
        </aside>

        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-2 md:space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}
