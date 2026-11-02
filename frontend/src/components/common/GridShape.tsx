import Image from "next/image";
import React from "react";

/**
 * Decorative corner grids for the screens outside the frame: sign-in, the
 * system pages (404, 500, maintenance...).
 *
 * Texture, not content: `aria-hidden`, an empty `alt`, no pointer events, and
 * held back (lower opacity on dark, where the hairlines read brighter) so the
 * ambient backdrop and the screen's one title stay the focus. `h-auto` keeps
 * the artwork's aspect ratio when the box caps its width.
 *
 * The parent must be `relative` (and `overflow-hidden`, so the corners clip).
 */
export default function GridShape() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 -z-1 w-full max-w-[250px] select-none opacity-70 xl:max-w-[450px] dark:opacity-40"
      >
        <Image
          width={540}
          height={254}
          src="/images/shape/grid-01.svg"
          alt=""
          priority
          style={{ width: "100%", height: "auto" }}
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 -z-1 w-full max-w-[250px] rotate-180 select-none opacity-70 xl:max-w-[450px] dark:opacity-40"
      >
        <Image
          width={540}
          height={254}
          src="/images/shape/grid-01.svg"
          alt=""
          style={{ width: "100%", height: "auto" }}
        />
      </div>
    </>
  );
}
