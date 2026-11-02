"use client";
import React, { useState } from "react";
import { ChevronDownIcon } from "@/components/common/icons";

export interface AccordionItem {
  title: string;
  content: React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  defaultOpenIndex?: number;
  className?: string;
}

export default function Accordion({
  items,
  allowMultiple = false,
  defaultOpenIndex,
  className = "",
}: AccordionProps) {
  const [openIndexes, setOpenIndexes] = useState<number[]>(
    defaultOpenIndex !== undefined ? [defaultOpenIndex] : []
  );

  const toggle = (index: number) => {
    setOpenIndexes((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      return allowMultiple ? [...prev, index] : [index];
    });
  };

  return (
    <div
      className={`divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white dark:divide-white/[0.05] dark:border-white/[0.06] dark:bg-white/[0.03] ${className}`}
    >
      {items.map((item, index) => {
        const isOpen = openIndexes.includes(index);
        return (
          <div key={index}>
            <button
              type="button"
              onClick={() => toggle(index)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-150 ease-out focus-ring first:rounded-t-2xl md:px-6"
            >
              <span
                className={`text-sm font-medium transition-colors duration-150 ease-out ${
                  isOpen
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                {item.title}
              </span>
              <ChevronDownIcon
                className={`size-4.5 shrink-0 text-gray-500 transition-transform duration-150 ease-out ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400 md:px-6">
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
