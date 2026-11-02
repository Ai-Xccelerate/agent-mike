import type React from "react";

interface CheckboxProps {
  label?: string;
  checked: boolean;
  className?: string;
  id?: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** A quieter line under the label. */
  hint?: string;
}

/**
 * A checkbox (LIB-CHECKBOX). The box is a mark, so checked it takes the brand
 * fill -- brand-600, where the white tick holds 3.3:1 (on brand-500 it was
 * 2.8:1, under the 3:1 a control's state needs).
 */
const Checkbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  id,
  onChange,
  className = "",
  disabled = false,
  hint,
}) => {
  return (
    <label
      className={`group flex gap-3 ${hint ? "items-start" : "items-center"} ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <span className={`relative flex size-5 shrink-0 ${hint ? "mt-px" : ""}`}>
        <input
          id={id}
          type="checkbox"
          className={`size-5 cursor-pointer appearance-none rounded-md border border-gray-300 bg-white transition-colors duration-150 ease-out checked:border-brand-600 checked:bg-brand-600 hover:border-gray-400 checked:hover:border-brand-700 checked:hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:hover:border-gray-300 dark:border-white/[0.16] dark:bg-white/[0.03] dark:hover:border-white/[0.24] dark:checked:border-brand-600 dark:checked:bg-brand-600 dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-gray-900 ${className}`}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        {checked && (
          <svg
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M11.6666 3.5L5.24992 9.91667L2.33325 7"
              stroke="white"
              strokeWidth="1.94437"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {label || hint ? (
        <span className="min-w-0">
          {label ? <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span> : null}
          {hint ? <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">{hint}</span> : null}
        </span>
      ) : null}
    </label>
  );
};

export default Checkbox;
