"use client";

import React, { useState } from "react";
import { ChevronDownIcon, DocsIcon, EnvelopeIcon, TimeIcon } from "@/icons";

const selectClass =
  "h-10 w-full appearance-none rounded-lg border border-gray-300 bg-transparent pl-3 pr-9 text-sm text-gray-700 transition-colors duration-150 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-gray-300 dark:[&>option]:bg-gray-900";

const SelectChevron = () => (
  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
    <ChevronDownIcon />
  </span>
);

const linkedDocs = [
  { title: "Rotating API keys and signing secrets", type: "Developer guide" },
  { title: "Webhook delivery retries and replays", type: "Developer guide" },
  { title: "TKT-1904 — OAuth token expiry (Meridian)", type: "Related ticket" },
];

export default function TicketSidebar() {
  const [status, setStatus] = useState("Open");
  const [priority, setPriority] = useState("Urgent");
  const tags = ["webhooks", "api-keys", "meridian"];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Ticket properties
        </h3>
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="ticket-status"
              className="mb-1.5 block text-sm text-gray-500 dark:text-gray-400"
            >
              Status
            </label>
            <div className="relative">
              <select
                id="ticket-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={selectClass}
              >
                <option>Open</option>
                <option>Pending</option>
                <option>Resolved</option>
              </select>
              <SelectChevron />
            </div>
          </div>
          <div>
            <label
              htmlFor="ticket-priority"
              className="mb-1.5 block text-sm text-gray-500 dark:text-gray-400"
            >
              Priority
            </label>
            <div className="relative">
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={selectClass}
              >
                <option>Urgent</option>
                <option>High</option>
                <option>Normal</option>
              </select>
              <SelectChevron />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-gray-500 dark:text-gray-400">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-theme-xs font-medium text-gray-700 dark:bg-white/5 dark:text-white/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Requester
        </h3>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            DW
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
              Dana Whitmore
            </p>
            <p className="truncate text-theme-xs text-gray-500 dark:text-gray-400">
              Ops Director · Meridian Logistics
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm text-gray-500 dark:text-gray-400">
          <p className="flex items-center gap-2">
            <EnvelopeIcon className="size-4 shrink-0" />
            <span className="truncate">dana.whitmore@meridianlog.com</span>
          </p>
          <p className="flex items-center gap-2">
            <TimeIcon className="size-4 shrink-0" />
            Customer since Aug 2025 · 14 tickets
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Linked docs
        </h3>
        <ul className="mt-4 space-y-3">
          {linkedDocs.map((doc) => (
            <li key={doc.title}>
              <button
                type="button"
                className="group flex w-full items-start gap-2.5 text-left"
              >
                <DocsIcon className="mt-0.5 size-4 shrink-0 text-gray-500 dark:text-gray-400" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-700 transition-colors duration-150 group-hover:text-brand-500 dark:text-gray-300">
                    {doc.title}
                  </span>
                  <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                    {doc.type}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
