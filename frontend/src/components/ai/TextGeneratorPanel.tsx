"use client";
import React from "react";
import PromptComposer from "./PromptComposer";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { CopyIcon, PaperPlaneIcon, TimeIcon } from "@/icons";

const toneOptions = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "direct", label: "Direct" },
  { value: "playful", label: "Playful" },
];

const lengthOptions = [
  { value: "short", label: "Short (under 100 words)" },
  { value: "medium", label: "Medium (100-250 words)" },
  { value: "long", label: "Long (250+ words)" },
];

const languageOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
];

const history = [
  {
    title: "Follow-up after demo no-show",
    preview:
      "Hi Marcus, I noticed we missed each other on Thursday. No worries at all...",
    time: "12 min ago",
    tone: "Friendly",
  },
  {
    title: "Renewal reminder for Brightline",
    preview:
      "Hi Dana, your annual plan renews on August 1. Before that date, I wanted to...",
    time: "1 hr ago",
    tone: "Professional",
  },
  {
    title: "Cold open for logistics VPs",
    preview:
      "Most VPs of Ops we talk to are still triaging inbound leads by hand...",
    time: "Yesterday",
    tone: "Direct",
  },
  {
    title: "Case study intro paragraph",
    preview:
      "When Northwind Freight added Pepper to their inbound desk, response time fell...",
    time: "2 days ago",
    tone: "Professional",
  },
];

export default function TextGeneratorPanel() {
  return (
    <div className="flex flex-col gap-5 sm:gap-6 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-5 sm:space-y-6">
        <div data-aix-id="AIX-150.1">
          <PromptComposer
            placeholder="Write a follow-up email to a prospect who ghosted after the demo. Reference the ROI numbers we shared and offer a 15-minute recap call."
            buttonLabel="Generate text"
          />
        </div>

        <div
          data-aix-id="AIX-150.2"
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <div>
            <Label>Tone</Label>
            <Select
              options={toneOptions}
              defaultValue="professional"
              onChange={() => {}}
            />
          </div>
          <div>
            <Label>Length</Label>
            <Select
              options={lengthOptions}
              defaultValue="medium"
              onChange={() => {}}
            />
          </div>
          <div>
            <Label>Language</Label>
            <Select
              options={languageOptions}
              defaultValue="en"
              onChange={() => {}}
            />
          </div>
        </div>

        <div
          data-aix-id="AIX-150.3"
          className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800 md:px-6">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Generated output
            </h3>
            <Badge variant="light" color="light" size="sm">
              Claude Sonnet · 186 words
            </Badge>
          </div>
          <div className="space-y-4 p-5 text-sm leading-relaxed text-gray-700 dark:text-gray-300 md:p-6">
            <p className="font-medium text-gray-800 dark:text-white/90">
              Subject: That ROI model we walked through — still on the table
            </p>
            <p>Hi Marcus,</p>
            <p>
              I know things get busy, so no hard feelings on the radio silence
              after our demo. Before this falls off your list entirely, I
              wanted to resurface the number that mattered most in our call:
              routing inbound leads through Pepper would recover roughly 34
              hours of SDR time per week for your team — the equivalent of one
              full-time hire you don&apos;t have to make.
            </p>
            <p>
              If the timing just isn&apos;t right, tell me and I&apos;ll close
              the loop. But if it slipped for other reasons, I can do a
              15-minute recap this week — no slides, just the pilot plan and
              pricing.
            </p>
            <p>
              Either way, thanks for the time you already gave us.
              <br />
              Rahul
            </p>
          </div>
          <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="flex flex-wrap gap-3">
              <Button
                size="sm"
                variant="outline"
                startIcon={<CopyIcon className="size-4" />}
              >
                Copy
              </Button>
              <Button size="sm" variant="outline">
                Regenerate
              </Button>
            </div>
            <Button size="sm" startIcon={<PaperPlaneIcon className="size-4" />}>
              Insert to sequence
            </Button>
          </div>
        </div>
      </div>

      <div data-aix-id="AIX-150.4" className="w-full shrink-0 xl:w-80">
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              History
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Your last generations
            </p>
          </div>
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {history.map((item) => (
              <li key={item.title}>
                <button className="w-full px-5 py-4 text-left transition-colors duration-150 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand-500/50 dark:hover:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {item.title}
                    </p>
                    <Badge variant="light" color="light" size="sm">
                      {item.tone}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                    {item.preview}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <TimeIcon className="size-3.5" />
                    {item.time}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
