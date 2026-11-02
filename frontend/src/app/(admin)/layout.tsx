"use client";

import React from "react";

import CommandPalette from "@/components/common/CommandPalette";
import ShortcutsDialog from "@/components/common/ShortcutsDialog";
import { usePathname } from "next/navigation";

import AccessGate from "@/components/AccessGate";
import GrabWidget from "@/components/common/GrabWidget";
import { useSidebar } from "@/context/SidebarContext";
import { WorkerIdentityProvider } from "@/context/WorkerIdentityContext";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { FrameModeProvider, useFrameBleed } from "@/layout/FrameMode";
import MobileTopBar from "@/layout/MobileTopBar";

/**
 * The app's frame: the sidebar, the content area, and the palette and help
 * sheet over them -- the Artifacts and Persuade frame.
 *
 * The access check sits around `Frame`, so nothing in the frame mounts for a
 * person who cannot use what it leads to.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkerIdentityProvider>
      <AccessGate>
        <FrameModeProvider>
          <Frame>{children}</Frame>
        </FrameModeProvider>
        {/* Console only: the root layout also renders /widget, the chat embed
            on customers' sites, where an internal bug reporter must not appear. */}
        <GrabWidget />
      </AccessGate>
    </WorkerIdentityProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { isExpanded, isMobileOpen } = useSidebar();
  useGlobalShortcuts();

  // The page makes room for the sidebar the person chose, not for one a
  // pointer opened on its way past: opened by hover, the rail floats over the
  // page instead of reflowing every card in it twice per pass.
  const mainContentMargin = isMobileOpen ? "ml-0" : isExpanded ? "lg:ml-[248px]" : "lg:ml-[76px]";
  // A full-bleed page (an editor, a canvas: `useFullBleed`) gets the whole
  // height and width beside the sidebar at every size, and scrolls itself.
  const bleed = useFrameBleed();
  // The Assistant is a pane of its own: it fills the column beside the sidebar
  // and scrolls itself, but keeps the phone's top bar for the drawer.
  const pathname = usePathname();
  const flush = pathname === "/assistant" || pathname.startsWith("/assistant/");
  const fill = bleed || flush;

  return (
    /*
      On `xl` and up the shell is a fixed-height frame: the chrome is pinned and
      only the content area scrolls. `min-h-screen` alone cannot do this -- "at
      least the viewport" grows with its content, so a page asking for `flex-1`
      would get the height of the tallest thing inside it rather than the
      window's. Below `xl` nothing changes: a phone has no room for
      independently scrolling panes.

      There is no header bar: the sidebar holds search and the account, and a
      phone gets a slim top bar whose only job is the drawer.
    */
    <div className={fill ? "flex h-dvh overflow-hidden" : "min-h-screen xl:flex xl:h-screen xl:overflow-hidden"}>
      {/* Keyboard users reach the page without tabbing through the sidebar. */}
      <a
        href="#main"
        className="focus-ring sr-only z-[70] rounded-lg bg-white px-3 py-2 text-theme-sm font-medium text-gray-900 shadow-theme-md focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <AppSidebar />
      <Backdrop />
      <div
        className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out ${
          fill ? "h-dvh min-h-0" : "min-h-screen xl:h-screen xl:min-h-0"
        } ${mainContentMargin}`}
      >
        {bleed ? null : <MobileTopBar />}
        {/* `flex-1` so app-style pages fill the viewport, and the scroll
            container for document-style pages, which keeps their scrollbar
            inside the app's own chrome. Every page uses the whole width with
            the same gutters; grids add columns as the room grows instead.
            The space under a page is the wrapper's own padding, not `main`'s,
            so the last row never touches the bottom of the window. */}
        <main
          id="main"
          tabIndex={-1}
          data-aix-id="AIX-F4"
          className={
            fill
              ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden focus:outline-none"
              : // The gutter is a variable so a page bar (`.page-bar`, the
                // layout system's sticky filters and tabs) can run out through
                // it to the edges. It grows with the screen.
                "custom-scrollbar flex w-full flex-1 flex-col px-(--gutter) [--gutter:1rem] focus:outline-none sm:[--gutter:1.5rem] md:[--gutter:2rem] xl:min-h-0 xl:overflow-y-auto xl:[--gutter:3rem] 3xl:[--gutter:4rem]"
          }
        >
          {/* The space above a page is the wrapper's too, not `main`'s: on `xl`
              `main` is the scroller, and a sticky page bar sticks inside its
              scroller's padding -- it would hang below the top with the rows
              showing through the gap above it. */}
          <div
            data-page
            className={fill ? "flex min-h-0 w-full flex-1 flex-col" : "flex w-full flex-1 flex-col pt-5 pb-12 md:pt-8 md:pb-14 xl:pt-9 xl:pb-16"}
          >
            {children}
          </div>
        </main>
      </div>
      <CommandPalette />
      <ShortcutsDialog />
    </div>
  );
}
