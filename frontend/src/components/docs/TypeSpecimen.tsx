import React from "react";

const SPECIMENS: {
  label: string;
  classes: string;
  sample: string;
}[] = [
  {
    label: "Display",
    classes: "text-3xl md:text-4xl font-bold text-gray-800 dark:text-white/90",
    sample: "Scale revenue without scaling headcount",
  },
  {
    label: "Card title",
    classes: "text-base font-semibold text-gray-800 dark:text-white/90",
    sample: "Pipeline generated this month",
  },
  {
    label: "Body",
    classes: "text-sm text-gray-700 dark:text-gray-300",
    sample:
      "Your agents booked 14 meetings this week. Pepper handled 92% of inbound without escalation.",
  },
  {
    label: "Caption / meta",
    classes: "text-xs text-gray-500 dark:text-gray-400",
    sample: "Last synced 2 min ago",
  },
  {
    label: "KPI value",
    classes:
      "text-2xl md:text-3xl font-bold tracking-tight text-gray-800 dark:text-white/90",
    sample: "1,284",
  },
];

export default function TypeSpecimen() {
  return (
    <div>
      <div className="space-y-5">
        {SPECIMENS.map((s) => (
          <div key={s.label}>
            <p className={s.classes}>{s.sample}</p>
            <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
              {s.label} · {s.classes}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">
        Two families: Inter for UI and body, Geist for display headings and hero
        numerals. Headings, CTAs and active nav at 600–700; body at 400.
        Sentence case everywhere. Code and IDs use{" "}
        <span className="font-mono text-xs">JetBrains Mono</span>; charts use{" "}
        <span className="font-mono text-xs">
          fontFamily: &quot;Inter, sans-serif&quot;
        </span>
        .
      </p>
    </div>
  );
}
