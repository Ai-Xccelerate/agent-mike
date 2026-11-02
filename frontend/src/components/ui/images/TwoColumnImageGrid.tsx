import Image from "next/image";
import React from "react";

import { IMAGE_FRAME } from "./ResponsiveImage";

const IMAGES = [
  { src: "/images/grid-image/image-02.png", alt: "An open office with blue chairs around a round table" },
  { src: "/images/grid-image/image-03.png", alt: "A quiet lounge with grey armchairs and a tall lamp" },
];

/** Two images side by side from `sm`, stacked on a phone. */
export default function TwoColumnImageGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {IMAGES.map((image) => (
        <Image
          key={image.src}
          src={image.src}
          alt={image.alt}
          className={`aspect-[16/9] ${IMAGE_FRAME}`}
          width={517}
          height={295}
          sizes="(min-width: 640px) 50vw, 100vw"
        />
      ))}
    </div>
  );
}
