"use client";
import React, { useState } from "react";
import { PaperPlaneIcon } from "@/icons";
import {
  CloseIcon,
  MinusIcon,
  PaperclipIcon,
  TrashIcon,
} from "./InboxIcons";

const headerBtn =
  "flex size-7 items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-brand-500/50";

interface ComposeCardProps {
  onClose: () => void;
}

export default function ComposeCard({ onClose }: ComposeCardProps) {
  const [minimized, setMinimized] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="fixed inset-x-0 bottom-0 z-[99] sm:inset-x-auto sm:right-6 sm:w-[480px]">
      <div className="overflow-hidden rounded-t-2xl border border-b-0 border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between bg-gray-800 px-4 py-2.5 dark:bg-white/[0.06]">
          <p className="text-sm font-semibold text-white dark:text-white/90">
            New message
          </p>
          <div className="flex items-center gap-1">
            <button
              aria-label={minimized ? "Expand compose" : "Minimize compose"}
              onClick={() => setMinimized((m) => !m)}
              className={headerBtn}
            >
              <MinusIcon className="size-4" />
            </button>
            <button
              aria-label="Close compose"
              onClick={onClose}
              className={headerBtn}
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            <div className="border-b border-gray-100 px-4 dark:border-gray-800">
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="To"
                aria-label="Recipients"
                className="h-10 w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-white/90 dark:placeholder:text-white/30"
              />
            </div>
            <div className="border-b border-gray-100 px-4 dark:border-gray-800">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                aria-label="Subject"
                className="h-10 w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-white/90 dark:placeholder:text-white/30"
              />
            </div>
            <textarea
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              aria-label="Message body"
              className="w-full resize-none bg-transparent px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-white/90 dark:placeholder:text-white/30"
            />
            <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
              <button
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-theme-xs transition-colors duration-150 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500/50"
              >
                Send
                <PaperPlaneIcon className="size-4" />
              </button>
              <div className="flex items-center gap-1">
                <button
                  aria-label="Attach a file"
                  className="flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
                >
                  <PaperclipIcon className="size-4" />
                </button>
                <button
                  aria-label="Discard draft"
                  onClick={onClose}
                  className="flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
