import React from "react";

import { useSidebar } from "@/context/SidebarContext";

/**
 * The scrim behind the mobile sidebar.
 *
 * Faded rather than mounted flat: the drawer itself slides over 300ms (see
 * `AppSidebar`), so a scrim that appeared instantly announced the drawer before
 * the drawer arrived. Opacity only, and it stops under reduced motion.
 */
const Backdrop: React.FC = () => {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();

  if (!isMobileOpen) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
      onClick={toggleMobileSidebar}
      aria-hidden="true"
    />
  );
};

export default Backdrop;
