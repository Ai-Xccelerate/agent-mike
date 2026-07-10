"use client";

import React, { useEffect, useState } from "react";

// Floating toggle for the AIX reference overlay. When on, every element
// carrying a data-aix-id shows its ID as an orange badge (see globals.css
// `.aix-ref-mode` rules and AIX-REFERENCE.md for the ID scheme).
export default function ReferenceOverlayToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("aix-ref-mode") === "on";
    if (saved) {
      setOn(true);
      document.documentElement.classList.add("aix-ref-mode");
    }
  }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    document.documentElement.classList.toggle("aix-ref-mode", next);
    localStorage.setItem("aix-ref-mode", next ? "on" : "off");
  };

  return (
    <button
      onClick={toggle}
      title={
        on
          ? "Hide AIX reference IDs"
          : "Show AIX reference IDs (pages, blocks, frame regions)"
      }
      aria-pressed={on}
      className={`fixed bottom-6 left-6 z-99999 flex h-10 items-center gap-2 rounded-lg border px-3 font-mono text-xs font-bold shadow-theme-md transition-colors duration-150 ${
        on
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
      }`}
    >
      AIX-ID
      <span
        className={`size-2 rounded-full ${on ? "bg-white" : "bg-gray-300 dark:bg-gray-600"}`}
      />
    </button>
  );
}
