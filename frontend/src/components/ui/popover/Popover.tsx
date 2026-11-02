"use client";

import React, { useEffect, useRef, useState } from "react";

import { Floating } from "@/components/ui/floating/Floating";
import { within } from "@/components/ui/floating/layers";

type Placement = "top" | "bottom" | "left" | "right";

interface PopoverProps {
  trigger: React.ReactNode;
  content: React.ReactNode;
  placement?: Placement;
}

// Floats in <body> against its button (`Floating`), centred on it, and turns
// to the other side when the one asked for is short of room.
const Popover: React.FC<PopoverProps> = ({
  trigger,
  content,
  placement = "bottom",
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !within(ref.current, e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
      >
        {trigger}
      </button>
      <Floating open={open} anchor={button} side={placement} align="center" offset={8}>
        <div className="w-64 rounded-2xl border border-gray-200 p-4 glass-popover dark:border-gray-800">
          {content}
        </div>
      </Floating>
    </div>
  );
};

export default Popover;
