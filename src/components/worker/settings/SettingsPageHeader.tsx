"use client";

import { useEffect } from "react";
import Button from "@/components/ui/button/Button";

function formatEditedAt(value: Date | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

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

  const editedAt = formatEditedAt(lastEditedAt);

  return (
    <header className="flex flex-col gap-4 border-b border-gray-200/80 pb-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between md:pb-5">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        {editedAt && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Last saved {editedAt}</p>}
      </div>
      {onSave && (
        <div className="flex items-center gap-3">
          {notice && (
            <span className={`text-xs ${noticeError ? "text-error-600 dark:text-error-400" : "text-success-600 dark:text-success-400"}`}>
              {notice}
            </span>
          )}
          {onDiscard && (
            <Button variant="outline" onClick={onDiscard} disabled={!dirty || saving}>
              Discard
            </Button>
          )}
          <Button loading={saving} onClick={onSave} disabled={!dirty}>
            {saveLabel}
          </Button>
        </div>
      )}
    </header>
  );
}
