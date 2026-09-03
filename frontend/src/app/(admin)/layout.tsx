"use client";

import OrgGate from "@/components/OrgGate";
import { useSidebar } from "@/context/SidebarContext";
import { MikeAccessGate } from "@/lib/coreApi";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import React from "react";

function AdminShell({ children }: { children: React.ReactNode }) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "lg:ml-[240px]"
      : "lg:ml-[80px]";

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out ${mainContentMargin}`}
      >
        <AppHeader />
        <div data-aix-id="AIX-F4" className="flex w-full min-h-0 flex-1 flex-col p-4 md:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MikeAccessGate>
      <OrgGate>
        <AdminShell>{children}</AdminShell>
      </OrgGate>
    </MikeAccessGate>
  );
}
