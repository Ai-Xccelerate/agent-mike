/**
 * A ribbon on a card's corner or edge (LIB-RIBBON): one word that changes how
 * the card is read -- New, Recommended, Beta. Decoration that carries a word,
 * so one per card and few per page; for a state, use a `StatusPill`.
 *
 * Its parent is `relative`. For `corner` it is also `overflow-hidden`, which
 * cuts the band at the card's edge; `rounded` hangs over the edge, so its
 * parent must not clip.
 *
 * Fills are the deep shades (brand-700, success-700...), where white text
 * reads -- white on brand-500 is 2.8:1. `neutral` is ink, for the page that
 * already has its orange moment.
 */

import React from "react";

type RibbonVariant = "corner" | "rounded";
type RibbonColor = "brand" | "success" | "error" | "info" | "neutral";

interface RibbonProps {
  text: string;
  variant?: RibbonVariant;
  color?: RibbonColor;
}

const colorClasses: Record<RibbonColor, string> = {
  brand: "bg-brand-700 text-white",
  success: "bg-success-700 text-white",
  error: "bg-error-700 text-white",
  info: "bg-blue-light-700 text-white",
  neutral: "bg-gray-900 text-white dark:bg-white dark:text-gray-900",
};

// A darker shade for the folded tail, so the band reads as wrapping the card's edge.
const foldClasses: Record<RibbonColor, string> = {
  brand: "bg-brand-900",
  success: "bg-success-900",
  error: "bg-error-900",
  info: "bg-blue-light-900",
  neutral: "bg-black dark:bg-gray-400",
};

const Ribbon: React.FC<RibbonProps> = ({ text, variant = "rounded", color = "brand" }) => {
  if (variant === "corner") {
    return (
      <span
        className={`absolute -right-11 top-5 w-40 rotate-45 py-1 text-center text-theme-xs font-semibold ${colorClasses[color]}`}
      >
        {text}
      </span>
    );
  }

  // On the top-right edge, so it never sits on a card's left-aligned title.
  return (
    <span
      className={`absolute -right-1.5 top-4 inline-flex items-center rounded-l-md py-1 pl-3 pr-2.5 text-theme-xs font-semibold ${colorClasses[color]}`}
    >
      {text}
      <span
        aria-hidden="true"
        className={`absolute right-0 top-full h-1.5 w-1.5 [clip-path:polygon(0_0,100%_0,0_100%)] ${foldClasses[color]}`}
      />
    </span>
  );
};

export default Ribbon;
