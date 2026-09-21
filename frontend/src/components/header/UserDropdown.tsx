"use client";
import React, { useState } from "react";
import { useWorkerIdentity } from "@/context/WorkerIdentityContext";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

/**
 * No Clerk, no login — the default identity adapter (backend: lib/identity.ts)
 * resolves every manager request to one org with no session required. This
 * shows a static "Manager" identity; who that actually is in practice is
 * whatever's configured under Settings → Human manager.
 */
export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const identity = useWorkerIdentity();
  const managerName = identity?.managerName ?? "Manager";
  const managerInitial = managerName.trim().charAt(0).toUpperCase() || "M";

  function toggleDropdown(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center text-gray-700 dark:text-gray-400 dropdown-toggle"
      >
        <span className="mr-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700 dark:bg-gray-700 dark:text-white/90">
          {managerInitial}
        </span>
        <span className="mr-1 hidden max-w-[140px] truncate font-medium text-theme-sm sm:block">
          {managerName}
        </span>
        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 p-3 shadow-theme-lg dark:border-gray-800"
      >
        <div>
          <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
            {managerName}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {identity?.managerEmail ?? "Set the manager's name and email under Settings → Human manager."}
          </span>
        </div>

        <ul className="flex flex-col gap-1 pt-4 dark:border-gray-800">
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/settings/identity"
              className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              Worker settings
            </DropdownItem>
          </li>
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/inbox"
              className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              Inbox
            </DropdownItem>
          </li>
        </ul>
      </Dropdown>
    </div>
  );
}
