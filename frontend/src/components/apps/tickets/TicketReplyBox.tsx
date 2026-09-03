"use client";

import React, { useState } from "react";
import Tabs, { TabItem } from "@/components/ui/tabs/Tabs";
import Button from "@/components/ui/button/Button";
import { FileIcon, PaperPlaneIcon } from "@/icons";

function Composer({
  placeholder,
  isInternal,
}: {
  placeholder: string;
  isInternal?: boolean;
}) {
  const [value, setValue] = useState("");

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={5}
        className={`w-full resize-y rounded-xl border p-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:text-gray-300 ${
          isInternal
            ? "border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10"
            : "border-gray-300 bg-transparent dark:border-gray-700"
        }`}
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors duration-150 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <FileIcon className="size-4" />
          Attach a file
        </button>
        <Button size="sm" endIcon={<PaperPlaneIcon className="size-4" />}>
          {isInternal ? "Add internal note" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}

const items: TabItem[] = [
  {
    label: "Reply",
    content: (
      <Composer placeholder="Write a reply to Dana... Tony will draft one for you if you leave this empty." />
    ),
  },
  {
    label: "Internal note",
    content: (
      <Composer
        placeholder="Add a note visible to your team only..."
        isInternal
      />
    ),
  },
];

export default function TicketReplyBox() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <Tabs items={items} />
    </div>
  );
}
