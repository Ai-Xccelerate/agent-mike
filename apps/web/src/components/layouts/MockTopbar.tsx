import React from "react";

interface MockTopbarProps {
  links?: string[];
  activeIndex?: number;
  label?: string;
  minimal?: boolean;
  highlight?: "brand" | "neutral";
}

export default function MockTopbar({
  links,
  activeIndex = 0,
  label = "topbar",
  minimal = false,
  highlight = "brand",
}: MockTopbarProps) {
  const activeClasses =
    highlight === "brand"
      ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400"
      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90";

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900 sm:h-14 sm:px-4">
      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <div className="h-5 w-16 shrink-0 rounded bg-gray-200/70 dark:bg-gray-800" />
      {links && (
        <>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link, i) => (
              <span
                key={link}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  i === activeIndex
                    ? activeClasses
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {link}
              </span>
            ))}
          </nav>
          <div className="size-6 shrink-0 rounded bg-gray-200/70 dark:bg-gray-800 md:hidden" />
        </>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {!minimal && (
          <div className="hidden h-7 w-24 rounded-full bg-gray-200/70 dark:bg-gray-800 sm:block" />
        )}
        <div className="size-7 rounded-full bg-gray-200/70 dark:bg-gray-800" />
      </div>
    </div>
  );
}
