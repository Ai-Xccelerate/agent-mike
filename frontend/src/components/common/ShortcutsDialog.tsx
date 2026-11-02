"use client";

/**
 * Help and shortcuts: every key the product answers to, on one sheet.
 *
 * Opened from the sidebar's Help row, the palette, or with `?`. The Artifacts
 * and Persuade sheet, listing only the keys this app has: a sheet promising
 * keys that do nothing is worse than no sheet. Add a row when a key exists.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import { KeyboardIcon } from "@/components/common/icons";
import { Modal } from "@/components/ui/modal";
import { GO_TO } from "@/hooks/useGlobalShortcuts";
import { usePageShortcutList, type PageShortcut } from "@/layout/pageShortcuts";
import { modifierLabel, OPEN_SHORTCUTS_EVENT } from "@/layout/shortcuts";

const noop = () => () => {};

type Keys = string[];

function groupsFor(mod: string, page: readonly PageShortcut[]): Array<{ title: string; rows: Array<[string, Keys]> }> {
  return [
    // The page's own keys first: they are the ones someone opening this
    // sheet from a list is most likely looking for.
    ...(page.length ? [{ title: "On this page", rows: page.map((entry): [string, Keys] => [entry.label, entry.keys]) }] : []),
    {
      title: "Anywhere",
      rows: [
        ["Search and commands", [mod, "K"]],
        ["Collapse or open the sidebar", ["["]],
        ["Search this list", ["/"]],
        ["Show reference IDs", ["\\"]],
        ["This sheet", ["?"]],
      ],
    },
    {
      title: "Go to",
      rows: GO_TO.map((place): [string, Keys] => [place.label, ["g", place.key]]),
    },
    {
      title: "In a dialog or menu",
      rows: [
        ["Close it", ["Esc"]],
        ["Move between choices", ["↑", "↓"]],
      ],
    },
  ];
}

export default function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const mod = useSyncExternalStore(noop, modifierLabel, () => "Ctrl");
  const page = usePageShortcutList();
  const groups = groupsFor(mod, page);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, show);
    return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, show);
  }, []);

  return (
    <Modal
      isOpen={open}
      onClose={() => setOpen(false)}
      ariaLabel="Keyboard shortcuts"
      className="max-w-2xl p-6 sm:p-7"
    >
      <div className="flex items-center gap-3 pr-10">
        <span className="surface-2 flex size-10 items-center justify-center text-gray-600 dark:text-gray-300">
          <KeyboardIcon className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
            Help and shortcuts
          </h2>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Single keys work anywhere except while you are typing.
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-theme-xs font-medium text-gray-500 dark:text-gray-400">
              {group.title}
            </h3>
            <dl className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {group.rows.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-theme-sm text-gray-700 dark:text-gray-300">{label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {keys.map((key) => (
                      <kbd key={key} className="kbd">
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
