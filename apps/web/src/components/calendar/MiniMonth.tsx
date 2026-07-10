"use client";
import React, { useEffect, useState } from "react";

interface MiniMonthProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MiniMonth: React.FC<MiniMonthProps> = ({ selectedDate, onSelectDate }) => {
  const [viewMonth, setViewMonth] = useState<Date>(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  useEffect(() => {
    setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate]);

  const today = new Date();
  const gridStart = new Date(viewMonth);
  gridStart.setDate(1 - viewMonth.getDay());

  const cells: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const shiftMonth = (delta: number) => {
    setViewMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    );
  };

  const navButtonClass =
    "flex size-7 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white/90";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            className={navButtonClass}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
            className={navButtonClass}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span
            key={`${initial}-${i}`}
            className="flex h-7 items-center justify-center text-[11px] font-medium uppercase text-gray-500 dark:text-gray-400"
          >
            {initial}
          </span>
        ))}
        {cells.map((date) => {
          const inMonth = date.getMonth() === viewMonth.getMonth();
          const isToday = isSameDay(date, today);
          const isSelected = !isToday && isSameDay(date, selectedDate);
          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDate(new Date(date))}
              className={`mx-auto flex size-7 items-center justify-center rounded-full text-xs transition-colors duration-150 ${
                isToday
                  ? "bg-brand-500 font-semibold text-white"
                  : isSelected
                  ? "bg-brand-50 font-medium text-brand-600 ring-2 ring-inset ring-brand-100 dark:bg-brand-500/15 dark:text-brand-400 dark:ring-brand-500/30"
                  : inMonth
                  ? "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  : "text-gray-500 hover:bg-gray-100 dark:text-gray-600 dark:hover:bg-white/[0.06]"
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MiniMonth;
