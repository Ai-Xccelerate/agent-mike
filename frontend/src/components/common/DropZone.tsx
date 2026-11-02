"use client";

/**
 * Files, dropped or chosen: a dashed well that takes a drag from the desktop
 * and is also a button that opens the file picker, so a keyboard and a phone
 * get the same thing a mouse does.
 *
 * It only hands the files over. What may be added (how many, how large, which
 * kinds) is the caller's to say, next to the files it refuses.
 */

import { useRef, useState } from "react";

import { UploadIcon } from "@/components/common/icons";

export default function DropZone({
  id,
  accept,
  multiple = false,
  disabled = false,
  label,
  hint,
  onFiles,
}: {
  id: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  /** What the well says: "Drop files here, or choose them". */
  label: string;
  /** The line under it: kinds and limits. */
  hint: string;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={label}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          // The same file chosen again after a removal still counts as a change.
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!disabled) take(event.dataTransfer?.files);
        }}
        data-over={over ? "true" : undefined}
        className={`focus-ring flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors duration-150 ease-out disabled:cursor-not-allowed ${
          over
            ? "border-brand-500 bg-brand-25 dark:border-brand-400 dark:bg-brand-500/[0.08]"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:border-white/[0.12] dark:hover:border-white/[0.2] dark:hover:bg-white/[0.03]"
        }`}
      >
        <UploadIcon className="size-5 text-gray-500 dark:text-gray-400" />
        <span className="text-theme-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        <span className="text-theme-xs text-gray-500 dark:text-gray-400">{hint}</span>
      </button>
    </div>
  );
}
