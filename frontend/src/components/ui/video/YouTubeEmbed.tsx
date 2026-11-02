/**
 * A YouTube video at a fixed ratio (LIB-VIDEO): 16:9 by default, 4:3, 21:9 or
 * square. Rounded-xl with a hairline, like a cover; dark while it loads. From
 * youtube-nocookie.com, and lazy, so a page of them does not load four
 * players before anyone presses play. Give it a `title` that says what the
 * video is: it is the frame's accessible name.
 */

import React from "react";

type AspectRatio = "16:9" | "4:3" | "21:9" | "1:1";

interface YouTubeEmbedProps {
  videoId: string;
  aspectRatio?: AspectRatio;
  title?: string;
  className?: string;
}

const RATIO: Record<AspectRatio, string> = {
  "16:9": "aspect-video",
  "4:3": "aspect-4/3",
  "21:9": "aspect-21/9",
  "1:1": "aspect-square",
};

const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({ videoId, aspectRatio = "16:9", title = "YouTube video", className = "" }) => {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-200 bg-gray-900 dark:border-white/[0.06] ${RATIO[aspectRatio]} ${className}`}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="size-full border-0"
      />
    </div>
  );
};

export default YouTubeEmbed;
