import React from "react";

const RULES: { rule: string; doText: string; dontText: string }[] = [
  {
    rule: "Buttons say exactly what happens",
    doText: "Save changes",
    dontText: "Submit!",
  },
  {
    rule: "Empty states are invitations",
    doText: "No agents yet — pick one to get started.",
    dontText: "No data",
  },
  {
    rule: "Numbers read naturally",
    doText: "1,284 · 2 min ago",
    dontText: "1284 · 0.033 hrs ago",
  },
  {
    rule: "Sentence case for labels and headings",
    doText: "Deploy your first agent",
    dontText: "DEPLOY YOUR FIRST AGENT",
  },
];

export default function DoDontTable() {
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="grid grid-cols-2 border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-success-600 dark:text-success-500">
            Do
          </p>
          <p className="border-l border-gray-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-error-600 dark:text-error-500 dark:border-gray-800">
            Don&apos;t
          </p>
        </div>
        {RULES.map((r, i) => (
          <div
            key={r.rule}
            className={`grid grid-cols-2 ${
              i > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""
            }`}
          >
            <div className="px-4 py-3">
              <p className="text-sm text-gray-800 dark:text-white/90">
                {r.doText}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{r.rule}</p>
            </div>
            <div className="border-l border-gray-100 px-4 py-3 dark:border-gray-800">
              <p className="text-sm text-gray-500 line-through decoration-error-400 dark:text-gray-400">
                {r.dontText}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        Second person (&quot;you&quot;, &quot;your agents&quot;); &quot;we&quot;
        only when AIX is the subject. No emoji in product UI — ever. Errors say
        what happened and how to fix it.
      </p>
    </div>
  );
}
