import React from "react";

interface RadioProps {
  id: string; // Unique ID for the radio button
  name: string; // Group name for the radio button
  value: string; // Value of the radio button
  checked: boolean; // Whether the radio button is checked
  label: string; // Label text for the radio button
  onChange: (value: string) => void; // Handler for when the radio button is toggled
  className?: string; // Optional custom classes for styling
}

/** The compact radio (LIB-RADIO-SM): 16px, for dense rows and filter lists. */
const RadioSm: React.FC<RadioProps> = ({
  id,
  name,
  value,
  checked,
  label,
  onChange,
  className = "",
}) => {
  return (
    <label
      htmlFor={id}
      className={`group flex cursor-pointer select-none items-center gap-2 text-sm text-gray-700 dark:text-gray-300 ${className}`}
    >
      <span className="relative flex">
        <input
          type="radio"
          id={id}
          name={name}
          value={value}
          checked={checked}
          onChange={() => onChange(value)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={`flex size-4 items-center justify-center rounded-full border transition-colors duration-150 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-brand-700 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-brand-400 dark:peer-focus-visible:ring-offset-gray-900 ${
            checked
              ? "border-brand-600 bg-brand-600"
              : "border-gray-300 bg-white group-hover:border-gray-400 dark:border-white/[0.16] dark:bg-white/[0.03] dark:group-hover:border-white/[0.24]"
          }`}
        >
          <span className={`size-1.5 rounded-full ${checked ? "bg-white" : "bg-transparent"}`} />
        </span>
      </span>
      {label}
    </label>
  );
};

export default RadioSm;
