import React from "react";

const STEPS: { px: number; widthClass: string; token: string }[] = [
  { px: 4, widthClass: "w-1", token: "1" },
  { px: 8, widthClass: "w-2", token: "2" },
  { px: 16, widthClass: "w-4", token: "4" },
  { px: 24, widthClass: "w-6", token: "6" },
  { px: 32, widthClass: "w-8", token: "8" },
  { px: 48, widthClass: "w-12", token: "12" },
  { px: 64, widthClass: "w-16", token: "16" },
];

export default function SpacingScale() {
  return (
    <div>
      <div className="space-y-2.5">
        {STEPS.map((s) => (
          <div key={s.px} className="flex items-center gap-4">
            <span className="w-12 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
              {s.px}px
            </span>
            <span className={`h-3 rounded-sm bg-brand-500 ${s.widthClass}`} />
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
              gap-{s.token} / p-{s.token}
            </span>
          </div>
        ))}
      </div>
      <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm text-gray-500 dark:text-gray-400">
        <li>
          Fluid full width — no max-width cap; content column guarded with{" "}
          <span className="font-mono text-xs">min-w-0</span>.
        </li>
        <li>KPI and stat rows: 1 column mobile → 2 on sm → 4 on xl.</li>
        <li>Two-pane app layouts stack vertically below lg.</li>
        <li>
          Wide tables, charts and boards scroll inside their own{" "}
          <span className="font-mono text-xs">overflow-x-auto</span> container —
          the page body never scrolls horizontally.
        </li>
        <li>
          Density with air: <span className="font-mono text-xs">gap-4 md:gap-6</span>{" "}
          between blocks, <span className="font-mono text-xs">p-5 md:p-6</span>{" "}
          inside cards.
        </li>
      </ul>
    </div>
  );
}
