"use client";
import React, { useState } from "react";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import {
  ChevronDownIcon,
  UserCircleIcon,
  PencilIcon,
  DollarLineIcon,
  TrashBinIcon,
} from "@/icons";

const itemClass =
  "flex items-center gap-3 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-300";

export default function IconDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="dropdown-toggle inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-theme-xs ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
      >
        Manage agent
        <ChevronDownIcon />
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="w-56 p-2"
      >
        <DropdownItem onItemClick={() => setIsOpen(false)} className={itemClass}>
          <UserCircleIcon className="size-4" />
          Profile
        </DropdownItem>
        <DropdownItem onItemClick={() => setIsOpen(false)} className={itemClass}>
          <PencilIcon className="size-4" />
          Edit configuration
        </DropdownItem>
        <div className="my-1 h-px bg-gray-200 dark:bg-gray-800" />
        <DropdownItem onItemClick={() => setIsOpen(false)} className={itemClass}>
          <DollarLineIcon className="size-4" />
          Billing &amp; usage
        </DropdownItem>
        <div className="my-1 h-px bg-gray-200 dark:bg-gray-800" />
        <DropdownItem
          onItemClick={() => setIsOpen(false)}
          className="flex items-center gap-3 rounded-lg text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10"
        >
          <TrashBinIcon className="size-4" />
          Deactivate
        </DropdownItem>
      </Dropdown>
    </div>
  );
}
