"use client";

import { useEffect } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";

import { CalendarIcon } from "@/components/common/icons";

import Label from "./Label";
import Hook = flatpickr.Options.Hook;
import DateOption = flatpickr.Options.DateOption;

type PropsType = {
  id: string;
  mode?: "single" | "multiple" | "range" | "time";
  onChange?: Hook | Hook[];
  defaultDate?: DateOption;
  label?: string;
  placeholder?: string;
};

/**
 * A date field (LIB-DATEPICKER): a `field`-styled input that opens flatpickr's
 * calendar under it (the calendar's look lives in globals.css).
 */
export default function DatePicker({
  id,
  mode,
  onChange,
  label,
  defaultDate,
  placeholder,
}: PropsType) {
  useEffect(() => {
    const flatPickr = flatpickr(`#${id}`, {
      mode: mode || "single",
      static: true,
      monthSelectorType: "static",
      dateFormat: "Y-m-d",
      defaultDate,
      onChange,
    });

    return () => {
      if (!Array.isArray(flatPickr)) {
        flatPickr.destroy();
      }
    };
  }, [mode, onChange, id, defaultDate]);

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}

      <div className="relative">
        <input
          id={id}
          placeholder={placeholder}
          autoComplete="off"
          className="h-10 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-3 pr-10 text-sm text-gray-800 shadow-theme-xs transition-colors duration-150 ease-out placeholder:text-gray-500 hover:border-gray-400 focus:border-brand-600 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 dark:border-white/[0.08] dark:text-white/90 dark:placeholder:text-gray-400 dark:hover:border-white/[0.16] dark:focus:border-brand-500"
        />

        <span className="pointer-events-none absolute right-3 top-5 -translate-y-1/2 text-gray-500 dark:text-gray-400">
          <CalendarIcon className="size-4.5" />
        </span>
      </div>
    </div>
  );
}
