import React from "react";

interface TextareaProps {
  placeholder?: string; // Placeholder text
  rows?: number; // Number of rows
  value?: string; // Current value
  onChange?: (value: string) => void; // Change handler
  className?: string; // Additional CSS classes
  disabled?: boolean; // Disabled state
  error?: boolean; // Error state
  hint?: string; // Hint text to display
}

const TextArea: React.FC<TextareaProps> = ({
  placeholder = "Enter your message", // Default placeholder
  rows = 3, // Default number of rows
  value = "", // Default value
  onChange, // Callback for changes
  className = "", // Additional custom styles
  disabled = false, // Disabled state
  error = false, // Error state
  hint = "", // Default hint text
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  // The field register, as `InputField` draws it: no fill in dark, brand-600
  // and a soft ring on focus.
  let textareaClasses = `custom-scrollbar w-full appearance-none rounded-lg border px-3 py-2.5 text-sm shadow-theme-xs transition-colors duration-150 ease-out placeholder:text-gray-500 focus:outline-hidden focus:ring-2 dark:placeholder:text-gray-400 ${className}`;

  if (disabled) {
    textareaClasses += ` cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-500`;
  } else if (error) {
    textareaClasses += ` border-error-500 bg-transparent text-gray-800 focus:border-error-500 focus:ring-error-500/20 dark:border-error-400 dark:text-white/90 dark:focus:border-error-400`;
  } else {
    textareaClasses += ` border-gray-300 bg-transparent text-gray-800 hover:border-gray-400 focus:border-brand-600 focus:ring-brand-500/20 dark:border-white/[0.08] dark:text-white/90 dark:hover:border-white/[0.16] dark:focus:border-brand-500`;
  }

  return (
    <div className="relative">
      <textarea
        placeholder={placeholder}
        rows={rows}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className={textareaClasses}
      />
      {hint && (
        <p
          className={`mt-1.5 text-theme-xs ${
            error
              ? "text-error-700 dark:text-error-400"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default TextArea;
