/**
 * A determinate bar (LIB-PROGRESS): how far, as a fill on a quiet track.
 *
 * The fill is a mark, so brand orange is right for it; the semantic colours
 * say something about the value (green done, amber close to a limit, red over
 * it). `working` adds the sweep (`progress-sweep`): a light that runs across
 * the fill to say something is still happening during a long step, without
 * claiming any progress it has not made. It stops under reduced motion.
 */

import React from "react";

type ProgressSize = "sm" | "md" | "lg";
type ProgressColor = "brand" | "success" | "warning" | "error" | "info" | "neutral";

interface ProgressBarProps {
  value: number;
  size?: ProgressSize;
  color?: ProgressColor;
  showLabel?: boolean;
  className?: string;
  /** Accessible name for the progress bar (announced to assistive tech). */
  label?: string;
  /** Still running: a sweep across the fill. */
  working?: boolean;
}

const sizeClasses: Record<ProgressSize, string> = {
  sm: "h-1.5",
  md: "h-2",
  lg: "h-3",
};

const colorClasses: Record<ProgressColor, string> = {
  brand: "bg-brand-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  error: "bg-error-500",
  info: "bg-blue-light-500",
  neutral: "bg-gray-700 dark:bg-gray-300",
};

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  size = "md",
  color = "brand",
  showLabel = false,
  className = "",
  label,
  working = false,
}) => {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        aria-busy={working || undefined}
        className={`relative w-full overflow-hidden rounded-full bg-gray-900/[0.07] dark:bg-white/[0.08] ${sizeClasses[size]}`}
      >
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-[width] duration-500 ease-out ${colorClasses[color]} ${
            working ? "progress-sweep" : ""
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 shrink-0 text-right text-theme-sm font-medium tabular-nums text-gray-700 dark:text-gray-300">
          {clamped}%
        </span>
      )}
    </div>
  );
};

export default ProgressBar;
