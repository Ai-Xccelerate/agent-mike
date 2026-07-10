import React from "react";

export interface RecipeItem {
  component: string;
  role: string;
}

interface LayoutRecipeProps {
  items: RecipeItem[];
}

export default function LayoutRecipe({ items }: LayoutRecipeProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 transition-colors duration-150 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700 md:p-6">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Recipe
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Compose this layout from the real shell components.
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li
            key={item.component}
            className="flex flex-col gap-1 text-sm sm:flex-row sm:items-baseline sm:gap-3"
          >
            <code className="w-fit shrink-0 rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {item.component}
            </code>
            <span className="text-gray-500 dark:text-gray-400">
              {item.role}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
