"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import { BoltIcon } from "@/icons";

interface PromptComposerProps {
  placeholder: string;
  buttonLabel: string;
  maxLength?: number;
}

const MODELS = [
  { value: "claude-sonnet", label: "Claude Sonnet" },
  { value: "claude-opus", label: "Claude Opus" },
  { value: "claude-haiku", label: "Claude Haiku" },
];

export default function PromptComposer({
  placeholder,
  buttonLabel,
  maxLength = 2000,
}: PromptComposerProps) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet");

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <textarea
        rows={4}
        value={prompt}
        maxLength={maxLength}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 pl-3 dark:border-gray-800 dark:bg-gray-900">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Model
            </span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="Model"
              className="appearance-none rounded-lg bg-transparent py-1.5 pl-2 pr-3 text-xs font-medium text-gray-700 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:text-gray-300"
            >
              {MODELS.map((m) => (
                <option
                  key={m.value}
                  value={m.value}
                  className="dark:bg-gray-900"
                >
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {prompt.length.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        </div>
        <Button size="sm" startIcon={<BoltIcon className="size-4" />}>
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
