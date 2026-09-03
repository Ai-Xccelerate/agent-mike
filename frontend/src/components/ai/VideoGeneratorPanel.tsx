"use client";
import React from "react";
import PromptComposer from "./PromptComposer";
import Badge from "@/components/ui/badge/Badge";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { TimeIcon, VideoIcon } from "@/icons";

const durationOptions = [
  { value: "15", label: "15 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "60", label: "60 seconds" },
];

const aspectOptions = [
  { value: "16:9", label: "16:9 landscape" },
  { value: "9:16", label: "9:16 vertical" },
  { value: "1:1", label: "1:1 square" },
];

type RenderStatus = "Rendering" | "Queued" | "Done";

const queue: {
  name: string;
  duration: string;
  status: RenderStatus;
  time: string;
}[] = [
  {
    name: "Pepper launch teaser v3",
    duration: "0:30",
    status: "Rendering",
    time: "Started 4 min ago",
  },
  {
    name: "Customer story — Northwind Freight",
    duration: "0:60",
    status: "Queued",
    time: "Added 9 min ago",
  },
  {
    name: "LinkedIn clip — headcount math",
    duration: "0:15",
    status: "Done",
    time: "Finished 1 hr ago",
  },
];

const statusColor: Record<RenderStatus, "warning" | "light" | "success"> = {
  Rendering: "warning",
  Queued: "light",
  Done: "success",
};

export default function VideoGeneratorPanel() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div data-aix-id="AIX-153.1">
        <PromptComposer
          placeholder="A 30-second product teaser: an inbound lead arrives, Pepper qualifies it in seconds, and the meeting lands on the calendar. Clean motion graphics, neutral palette."
          buttonLabel="Generate video"
        />
      </div>

      <div
        data-aix-id="AIX-153.2"
        className="grid grid-cols-1 gap-4 sm:max-w-lg sm:grid-cols-2"
      >
        <div>
          <Label>Duration</Label>
          <Select
            options={durationOptions}
            defaultValue="30"
            onChange={() => {}}
          />
        </div>
        <div>
          <Label>Aspect ratio</Label>
          <Select
            options={aspectOptions}
            defaultValue="16:9"
            onChange={() => {}}
          />
        </div>
      </div>

      <div
        data-aix-id="AIX-153.3"
        className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800"
      >
        <div className="relative aspect-video w-full bg-gray-900">
          <span className="absolute left-4 top-4 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80 ring-1 ring-inset ring-white/20">
            0:30
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              aria-label="Play preview"
              className="flex size-16 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/30 transition-colors duration-150 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-brand-500/50"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="ml-1 size-6 text-white"
              >
                <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.04 1.04 0 0 0 0-1.76l-11-6.86A1.04 1.04 0 0 0 8 5.14Z" />
              </svg>
            </button>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
            <div className="mb-2 flex items-center justify-between text-xs text-white/70">
              <span>Rendering 64%</span>
              <span>~2 min remaining</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-[64%] rounded-full bg-brand-500" />
            </div>
          </div>
        </div>
      </div>

      <div
        data-aix-id="AIX-153.4"
        className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800 md:px-6">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Render queue
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            3 renders this session
          </p>
        </div>
        <ul className="divide-y divide-gray-200 dark:divide-gray-800">
          {queue.map((item) => (
            <li
              key={item.name}
              className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90">
                  <VideoIcon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                    {item.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <TimeIcon className="size-3.5" />
                    {item.duration} · {item.time}
                  </p>
                </div>
              </div>
              <Badge variant="light" color={statusColor[item.status]} size="sm">
                {item.status}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
