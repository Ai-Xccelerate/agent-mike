/**
 * Something is happening and there is no telling how long it takes
 * (LIB-SPINNER). Where you can say how far, use `ProgressBar`; where you know
 * the shape of what is coming, a `Skeleton`; inside a button, `Button`'s own
 * `loading`.
 *
 * The ring is a faint track with one arc running round it. It keeps turning
 * under reduced motion -- a still spinner says nothing is happening -- while
 * the dots, which are decoration, rest.
 */

import React from "react";

type SpinnerSize = "sm" | "md" | "lg";
type SpinnerColor = "brand" | "gray" | "white";
type SpinnerVariant = "ring" | "dots";

interface SpinnerProps {
  size?: SpinnerSize;
  color?: SpinnerColor;
  variant?: SpinnerVariant;
  /** What is loading, for a screen reader: "Loading accounts". */
  label?: string;
  className?: string;
}

const ringSize: Record<SpinnerSize, string> = {
  sm: "size-5 border-2",
  md: "size-8 border-[2.5px]",
  lg: "size-12 border-[3px]",
};

const dotSize: Record<SpinnerSize, string> = {
  sm: "size-1.5",
  md: "size-2",
  lg: "size-3",
};

const ringColor: Record<SpinnerColor, string> = {
  brand: "border-brand-500/20 border-t-brand-500",
  gray: "border-gray-900/10 border-t-gray-600 dark:border-white/10 dark:border-t-gray-300",
  white: "border-white/30 border-t-white",
};

const dotColor: Record<SpinnerColor, string> = {
  brand: "bg-brand-500",
  gray: "bg-gray-500 dark:bg-gray-400",
  white: "bg-white",
};

const Spinner: React.FC<SpinnerProps> = ({ size = "md", color = "brand", variant = "ring", label = "Loading", className = "" }) => {
  if (variant === "dots") {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} role="status" aria-label={label}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`animate-pulse-dot inline-block rounded-full ${dotSize[size]} ${dotColor[color]}`}
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block shrink-0 animate-spin rounded-full ${ringSize[size]} ${ringColor[color]} ${className}`}
    />
  );
};

export default Spinner;
