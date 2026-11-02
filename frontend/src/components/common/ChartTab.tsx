"use client";

/**
 * A chart's period switch (LIB-CHARTTAB): Monthly · Quarterly · Annually by
 * default, or any segments you give it. It is a `SegmentedControl` at the
 * small size -- the chosen period a raised white pill, never orange -- so a
 * period switch on a chart reads the same as every other one-of-a-few choice
 * in the product.
 *
 * Controlled (`value` + `onChange`) when the chart redraws for the period;
 * uncontrolled (`defaultValue`) for a demo.
 */

import { useState } from "react";

import SegmentedControl, { type Segment } from "@/components/ui/SegmentedControl";

export type ChartRange = "monthly" | "quarterly" | "annually";

export const CHART_RANGES: Array<Segment<ChartRange>> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

interface ChartTabProps<T extends string> {
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** The periods on offer. Monthly, quarterly and annually by default. */
  segments?: Array<Segment<T>>;
  ariaLabel?: string;
  className?: string;
}

export default function ChartTab<T extends string = ChartRange>({
  value,
  defaultValue,
  onChange,
  segments = CHART_RANGES as unknown as Array<Segment<T>>,
  ariaLabel = "Chart period",
  className = "",
}: ChartTabProps<T>) {
  const [own, setOwn] = useState<T>(defaultValue ?? segments[0].value);
  const chosen = value ?? own;
  return (
    <SegmentedControl<T>
      ariaLabel={ariaLabel}
      size="sm"
      value={chosen}
      segments={segments}
      className={className}
      onChange={(next) => {
        setOwn(next);
        onChange?.(next);
      }}
    />
  );
}
