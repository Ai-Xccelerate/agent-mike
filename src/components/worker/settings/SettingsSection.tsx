import type { ReactNode } from "react";
import { cardClass, sectionHintClass, sectionTitleClass, staticCardClass } from "@/components/worker/settings/ui";

/**
 * One card on a settings screen: a heading, a sentence saying what it is for,
 * an optional action, and the content.
 *
 * Every screen was building this by hand, and they had drifted — the same
 * heading at three different sizes, hints sometimes `text-sm` and sometimes
 * `text-xs`, spacing between heading and content varying by page. Nothing
 * here is new; it is the shape they were all approximating, in one place.
 *
 * `action` sits on the heading row rather than below it, because the actions
 * that belong to a section (Upload files, New doc, Add a domain) read as part
 * of its title bar, not as content.
 */
export default function SettingsSection({
  title,
  description,
  action,
  aixId,
  interactive = true,
  className = "",
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Stamped as data-aix-id so the overlay can name this block. */
  aixId?: string;
  /** False for a card with nothing to click — it should not react to hover. */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={`${interactive ? cardClass : staticCardClass} ${className}`}
      data-aix-id={aixId}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className={sectionTitleClass}>{title}</h2>
          {description && <p className={sectionHintClass}>{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-3">{action}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}
