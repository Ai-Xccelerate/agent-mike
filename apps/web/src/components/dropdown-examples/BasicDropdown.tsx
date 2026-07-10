"use client";
import React, { useState } from "react";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import { ChevronDownIcon } from "@/icons";

export default function BasicDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="dropdown-toggle inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
      >
        Options
        <ChevronDownIcon />
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="w-48 p-2"
      >
        <DropdownItem
          onItemClick={() => setIsOpen(false)}
          className="rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
        >
          View dashboard
        </DropdownItem>
        <DropdownItem
          onItemClick={() => setIsOpen(false)}
          className="rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
        >
          Agent settings
        </DropdownItem>
        <DropdownItem
          onItemClick={() => setIsOpen(false)}
          className="rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
        >
          Billing
        </DropdownItem>
      </Dropdown>
    </div>
  );
}
