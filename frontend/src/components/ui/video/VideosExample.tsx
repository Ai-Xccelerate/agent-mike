import React from "react";

import YouTubeEmbed from "./YouTubeEmbed";
import ComponentCard from "@/components/common/ComponentCard";

const VIDEO_ID = "dQw4w9WgXcQ";

/** Wide ratios take two of three columns and tall ones one, so the cards in a row come out near one height. */
const RATIOS = [
  { ratio: "16:9", desc: "The default: a recorded demo, a product tour.", span: "lg:col-span-2" },
  { ratio: "1:1", desc: "Square clips cut for social posts.", span: "" },
  { ratio: "21:9", desc: "A wide banner video across the top of a page.", span: "lg:col-span-2" },
  { ratio: "4:3", desc: "Older recordings and slides captured from a call.", span: "" },
] as const;

/** The four ratios `YouTubeEmbed` takes. */
export default function VideosExample() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {RATIOS.map(({ ratio, desc, span }) => (
        <ComponentCard key={ratio} title={`Ratio ${ratio}`} desc={desc} className={span}>
          <YouTubeEmbed videoId={VIDEO_ID} aspectRatio={ratio} title={`Product tour, ${ratio}`} />
        </ComponentCard>
      ))}
    </div>
  );
}
