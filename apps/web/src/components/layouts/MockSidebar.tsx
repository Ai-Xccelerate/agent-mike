import React from "react";

interface MockSidebarProps {
  items: string[];
  activeIndex?: number;
  side?: "left" | "right";
  rail?: boolean;
  widthClass?: string;
  label?: string;
  showLogo?: boolean;
  highlight?: "brand" | "neutral";
}

export default function MockSidebar({
  items,
  activeIndex = 0,
  side = "left",
  rail = false,
  widthClass,
  label = "sidebar",
  showLogo = true,
  highlight = "brand",
}: MockSidebarProps) {
  const width = widthClass ?? (rail ? "w-16" : "w-56");
  const borderSide = side === "left" ? "border-r" : "border-l";
  const activeClasses =
    highlight === "brand"
      ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400"
      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90";

  return (
    <div
      className={`hidden shrink-0 flex-col border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:flex ${width} ${borderSide}`}
    >
      <span
        className={`mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 ${
          rail ? "text-center" : ""
        }`}
      >
        {label}
      </span>
      {rail ? (
        <div className="flex flex-col items-center gap-1.5">
          {showLogo && (
            <div className="mb-2 size-8 rounded-lg bg-gray-200/70 dark:bg-gray-800" />
          )}
          {items.map((item, i) => (
            <div
              key={item}
              title={item}
              className={`flex size-9 items-center justify-center rounded-lg text-xs font-semibold ${
                i === activeIndex
                  ? activeClasses
                  : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
              }`}
            >
              {item.charAt(0)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {showLogo && (
            <div className="mb-3 h-6 w-24 rounded bg-gray-200/70 dark:bg-gray-800" />
          )}
          {items.map((item, i) => (
            <div
              key={item}
              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                i === activeIndex
                  ? activeClasses
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
