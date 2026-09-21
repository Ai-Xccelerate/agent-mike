"use client";

import SettingsNav from "@/components/worker/settings/SettingsNav";

/**
 * R14: dedicated pages per capability, grouped the way the original
 * settings catalog was planned. Live staging routes stay clickable;
 * screens that are not built yet are marked Coming soon.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-ml-4 -mr-4 flex h-full min-h-0 flex-col overflow-hidden md:-ml-6 md:-mr-6">
      <div className="flex min-h-0 flex-1 flex-col gap-5 md:gap-6 lg:flex-row">
        {/*
          The nav scrolls on its own. As a column it stretches to the full
          height of a parent that clips overflow, so without this any group
          past the fold — Controls, Workspace — is cut off and unreachable
          rather than merely below the visible area.
        */}
        <aside className="shrink-0 border-b border-gray-200 px-3 pb-5 lg:min-h-0 lg:w-[224px] lg:overflow-y-auto lg:overscroll-contain lg:border-b-0 lg:border-r lg:pb-0 dark:border-gray-800">
          <SettingsNav />
        </aside>

        {/*
          Scroll this pane, not the padded admin shell. The negative margin
          above puts the scrollbar on the far right of the content frame;
          the matching pr-* keeps cards off the overlay thumb (which used
          to sit on the card edge and jump on hover).
        */}
        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-4 pb-2 [scrollbar-gutter:stable] md:space-y-6 md:pr-6">
          {children}
        </div>
      </div>
    </div>
  );
}
