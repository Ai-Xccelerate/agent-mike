import React from "react";

interface IconProps {
  className?: string;
}

const base = (className?: string) => ({
  width: undefined,
  className: className ?? "size-[18px]",
  fill: "none" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true as const,
});

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function StarIcon({
  filled,
  className,
}: IconProps & { filled: boolean }) {
  return (
    <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
      <path
        d="m12 2.5 2.94 5.95 6.57.96-4.75 4.63 1.12 6.54L12 17.5l-5.88 3.08 1.12-6.54-4.75-4.63 6.57-.96L12 2.5Z"
        {...stroke}
        strokeWidth={1.5}
      />
    </svg>
  );
}

export function ArchiveIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3.5 4.5h17a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" {...stroke} />
      <path d="M4.5 9v9a1.5 1.5 0 0 0 1.5 1.5h12A1.5 1.5 0 0 0 19.5 18V9M10 13h4" {...stroke} />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 6.5h16M9.5 6.5v-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6 6.5l.8 12.1a2 2 0 0 0 2 1.9h6.4a2 2 0 0 0 2-1.9L18 6.5M10 10.5v6M14 10.5v6" {...stroke} />
    </svg>
  );
}

export function MailOpenIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3.5 9.5 12 4l8.5 5.5v9A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-9Z" {...stroke} />
      <path d="m3.8 10 8.2 5 8.2-5" {...stroke} />
    </svg>
  );
}

export function MailClosedIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z" {...stroke} />
      <path d="m3.5 7.5 8.5 5.5 8.5-5.5" {...stroke} />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" {...stroke} />
      <path d="M12 7.5V12l3 2" {...stroke} />
    </svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" {...stroke} />
    </svg>
  );
}

export function DotsIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function TagIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m20.6 12.3-7.9 7.9a1.5 1.5 0 0 1-2.12 0l-7.1-7.1V4h9.1l8.02 8.02a1.5 1.5 0 0 1 0 .28Z" {...stroke} />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m14.5 6-6 6 6 6" {...stroke} />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m9.5 6 6 6-6 6" {...stroke} />
    </svg>
  );
}

export function BackArrowIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M19 12H5m0 0 6-6m-6 6 6 6" {...stroke} />
    </svg>
  );
}

export function PaperclipIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48" {...stroke} />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 12h14" {...stroke} />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m6 6 12 12M18 6 6 18" {...stroke} />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="7" {...stroke} />
      <path d="m20.5 20.5-4.5-4.5" {...stroke} />
    </svg>
  );
}
