import React from "react";

interface SwatchProps {
  bgClass: string;
  label: string;
  hex: string;
}

export function Swatch({ bgClass, label, hex }: SwatchProps) {
  return (
    <div className="flex w-16 flex-col items-center gap-1.5">
      <div
        className={`size-12 w-full rounded-lg border border-gray-200 dark:border-gray-800 ${bgClass}`}
      />
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <span className="font-mono text-[11px] leading-none text-gray-500 dark:text-gray-400">
        {hex}
      </span>
    </div>
  );
}

const BRAND_SCALE: { step: string; bgClass: string; hex: string }[] = [
  { step: "25", bgClass: "bg-brand-25", hex: "#FFF8F2" },
  { step: "50", bgClass: "bg-brand-50", hex: "#FEF3E8" },
  { step: "100", bgClass: "bg-brand-100", hex: "#FDE6CF" },
  { step: "200", bgClass: "bg-brand-200", hex: "#FBCFA0" },
  { step: "300", bgClass: "bg-brand-300", hex: "#FAB673" },
  { step: "400", bgClass: "bg-brand-400", hex: "#F79A47" },
  { step: "500", bgClass: "bg-brand-500", hex: "#F47920" },
  { step: "600", bgClass: "bg-brand-600", hex: "#E06B15" },
  { step: "700", bgClass: "bg-brand-700", hex: "#BC580F" },
  { step: "800", bgClass: "bg-brand-800", hex: "#954510" },
  { step: "900", bgClass: "bg-brand-900", hex: "#78380F" },
  { step: "950", bgClass: "bg-brand-950", hex: "#411C06" },
];

export function BrandScale() {
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {BRAND_SCALE.map((s) => (
          <Swatch
            key={s.step}
            bgClass={s.bgClass}
            label={`brand-${s.step}`}
            hex={s.hex}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        Primary accent is <span className="font-mono text-xs">brand-500</span>{" "}
        (#F47920), hover is{" "}
        <span className="font-mono text-xs">brand-600</span>, light tint is{" "}
        <span className="font-mono text-xs">brand-50</span>. One orange moment
        per view — everything else stays greyscale plus semantic.
      </p>
    </div>
  );
}

const SEMANTIC_ROWS: {
  name: string;
  usage: string;
  solidClass: string;
  solidHex: string;
  tintClass: string;
  tintHex: string;
}[] = [
  {
    name: "Success",
    usage: "Positive deltas, active status, confirmations",
    solidClass: "bg-success-500",
    solidHex: "#12B76A",
    tintClass: "bg-success-50",
    tintHex: "#ECFDF3",
  },
  {
    name: "Error",
    usage: "Failures, destructive actions, negative deltas",
    solidClass: "bg-error-500",
    solidHex: "#F04438",
    tintClass: "bg-error-50",
    tintHex: "#FEF3F2",
  },
  {
    name: "Warning",
    usage: "Attention needed, training state, degraded",
    solidClass: "bg-warning-500",
    solidHex: "#F79009",
    tintClass: "bg-warning-50",
    tintHex: "#FFFAEB",
  },
  {
    name: "Info",
    usage: "Neutral notices, informational badges",
    solidClass: "bg-blue-light-500",
    solidHex: "#0BA5EC",
    tintClass: "bg-blue-light-50",
    tintHex: "#F0F9FF",
  },
];

export function SemanticColors() {
  return (
    <div className="space-y-4">
      {SEMANTIC_ROWS.map((row) => (
        <div
          key={row.name}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <div className="flex items-center gap-3">
            <div
              className={`size-10 rounded-lg border border-gray-200 dark:border-gray-800 ${row.solidClass}`}
            />
            <div
              className={`size-10 rounded-lg border border-gray-200 dark:border-gray-800 ${row.tintClass}`}
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {row.name}
              <span className="ml-2 font-mono text-xs font-normal text-gray-500 dark:text-gray-400">
                {row.solidHex} · {row.tintHex}
              </span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {row.usage}
            </p>
          </div>
        </div>
      ))}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Status badges use the light variant — tinted background with the 600
        text tone (for example{" "}
        <span className="font-mono text-xs">bg-success-50 text-success-600</span>
        ), never the solid fill.
      </p>
    </div>
  );
}
