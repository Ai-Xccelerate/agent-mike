import React from "react";

type BadgeVariant = "light" | "solid";
type BadgeSize = "sm" | "md";
type BadgeColor =
  | "primary"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "light"
  | "dark";

interface BadgeProps {
  variant?: BadgeVariant; // Light or solid variant
  size?: BadgeSize; // Badge size
  color?: BadgeColor; // Badge color
  startIcon?: React.ReactNode; // Icon at the start
  endIcon?: React.ReactNode; // Icon at the end
  children: React.ReactNode; // Badge content
}

const Badge: React.FC<BadgeProps> = ({
  variant = "light",
  color = "primary",
  size = "md",
  startIcon,
  endIcon,
  children,
}) => {
  const baseStyles =
    "inline-flex items-center px-2.5 py-0.5 justify-center gap-1 rounded-full font-medium";

  // Define size styles
  const sizeStyles = {
    sm: "text-theme-xs", // Smaller padding and font size
    md: "text-sm", // Default padding and font size
  };

  // Define color styles for variants
  const variants = {
    light: {
      primary:
        "bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-400",
      success:
        "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
      error:
        "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
      warning:
        "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
      info: "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-400",
      light: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/80",
      dark: "bg-gray-900/[0.06] text-gray-700 dark:bg-white/[0.08] dark:text-gray-200",
    },
    // 700 fills: white on a 500 fails AA for 12–14px text (white on brand-500 is 2.76:1).
    solid: {
      primary: "bg-brand-700 text-white dark:text-white",
      success: "bg-success-700 text-white dark:text-white",
      error: "bg-error-700 text-white dark:text-white",
      warning: "bg-warning-700 text-white dark:text-white",
      info: "bg-blue-light-700 text-white dark:text-white",
      light: "bg-gray-500 text-white dark:bg-gray-600 dark:text-white",
      dark: "bg-gray-700 text-white dark:text-white",
    },
  };

  // Get styles based on size and color variant
  const sizeClass = sizeStyles[size];
  const colorStyles = variants[variant][color];

  return (
    <span className={`${baseStyles} ${sizeClass} ${colorStyles}`}>
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </span>
  );
};

export default Badge;
