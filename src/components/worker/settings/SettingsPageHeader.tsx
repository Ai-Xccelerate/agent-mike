"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";

function formatEditedAt(value: Date | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

type PendingNav = { type: "link"; href: string } | { type: "back" } | null;

/**
 * The title block and save flow shared by every settings screen.
 *
 * **Unsaved work cannot be lost silently — but only when the manager tries to
 * actually leave.** A dirty page does nothing extra while you're simply
 * editing or scrolling: no persistent bar, no duplicated Save button. The
 * guard only fires the moment you try to go somewhere else — an in-app nav
 * link (sidebar, settings nav, breadcrumb) or the browser's Back button — at
 * which point a modal asks Save / Discard / Stay, and the navigation that
 * triggered it is held until you answer.
 *
 * Back-button support needs a small history trick: Next's router (and the
 * browser itself) doesn't expose a way to intercept `popstate` before it
 * happens, only react to it after the entry has already changed. So while
 * dirty, a single duplicate history entry is kept on top of the real one; a
 * Back press consumes that duplicate first (harmless — same URL, nothing
 * visibly changes) and its `popstate` is what the modal is triggered by. If
 * the manager stays, the duplicate is re-armed. If they leave, the *next*
 * `history.back()` (issued once `dirty` is actually false) is a real one.
 *
 * Closing the actual tab/reloading is the one case this can't give a custom
 * dialog for — the browser owns that prompt, not the page — so it still
 * falls back to the native `beforeunload` confirmation.
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
  const router = useRouter();
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [awaitingSaveThenLeave, setAwaitingSaveThenLeave] = useState(false);
  const pendingNavRef = useRef<PendingNav>(null);
  const historyGuardArmedRef = useRef(false);
  const wasSavingRef = useRef(false);

  // Tab close / refresh / typing a new URL: the browser's own dialog, since
  // only it can hold up an actual unload.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  // In-app nav links: caught in the capture phase, before Next's own <Link>
  // onClick (bubble phase) would otherwise start the transition.
  useEffect(() => {
    if (!dirty) return;
    const linkClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.href === window.location.href) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pendingNavRef.current = { type: "link", href: link.href };
      setLeaveModalOpen(true);
    };
    document.addEventListener("click", linkClick, true);
    return () => document.removeEventListener("click", linkClick, true);
  }, [dirty]);

  // Browser Back/Forward: see the history-trick note above.
  useEffect(() => {
    if (dirty && !historyGuardArmedRef.current) {
      window.history.pushState({ settingsLeaveGuard: true }, "", window.location.href);
      historyGuardArmedRef.current = true;
    } else if (!dirty) {
      historyGuardArmedRef.current = false;
    }
  }, [dirty]);

  useEffect(() => {
    function onPopState() {
      if (!dirty) return; // real navigation was already allowed to happen
      pendingNavRef.current = { type: "back" };
      setLeaveModalOpen(true);
      // Do NOT re-arm here. This popstate already consumed the one guard
      // entry, so we're now sitting exactly where a real Back should land —
      // re-arming immediately would interpose a second duplicate, and the
      // single history.back() that "leave" issues would only consume that
      // one, landing right back on this same page instead of the real
      // previous one. Re-arming only belongs in handleStay, below.
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dirty]);

  function runPendingNav() {
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;
    if (!pending) return;
    if (pending.type === "link") {
      router.push(pending.href);
    } else {
      // dirty is false by now, so the guard's popstate handler no-ops and
      // this is a genuine back navigation.
      window.history.back();
    }
  }

  function handleStay() {
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;
    setLeaveModalOpen(false);
    if (pending?.type === "back") {
      // We're sitting on the entry the earlier popstate already consumed —
      // put a fresh guard duplicate back on top so the next Back press is
      // caught again instead of silently leaving next time.
      window.history.pushState({ settingsLeaveGuard: true }, "", window.location.href);
    }
  }

  function handleDiscardAndLeave() {
    onDiscard?.();
    setLeaveModalOpen(false);
    runPendingNav();
  }

  function handleSaveAndLeave() {
    if (!onSave) return;
    setAwaitingSaveThenLeave(true);
    onSave();
  }

  // Fires once `saving` finishes after Save-and-leave was chosen. Leaves
  // only if the save actually succeeded (dirty cleared) — a failed save
  // keeps the manager on the page with the existing error notice, rather
  // than navigating away from an edit that never persisted.
  useEffect(() => {
    if (wasSavingRef.current && !saving && awaitingSaveThenLeave) {
      setAwaitingSaveThenLeave(false);
      if (!dirty) {
        setLeaveModalOpen(false);
        runPendingNav();
      }
    }
    wasSavingRef.current = Boolean(saving);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving]);

  const editedAt = formatEditedAt(lastEditedAt);

  return (
    <>
      <header className="flex flex-col gap-4 border-b border-gray-300/70 pb-5 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between">
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
            {onDiscard && (
              <Button variant="outline" size="sm" onClick={onDiscard} disabled={!dirty || saving}>
                Discard
              </Button>
            )}
            <Button size="sm" loading={saving} onClick={onSave} disabled={!dirty}>
              {saveLabel}
            </Button>
          </div>
        )}
      </header>

      <Modal
        isOpen={leaveModalOpen}
        onClose={handleStay}
        ariaLabel="Unsaved changes"
        className="m-4 w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900"
      >
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Unsaved changes</h2>
        <p className="mt-1.5 text-sm leading-6 text-gray-500 dark:text-gray-400">
          You have changes on this page that haven&apos;t been saved yet. Save them before you leave,
          or discard them?
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button size="sm" variant="outline" onClick={handleStay} disabled={awaitingSaveThenLeave}>
            Stay
          </Button>
          {onDiscard && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDiscardAndLeave}
              disabled={awaitingSaveThenLeave}
            >
              Discard and leave
            </Button>
          )}
          {onSave && (
            <Button size="sm" loading={awaitingSaveThenLeave} onClick={handleSaveAndLeave}>
              Save and leave
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}
