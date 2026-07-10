import React from "react";

interface MockContentProps {
  variant?: "grid" | "boxed" | "narrow";
  label?: string;
  mobileNote?: string;
}

const block = "rounded-lg bg-gray-200/70 dark:bg-gray-800";

function GridBlocks() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-14 ${block}`} />
        ))}
      </div>
      <div className={`h-36 ${block}`} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className={`h-24 ${block}`} />
        <div className={`h-24 ${block}`} />
      </div>
    </>
  );
}

export default function MockContent({
  variant = "grid",
  label = "content",
  mobileNote,
}: MockContentProps) {
  return (
    <div className="min-w-0 flex-1 overflow-hidden bg-gray-50 p-4 dark:bg-gray-900/60 sm:p-5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {mobileNote && (
        <p className="mb-3 mt-2 rounded-lg border border-dashed border-gray-300 p-2.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400 sm:hidden">
          {mobileNote}
        </p>
      )}

      {variant === "grid" && (
        <div className="mt-2 space-y-3">
          <GridBlocks />
        </div>
      )}

      {variant === "boxed" && (
        <div className="mt-2 flex h-full items-stretch">
          <div className="flex min-w-0 flex-1 items-start justify-center pt-8">
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:block">
              gutter
            </span>
          </div>
          <div className="w-full max-w-xl shrink-0 space-y-3 border-x border-dashed border-gray-300 px-4 dark:border-gray-700 sm:px-6">
            <GridBlocks />
          </div>
          <div className="flex min-w-0 flex-1 items-start justify-center pt-8">
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:block">
              gutter
            </span>
          </div>
        </div>
      )}

      {variant === "narrow" && (
        <div className="mx-auto mt-6 w-full max-w-md space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
              1
            </div>
            <div className="h-px flex-1 bg-gray-300 dark:bg-gray-700" />
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              2
            </div>
            <div className="h-px flex-1 bg-gray-300 dark:bg-gray-700" />
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              3
            </div>
          </div>
          <div className={`h-6 w-2/3 ${block}`} />
          <div className={`h-10 ${block}`} />
          <div className={`h-10 ${block}`} />
          <div className={`h-10 ${block}`} />
          <div className="flex justify-end gap-2">
            <div className="h-9 w-20 rounded-lg bg-gray-200/70 dark:bg-gray-800" />
            <div className="h-9 w-24 rounded-lg bg-gray-300 dark:bg-gray-700" />
          </div>
        </div>
      )}
    </div>
  );
}
