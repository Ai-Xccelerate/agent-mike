import React, { FC, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface LabelProps {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}

/**
 * A field's label (LIB-LABEL): sentence case, gray-700 on light and gray-300
 * on dark, 6px above its field. `required` adds the asterisk; say what is
 * optional with `(optional)` in the label instead where most fields are required.
 *
 * `text-sm`, not `text-theme-sm`: twMerge does not know the theme sizes and
 * would read one as a colour and drop it in favour of `text-gray-700`.
 */
const Label: FC<LabelProps> = ({ htmlFor, children, className, required }) => {
  return (
    <label
      htmlFor={htmlFor}
      className={twMerge("mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300", className)}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-error-600 dark:text-error-400" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
};

export default Label;
