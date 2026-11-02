/**
 * A trail of where you are (LIB-BREADCRUMB).
 *
 * Product pages do not draw one: the sidebar already says where you are, and
 * the page head's eyebrow names the section over the title. Keep this for a
 * hierarchy deeper than the navigation -- a folder path in Files, a nested
 * setting, a document inside a deal.
 *
 * The links are quiet grey and darken on hover; the current page is ink, not
 * a link, and `aria-current="page"`. Separators are decoration.
 */

import Link from "next/link";
import React from "react";

import { ChevronRightIcon } from "@/components/common/icons";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  variant?: "chevron" | "slash";
  className?: string;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, variant = "chevron", className = "" }) => {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-theme-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const content = (
            <span className="flex min-w-0 items-center gap-1.5">
              {item.icon && (
                <span aria-hidden="true" className="flex items-center text-gray-500 dark:text-gray-400">
                  {item.icon}
                </span>
              )}
              {item.label}
            </span>
          );

          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={`flex min-w-0 items-center ${isLast ? "font-medium text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
                >
                  {content}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="focus-ring flex items-center rounded text-gray-600 transition-colors duration-150 ease-out hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  {content}
                </Link>
              )}
              {!isLast &&
                (variant === "slash" ? (
                  <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">
                    /
                  </span>
                ) : (
                  <ChevronRightIcon aria-hidden="true" className="size-3.5 text-gray-400 dark:text-gray-500" />
                ))}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
