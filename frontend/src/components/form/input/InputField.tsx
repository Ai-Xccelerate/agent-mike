import React, { FC } from "react";

interface InputProps {
  type?: "text" | "number" | "email" | "password" | "date" | "time" | string;
  id?: string;
  name?: string;
  placeholder?: string;
  defaultValue?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  min?: string;
  max?: string;
  step?: number;
  disabled?: boolean;
  success?: boolean;
  error?: boolean;
  /** One line under the field: a help line, or what is wrong when `error`. */
  hint?: string;
  /** Controlled value. Leave it out to use `defaultValue`. */
  value?: string | number;
  required?: boolean;
  autoComplete?: string;
  readOnly?: boolean;
  "aria-label"?: string;
}

/**
 * A text field (LIB-INPUT), in the `field` register: 40px, 8px radius, a
 * gray-300 hairline (white at 8% on dark, over a transparent ground),
 * brand-600 border and a 2px brand ring at 20% on focus. Error and success
 * swap the border and the ring; the hint under the field takes the same
 * colour and is tied to it (`aria-describedby`) when the field has an `id`.
 */
const Input: FC<InputProps> = ({
  type = "text",
  id,
  name,
  placeholder,
  defaultValue,
  onChange,
  className = "",
  min,
  max,
  step,
  disabled = false,
  success = false,
  error = false,
  hint,
  value,
  required,
  autoComplete,
  readOnly,
  "aria-label": ariaLabel,
}) => {
  // The `field` utility's metrics, written out: the states below swap its
  // border and ring, and two border utilities in one class list would be
  // decided by stylesheet order rather than by the state.
  const base =
    "h-10 w-full appearance-none rounded-lg border px-3 text-sm shadow-theme-xs transition-colors duration-150 ease-out placeholder:text-gray-500 focus:outline-hidden focus:ring-2 dark:placeholder:text-gray-400";

  const state = disabled
    ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-500"
    : error
      ? "border-error-500 bg-transparent text-gray-800 focus:border-error-500 focus:ring-error-500/20 dark:border-error-400 dark:text-white/90 dark:focus:border-error-400"
      : success
        ? "border-success-500 bg-transparent text-gray-800 focus:border-success-500 focus:ring-success-500/20 dark:border-success-400 dark:text-white/90 dark:focus:border-success-400"
        : "border-gray-300 bg-transparent text-gray-800 hover:border-gray-400 focus:border-brand-600 focus:ring-brand-500/20 dark:border-white/[0.08] dark:text-white/90 dark:hover:border-white/[0.16] dark:focus:border-brand-500";

  const hintId = hint && id ? `${id}-hint` : undefined;

  return (
    <div className="relative">
      <input
        type={type}
        id={id}
        name={name}
        placeholder={placeholder}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        aria-describedby={hintId}
        className={`${base} ${state} ${className}`}
      />

      {hint && (
        <p
          id={hintId}
          className={`mt-1.5 text-theme-xs ${
            error
              ? "text-error-700 dark:text-error-400"
              : success
                ? "text-success-700 dark:text-success-400"
                : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;
