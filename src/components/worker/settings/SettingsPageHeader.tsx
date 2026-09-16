"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/button/Button";

function formatEditedAt(value: Date | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

/**
 * The title block and save flow shared by every settings screen.
 *
 * Two things beyond the obvious:
 *
 * **Unsaved work cannot be lost silently.** A dirty page warns on reload and
 * intercepts in-app navigation, because settings forms stage edits and the nav
 * is one click away from every field.
 *
 * **The save action follows you.** Identity, Agent configuration and Guardrails
 * are all longer than a screen: you scroll down, edit a field, and the Save
 * button is somewhere above the fold. So when the page is dirty *and* the
 * header has scrolled out of view, a bar appears with the same two actions.
 * It is tied to the header's visibility rather than shown whenever dirty, so
 * there are never two Save buttons on screen at once.
 *
 * The bar is chrome, not content, which is why it may use glass.
 */
export default function SettingsPageHeader({
  title,
  description,
  onSave,
  onDiscard,
  dirty = false,
  saving,
  notice,
  noticeError,
  lastEditedAt,
  saveLabel = "Save changes",
}: {
  title: string;
  description: string;
  onSave?: () => void;
  onDiscard?: () => void;
  dirty?: boolean;
  saving?: boolean;
  notice?: string;
  noticeError?: boolean;
  lastEditedAt?: Date | null;
  saveLabel?: string;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const linkClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.href === window.location.href) return;
      if (!window.confirm("You have unsaved changes. Leave without saving them?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", linkClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", linkClick, true);
    };
  }, [dirty]);

  // Watched only while there is a save flow at all, so read-only screens pay
  // nothing for it.
  useEffect(() => {
    const node = headerRef.current;
    if (!node || !onSave || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onSave]);

  const editedAt = formatEditedAt(lastEditedAt);
  const showFloatingBar = Boolean(onSave) && dirty && !headerVisible;

  const actions = (
    <>
      {onDiscard && (
        <Button variant="outline" size="sm" onClick={onDiscard} disabled={!dirty || saving}>
          Discard
        </Button>
      )}
      <Button size="sm" loading={saving} onClick={onSave} disabled={!dirty}>
        {saveLabel}
      </Button>
    </>
  );

  return (
    <>
      <header
        ref={headerRef}
        className="flex flex-col gap-4 border-b border-gray-200/80 pb-5 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            {description}
          </p>
          {editedAt && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Last saved {editedAt}</p>
          )}
        </div>

        {onSave && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {notice && (
              <span
                className={`text-xs font-medium ${
                  noticeError
                    ? "text-error-600 dark:text-error-400"
                    : "text-success-600 dark:text-success-400"
                }`}
              >
                {notice}
              </span>
            )}
            {actions}
          </div>
        )}
      </header>

      {showFloatingBar && (
        <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
          <div className="glass-float pointer-events-auto flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Unsaved changes
            </span>
            {actions}
          </div>
        </div>
      )}
    </>
  );
}
