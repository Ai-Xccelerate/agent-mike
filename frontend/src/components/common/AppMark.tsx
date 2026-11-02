/**
 * The AI Xccelerate mark, and the mark with the product's name (LIB-APPMARK).
 *
 * The rising orange stroke and the dot are the family's two orange moments;
 * the ink is gray-900 on light and white on dark, so the mark swaps with the
 * theme rather than sitting on a white tile in dark mode. The artwork carries
 * about a fifth of padding on each side, so it is drawn a step larger than its
 * box and pulled in with a negative margin: the mark itself fills the box.
 *
 * Decorative (`alt=""`): it always sits beside the product's name, or inside a
 * link that names itself.
 */

import Image from "next/image";

import { APP } from "@/config/app";

export function AppMark({ className = "size-7" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center ${className}`}>
      <Image
        src="/images/logo/aix-icon.png"
        alt=""
        width={40}
        height={40}
        priority
        className="pointer-events-none absolute inset-[-22%] size-[144%] max-w-none dark:hidden"
      />
      <Image
        src="/images/logo/aix-icon-dark.png"
        alt=""
        width={40}
        height={40}
        priority
        className="pointer-events-none absolute inset-[-22%] hidden size-[144%] max-w-none dark:block"
      />
    </span>
  );
}

/**
 * The mark and the product's name together, for the places with no workspace
 * line beside them: the phone's top bar, the sign-in and system pages.
 */
export function AppWordmark({
  className = "",
  markClassName = "size-6",
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <AppMark className={markClassName} />
      <span className="font-display text-base font-semibold tracking-tight text-gray-900 dark:text-white">
        {APP.name}
      </span>
    </span>
  );
}
