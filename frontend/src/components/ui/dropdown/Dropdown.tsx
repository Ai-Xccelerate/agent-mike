"use client";
import type React from "react";
import { useEffect, useRef } from "react";

import { Floating } from "@/components/ui/floating/Floating";
import type { Align, Side } from "@/components/ui/floating/place";

interface DropdownProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /**
   * The control it opens from. Given, the menu floats in <body> against it
   * (`Floating`), over every card, bar and drawer; without one it is placed by
   * `className` inside its parent, as the template drew it.
   */
  anchor?: React.RefObject<HTMLElement | null>;
  side?: Side;
  align?: Align;
  /** As wide as the anchor. */
  matchWidth?: boolean;
  /**
   * `menu` by default. A panel holding anything other than menu items -- a
   * radio group, a form -- is a `dialog`: a `menu` may only hold menu items, and
   * a screen reader announces it as one.
   */
  role?: "menu" | "dialog";
  /** Its name, for a screen reader: what this menu is. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  isOpen,
  onClose,
  children,
  className = "",
  anchor,
  side = "bottom",
  align = "end",
  matchWidth = false,
  role = "menu",
  "aria-label": ariaLabel,
  "aria-labelledby": labelledBy,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest(".dropdown-toggle")
      ) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  if (anchor) {
    return (
      <Floating open={isOpen} anchor={anchor} side={side} align={align} matchWidth={matchWidth} offset={8}>
        <div
          ref={dropdownRef}
          role={role}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          className={`custom-scrollbar overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 glass-popover dark:border-white/[0.08] ${className}`}
        >
          {children}
        </div>
      </Floating>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      className={`absolute z-40 right-0 mt-2 rounded-2xl border border-gray-200 glass-popover dark:border-white/[0.08] ${className}`}
    >
      {children}
    </div>
  );
};
