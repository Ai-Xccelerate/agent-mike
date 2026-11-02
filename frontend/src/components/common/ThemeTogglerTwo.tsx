"use client";

/**
 * The theme switch for the screens outside the frame (sign-in, sign-up...),
 * where there is no account menu to hold it.
 *
 * A quiet icon button in a corner, not an orange tile: on these screens the
 * one orange moment is the form's primary action. The icon says what you will
 * get (the moon on light, the sun on dark), swapped by the `dark` class rather
 * than by state, so it is right on the first paint and never mismatches the
 * server render. 40px, 44px on a phone.
 */

import { MoonIcon, SunIcon } from "@/components/common/icons";
import { useTheme } from "@/context/ThemeContext";

export default function ThemeTogglerTwo({ className = "" }: { className?: string }) {
  const { toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Switch between light and dark theme"
      title="Switch theme"
      className={`focus-ring inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 ease-out hover:bg-gray-900/[0.04] hover:text-gray-900 max-sm:size-11 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white ${className}`}
    >
      <MoonIcon className="size-[18px] dark:hidden" />
      <SunIcon className="hidden size-[18px] dark:block" />
    </button>
  );
}
