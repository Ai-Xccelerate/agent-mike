import Image from "next/image";
import React from "react";

import { IMAGE_FRAME } from "./ResponsiveImage";

const IMAGES = [
  { src: "/images/grid-image/image-04.png", alt: "The corner of a dark building under a blue sky" },
  { src: "/images/grid-image/image-05.png", alt: "A white stairwell seen from below" },
  { src: "/images/grid-image/image-06.png", alt: "The top of a glass tower against a clear sky" },
];

/** Three to a row from `xl`, two from `sm`, one on a phone. */
export default function ThreeColumnImageGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {IMAGES.map((image) => (
        <Image
          key={image.src}
          src={image.src}
          alt={image.alt}
          className={`aspect-[16/9] ${IMAGE_FRAME}`}
          width={338}
          height={192}
          sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
      ))}
    </div>
  );
}
