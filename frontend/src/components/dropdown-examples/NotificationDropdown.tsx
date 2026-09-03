"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { BellIcon } from "@/icons";

interface Notification {
  agent: string;
  message: string;
  time: string;
  color: string;
}

const notifications: Notification[] = [
  {
    agent: "Nick",
    message: "generated 42 new marketing-qualified leads today.",
    time: "5 min ago",
    color: "bg-brand-500",
  },
  {
    agent: "Jules",
    message: "booked 3 outbound meetings with target accounts.",
    time: "1 hr ago",
    color: "bg-success-500",
  },
  {
    agent: "Joy",
    message: "moved 2 deals to the closing stage.",
    time: "3 hrs ago",
    color: "bg-blue-light-500",
  },
];

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="dropdown-toggle relative flex size-11 items-center justify-center rounded-lg bg-white text-gray-500 shadow-theme-xs ring-1 ring-inset ring-gray-300 transition hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:text-gray-300"
      >
        <span className="absolute right-2.5 top-2.5 z-10 size-2 rounded-full bg-brand-500" />
        <BellIcon />
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="w-80 p-3"
      >
        <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
          <h5 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Notifications
          </h5>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-500 dark:bg-brand-500/15">
            3 new
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {notifications.map((n, i) => (
            <li key={i}>
              <button
                onClick={() => setIsOpen(false)}
                className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition hover:bg-gray-100 dark:hover:bg-white/[0.03]"
              >
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${n.color}`}
                >
                  {n.agent[0]}
                </span>
                <span className="flex-1">
                  <span className="block text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {n.agent}
                    </span>{" "}
                    {n.message}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    {n.time}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Link
          href="#"
          onClick={() => setIsOpen(false)}
          className="mt-2 block rounded-lg border border-gray-200 py-2 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03]"
        >
          View all notifications
        </Link>
      </Dropdown>
    </div>
  );
}
