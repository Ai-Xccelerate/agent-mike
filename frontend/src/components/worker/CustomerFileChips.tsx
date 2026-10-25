"use client";

import { useState } from "react";
import { FileIcon } from "@/icons";
import { downloadCustomerFile, fileSize, type CustomerFile } from "@/lib/customer-files";

/** What a visitor attached to a message, with a download for each. The worker never opened them. */
export default function CustomerFileChips({ files }: { files: CustomerFile[] }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (files.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <ul className="flex flex-wrap gap-2">
        {files.map((file) => (
          <li key={file.id}>
            <button
              type="button"
              onClick={() => {
                setFailed(null);
                downloadCustomerFile(file).catch((error: unknown) => setFailed(error instanceof Error ? error.message : "Download failed."));
              }}
              className="flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left text-xs text-gray-700 hover:border-brand-500 hover:text-brand-600 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-200"
              title={`Download ${file.filename}`}
            >
              <FileIcon className="size-3.5 shrink-0" />
              <span className="truncate">{file.filename}</span>
              <span className="shrink-0 text-gray-400">{fileSize(file.sizeBytes)}</span>
            </button>
          </li>
        ))}
      </ul>
      {failed && <p className="text-xs text-error-600 dark:text-error-500">{failed}</p>}
    </div>
  );
}
