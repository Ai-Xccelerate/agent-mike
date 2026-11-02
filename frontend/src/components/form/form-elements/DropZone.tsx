"use client";
import React, { useState } from "react";

import ComponentCard from "@/components/common/ComponentCard";
import DropZone from "@/components/common/DropZone";
import { ImageIcon, XIcon } from "@/components/common/icons";

/** The library's `DropZone` with the files it took listed under it. */
const DropzoneComponent: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);

  return (
    <ComponentCard title="Drop zone" desc="Drag files in, or click to choose them.">
      <DropZone
        id="fe-dropzone"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        multiple
        label="Drop images here, or choose them"
        hint="PNG, JPG, WebP or SVG, up to 5 MB each"
        onFiles={(added) => setFiles((prev) => [...prev, ...added])}
      />
      {files.length > 0 ? (
        <ul className="surface-2 divide-y divide-gray-200/70 dark:divide-white/[0.05]">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-3 py-2">
              <ImageIcon className="size-4 text-gray-500 dark:text-gray-400" />
              <span className="min-w-0 flex-1 truncate text-theme-sm text-gray-800 dark:text-gray-200">{file.name}</span>
              <span className="shrink-0 text-theme-xs tabular-nums text-gray-500 dark:text-gray-400">
                {Math.max(1, Math.round(file.size / 1024)).toLocaleString("en-US")} KB
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, at) => at !== index))}
                className="focus-ring flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </ComponentCard>
  );
};

export default DropzoneComponent;
