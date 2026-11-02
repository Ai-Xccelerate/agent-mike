import React from "react";

interface RadioProps {
  id: string; // Unique ID for the radio button
  name: string; // Radio group name
  value: string; // Value of the radio button
  checked: boolean; // Whether the radio button is checked
  label: string; // Label for the radio button
  onChange: (value: string) => void; // Handler for value change
  className?: string; // Optional additional classes
  disabled?: boolean; // Optional disabled state for the radio button
}

/**
 * A radio (LIB-RADIO). The ring is a mark: chosen, it fills brand-600 with a
 * white centre. Group radios in a `fieldset` with a `legend` (sentence case).
 */
const Radio: React.FC<RadioProps> = ({
  id,
  name,
  value,
  checked,
  label,
  onChange,
  className = "",
  disabled = false,
}) => {
  return (
    <label
      htmlFor={id}
      className={`group relative flex select-none items-center gap-3 text-sm font-medium text-gray-800 dark:text-gray-200 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      } ${className}`}
    >
      <input
        id={id}
        name={name}
        type="radio"
        value={value}
        checked={checked}
        onChange={() => !disabled && onChange(value)} // Prevent onChange when disabled
        className="peer sr-only"
        disabled={disabled}
      />
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-brand-700 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-brand-400 dark:peer-focus-visible:ring-offset-gray-900 ${
          checked
            ? "border-brand-600 bg-brand-600"
            : `border-gray-300 bg-white dark:border-white/[0.16] dark:bg-white/[0.03] ${
                disabled ? "" : "group-hover:border-gray-400 dark:group-hover:border-white/[0.24]"
              }`
        }`}
      >
        <span className={`size-2 rounded-full bg-white ${checked ? "block" : "hidden"}`} />
      </span>
      {label}
    </label>
  );
};

export default Radio;
