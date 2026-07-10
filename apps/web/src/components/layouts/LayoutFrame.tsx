import React from "react";

interface LayoutFrameProps {
  url?: string;
  children: React.ReactNode;
}

export default function LayoutFrame({
  url = "app.aixccelerate.com",
  children,
}: LayoutFrameProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white transition-colors duration-150 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
        <div className="flex shrink-0 gap-1.5">
          <span className="size-2.5 rounded-full bg-gray-200 dark:bg-gray-700" />
          <span className="size-2.5 rounded-full bg-gray-200 dark:bg-gray-700" />
          <span className="size-2.5 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center truncate rounded-full bg-gray-100 px-3 text-[11px] text-gray-400 dark:bg-gray-800 dark:text-gray-500">
          {url}
        </div>
        <div className="hidden w-12 shrink-0 sm:block" />
      </div>
      <div className="h-[440px] overflow-hidden sm:h-[560px]">{children}</div>
    </div>
  );
}
