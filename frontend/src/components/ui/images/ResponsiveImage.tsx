/**
 * A cover image that scales with its column (LIB-IMAGES): full width, its own
 * height, rounded-xl (covers and thumbnails are a step under a card's 14px)
 * with a hairline so a pale photo keeps its edge on a white card.
 */

import Image from "next/image";
import React from "react";

export const IMAGE_FRAME = "h-auto w-full rounded-xl border border-gray-200 object-cover dark:border-white/[0.06]";

export default function ResponsiveImage() {
  return (
    <figure>
      <Image
        src="/images/grid-image/image-01.png"
        alt="The glass and steel front of an office building against a pale sky"
        className={IMAGE_FRAME}
        width={1054}
        height={600}
        sizes="(min-width: 1280px) 1100px, 100vw"
      />
      <figcaption className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
        Headquarters, Austin. Photo for the company page.
      </figcaption>
    </figure>
  );
}
