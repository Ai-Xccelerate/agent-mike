"use client";
import React, { useState } from "react";
import PromptComposer from "./PromptComposer";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { DownloadIcon, GridIcon } from "@/icons";

const styleOptions = [
  { value: "photorealistic", label: "Photorealistic" },
  { value: "illustration", label: "Flat illustration" },
  { value: "3d", label: "3D render" },
  { value: "line-art", label: "Line art" },
];

const aspectRatios = ["1:1", "16:9", "9:16"] as const;

const results = [
  {
    id: 1,
    label: "Variant 1",
    gradient: "from-gray-200 via-gray-300 to-gray-400 dark:from-gray-800 dark:via-gray-700 dark:to-gray-600",
  },
  {
    id: 2,
    label: "Variant 2",
    gradient: "from-gray-300 via-gray-200 to-gray-300 dark:from-gray-700 dark:via-gray-800 dark:to-gray-700",
  },
  {
    id: 3,
    label: "Variant 3",
    gradient: "from-gray-100 via-gray-300 to-gray-200 dark:from-gray-800 dark:via-gray-600 dark:to-gray-800",
  },
  {
    id: 4,
    label: "Variant 4",
    gradient: "from-gray-200 via-gray-100 to-gray-300 dark:from-gray-700 dark:via-gray-800 dark:to-gray-600",
  },
];

const recentPrompts = [
  "Hero banner for the Pepper launch page",
  "Isometric office with AI agents at desks",
  "LinkedIn header, dark, minimal grid",
  "Product screenshot frame on gradient",
  "Webinar thumbnail with bold type",
];

export default function ImageGeneratorPanel() {
  const [ratio, setRatio] = useState<(typeof aspectRatios)[number]>("1:1");

  return (
    <div className="space-y-5 sm:space-y-6">
      <div data-aix-id="AIX-151.1">
        <PromptComposer
          placeholder="A clean isometric illustration of an AI sales team working alongside humans in a modern office, soft neutral palette with a single orange accent."
          buttonLabel="Generate images"
        />
      </div>

      <div
        data-aix-id="AIX-151.2"
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        <div>
          <Label>Aspect ratio</Label>
          <div className="inline-flex rounded-lg border border-gray-300 shadow-theme-xs dark:border-gray-700">
            {aspectRatios.map((r, i) => (
              <button
                key={r}
                onClick={() => setRatio(r)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500/50 ${
                  i === 0 ? "rounded-l-lg" : ""
                } ${i === aspectRatios.length - 1 ? "rounded-r-lg" : ""} ${
                  i > 0 ? "border-l border-gray-300 dark:border-gray-700" : ""
                } ${
                  ratio === r
                    ? "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white/90"
                    : "bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.03]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="w-full sm:w-56">
          <Label>Style</Label>
          <Select
            options={styleOptions}
            defaultValue="illustration"
            onChange={() => {}}
          />
        </div>
      </div>

      <div
        data-aix-id="AIX-151.3"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6"
      >
        {results.map((result) => (
          <div
            key={result.id}
            className={`group relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br dark:border-gray-800 ${
              result.gradient
            } ${ratio === "9:16" ? "aspect-[3/4]" : "aspect-video"}`}
          >
            <span className="absolute left-4 top-4 rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-gray-700 backdrop-blur-sm dark:bg-gray-900/70 dark:text-gray-300">
              {result.label}
            </span>
            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-gray-900/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <button className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand-500/50">
                <DownloadIcon className="size-4" />
                Download
              </button>
              <button className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white ring-1 ring-inset ring-white/30 transition-colors duration-150 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-brand-500/50">
                <GridIcon className="size-4" />
                Variations
              </button>
            </div>
          </div>
        ))}
      </div>

      <div data-aix-id="AIX-151.4">
        <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-400">
          Recent prompts
        </p>
        <div className="flex flex-wrap gap-2">
          {recentPrompts.map((prompt) => (
            <button
              key={prompt}
              className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-sm text-gray-600 transition-colors duration-150 hover:border-gray-300 hover:text-gray-800 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:border-gray-700 dark:hover:text-gray-300"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
