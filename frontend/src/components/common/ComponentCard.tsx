import React from "react";

/**
 * A titled card for a showcase block or a settings group (LIB-CARD).
 *
 * The same anatomy as the layout system's `Panel` (components/page/Panels):
 * a head with the title (and a line under it), a hairline, the body. Opaque
 * and flat -- it is not interactive, so it does not answer a hover. For cards
 * side by side in a dashboard, use `Row` + `Panel`, which also line them up.
 */
interface ComponentCardProps {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** One line under the title. */
  desc?: React.ReactNode;
  /** A link or quiet control on the right of the head. */
  action?: React.ReactNode;
}

const ComponentCard: React.FC<ComponentCardProps> = ({ title, children, className = "", desc, action }) => {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03] ${className}`}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3.5 sm:px-5 dark:border-white/[0.06]">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h3>
          {desc ? <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">{desc}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className="p-4 sm:p-5">
        <div className="space-y-6">{children}</div>
      </div>
    </section>
  );
};

export default ComponentCard;
