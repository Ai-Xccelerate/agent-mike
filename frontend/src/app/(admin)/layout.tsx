"use client";

import { useSidebar } from "@/context/SidebarContext";
import { WorkerIdentityProvider } from "@/context/WorkerIdentityContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import GrabWidget from "@/components/common/GrabWidget";
import { MikeAccessGate } from "@/lib/coreApi";
import { usePathname } from "next/navigation";
import React from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const flushAssistantPane = pathname === "/assistant" || pathname.startsWith("/assistant/");
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "lg:ml-[240px]"
      : "lg:ml-[80px]";

  return (
    <MikeAccessGate>
      <WorkerIdentityProvider>
        <div className="h-dvh overflow-hidden xl:flex">
          <AppSidebar />
          <Backdrop />
          <div
            className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out ${mainContentMargin}`}
          >
            <AppHeader />
            <div
              data-aix-id="AIX-F4"
              className={
                flushAssistantPane
                  ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden p-0"
                  : "flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-4 md:p-6"
              }
            >
              {children}
            </div>
          </div>
        </div>

        {/*
          Console only. The root layout also renders /widget — the chat embed
          customers see on someone else's site — and an internal bug reporter
          must not appear there.
        */}
        <GrabWidget />
      </WorkerIdentityProvider>
    </MikeAccessGate>
  );
}
