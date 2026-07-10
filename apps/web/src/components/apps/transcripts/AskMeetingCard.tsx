"use client";

import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import { PaperPlaneIcon, ShootingStarIcon } from "@/icons";

const cannedAnswer =
  "Acme committed to evaluating George before their budget lock on Jul 15. Sarah is sending the overview, pricing, and the Nick/Pepper attribution report today, Tony is updating the HubSpot custom-field sync this week, and the renewal review is being booked for the week of Aug 17.";

export default function AskMeetingCard() {
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);

  const ask = () => {
    if (!question.trim()) return;
    setAskedQuestion(question.trim());
    setQuestion("");
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800 md:px-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Ask about this meeting
        </h3>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Answers come from this transcript only.
        </p>
      </div>
      <div className="space-y-4 p-5 md:p-6">
        {askedQuestion && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gray-100 px-4 py-3 text-sm text-gray-800 dark:bg-white/5 dark:text-white/90">
                {askedQuestion}
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <ShootingStarIcon className="size-4" />
              </span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
                <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {cannedAnswer}
                </p>
                <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                  Based on 4 moments in this transcript
                </p>
              </div>
            </div>
          </div>
        )}
        <div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="e.g. What did Acme commit to before their budget lock?"
            className="w-full resize-none rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:text-gray-300 dark:placeholder:text-gray-500"
          />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={ask}
              disabled={!question.trim()}
              endIcon={<PaperPlaneIcon className="size-4" />}
            >
              Ask AI
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
