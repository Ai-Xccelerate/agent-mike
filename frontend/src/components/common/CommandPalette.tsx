"use client";

/**
 * ⌘K — go anywhere, do anything, without the mouse (LIB-PALETTE).
 *
 * The Artifacts and Persuade palette: same keys, same material, same footer --
 * a person who knows ⌘K in one AIX product knows it in every one. Its places
 * come from the navigation registry (`layout/navigation.tsx`), so a page added
 * there is found here without a second list to keep.
 *
 * Empty, it lists the page on screen's own commands (`usePageCommands`), the
 * daily places, the actions, help and appearance; typing searches every page
 * in the registry by name, section, keywords and reference ID ("AIX-311").
 * The microphone dictates the search where the browser can listen.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  FileIcon,
  HashIcon,
  KeyboardIcon,
  MicIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  RowsIcon,
  SearchIcon,
  SparklesIcon,
  SunIcon,
} from "@/components/common/icons";
import { toggleReferenceIds, useReferenceIds } from "@/components/common/ReferenceOverlayToggle";
import { useModalLayer } from "@/components/ui/dialog/stack";
import { APP } from "@/config/app";
import { useDensity, type Density } from "@/context/DensityContext";
import { useTheme } from "@/context/ThemeContext";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { allPages, isFolder, SECTIONS } from "@/layout/navigation";
import { usePageCommandList } from "@/layout/pageCommands";
import { OPEN_SHORTCUTS_EVENT } from "@/layout/shortcuts";

export interface Command {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
  /** Listed only once something is typed: the long tail of pages. */
  searchOnly?: boolean;
}

/** The event the sidebar's search button fires; the palette listens for it. */
export const OPEN_PALETTE_EVENT = "aix:open-command-palette";

/** Pages that sit in a folder: found by typing, not listed when empty. */
const FOLDER_PATHS = new Set(
  SECTIONS.flatMap((section) => section.items.filter(isFolder).flatMap((folder) => folder.items.map((link) => link.path))),
);

const DENSITIES: Array<{ value: Density; label: string }> = [
  { value: "default", label: "Roomy" },
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

export default function CommandPalette() {
  const router = useRouter();
  const { setPreference } = useTheme();
  const { setDensity } = useDensity();
  const refIds = useReferenceIds();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  // The page on screen's own commands, first.
  const pageCommands = usePageCommandList();
  const voice = useVoiceInput((text) => {
    setQuery((prev) => (prev ? `${prev} ` : "") + text);
    inputRef.current?.focus();
  });

  const close = useCallback(() => setOpen(false), []);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      router.push(path);
      setOpen(false);
    };
    const act = (fn: () => void) => () => {
      setOpen(false);
      fn();
    };

    const places: Command[] = allPages().map((page) => ({
      id: `go:${page.path}`,
      label: page.name === "Overview" ? "Workforce overview" : page.name,
      group: "Go to",
      keywords: [page.section, page.keywords, page.ref, page.path].filter(Boolean).join(" "),
      hint: page.section,
      icon: page.icon ?? <FileIcon />,
      run: go(page.path),
      searchOnly: FOLDER_PATHS.has(page.path),
    }));

    return [
      ...pageCommands.map((command) => ({ ...command, icon: <FileIcon />, run: go(command.href) })),
      ...places,
      {
        id: "do:ask",
        label: "Ask the assistant",
        group: "Actions",
        keywords: "ai sam question chat",
        icon: <SparklesIcon />,
        run: go("/assistant"),
      },
      {
        id: "do:invoice",
        label: "New invoice",
        group: "Actions",
        keywords: "create bill",
        icon: <PlusIcon />,
        run: go("/create-invoice"),
      },
      {
        id: "do:product",
        label: "Add a product",
        group: "Actions",
        keywords: "new catalog",
        icon: <PlusIcon />,
        run: go("/add-product"),
      },
      {
        id: "help:shortcuts",
        label: "Keyboard shortcuts",
        group: "Help",
        keywords: "help keys shortcuts",
        hint: "?",
        icon: <KeyboardIcon />,
        run: act(() => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))),
      },
      {
        id: "help:refids",
        label: refIds ? "Hide reference IDs" : "Show reference IDs",
        group: "Help",
        keywords: "aix id overlay blocks reference manifest",
        hint: "\\",
        icon: <HashIcon />,
        run: act(toggleReferenceIds),
      },
      { id: "theme:light", label: "Light theme", group: "Appearance", keywords: "theme day mode", icon: <SunIcon />, run: act(() => setPreference("light")) },
      { id: "theme:dark", label: "Dark theme", group: "Appearance", keywords: "theme night mode", icon: <MoonIcon />, run: act(() => setPreference("dark")) },
      { id: "theme:system", label: "Use system theme", group: "Appearance", keywords: "theme auto os mode", icon: <MonitorIcon />, run: act(() => setPreference("system")) },
      ...DENSITIES.map((density) => ({
        id: `density:${density.value}`,
        label: `${density.label} density`,
        group: "Appearance",
        keywords: "density spacing size compact comfortable roomy",
        icon: <RowsIcon />,
        run: act(() => setDensity(density.value)),
      })),
    ];
  }, [router, setPreference, setDensity, pageCommands, refIds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.filter((command) => !command.searchOnly);
    const matches = commands.filter(
      (command) =>
        command.label.toLowerCase().includes(q) ||
        command.group.toLowerCase().includes(q) ||
        (command.keywords ?? "").toLowerCase().includes(q),
    );
    // A name that starts with what was typed first, then one that contains it,
    // then the rest (a keyword). Enter on "settings" is the Settings page, not
    // the first command that mentions settings in a hint.
    const rank = (command: Command) => {
      const label = command.label.toLowerCase();
      return label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2;
    };
    return matches
      .map((command, order) => ({ command, order, rank: rank(command) }))
      .sort((a, b) => a.rank - b.rank || a.order - b.order)
      .map((entry) => entry.command);
  }, [commands, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ command: Command; index: number }>>();
    results.forEach((command, index) => {
      const bucket = map.get(command.group) ?? [];
      bucket.push({ command, index });
      map.set(command.group, bucket);
    });
    return Array.from(map.entries());
  }, [results]);

  // ⌘K / Ctrl+K anywhere, and the sidebar button's event.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  /*
   * Reset on open, and drop the highlight back to the first row when the query
   * changes -- both derived in the render pass rather than in effects, so the
   * palette never paints one frame with the previous search in it.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
    }
  }
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setActive(0);
  }

  /*
   * On the modal stack while open (`stack.ts`): opened over a dialog, the
   * palette holds focus and the dialog's trap waits underneath.
   */
  useModalLayer(open);

  // Focus and scroll-lock are the external systems; those stay in an effect.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previous;
      // Back to what opened it, as the app's dialogs do; not when a choice has
      // already moved focus on.
      const focus = document.activeElement;
      if (opener?.isConnected && (focus === null || focus === document.body)) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${active}"]`);
    row?.scrollIntoView({ block: "nearest" });
    // Tabbed onto a row, the arrows take focus along with the highlight, so
    // the ring and the highlight never mark two different rows.
    if (row && listRef.current?.contains(document.activeElement)) row.focus();
  }, [active, open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      results[active]?.run();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      // Round and round the palette, never out of it into a page nobody can see.
      const stops = [
        inputRef.current,
        ...Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []),
      ].filter((stop): stop is HTMLElement => Boolean(stop));
      const at = stops.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && at <= 0) {
        event.preventDefault();
        stops[stops.length - 1]?.focus();
      } else if (!event.shiftKey && at === stops.length - 1) {
        event.preventDefault();
        stops[0]?.focus();
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-palette flex items-start justify-center px-4 pt-[12vh]">
      <div className="animate-surface-in fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={close} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="glass-popover animate-rise relative flex max-h-[62vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-gray-200 shadow-theme-lg dark:border-gray-800"
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-100 px-4 dark:border-gray-800">
          <SearchIcon className="size-5 text-gray-500 dark:text-gray-400" />
          {/* A combobox over a listbox, so a screen reader hears the row the
              arrows reach while focus stays in the field. */}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={voice.listening ? "Listening…" : "Find a page or an action…"}
            aria-label="Search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            className="h-full w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-500 focus:outline-none dark:text-white/90 dark:placeholder:text-gray-400"
          />
          {voice.supported ? (
            <button
              type="button"
              onClick={voice.toggle}
              aria-label={voice.listening ? "Stop voice search" : "Search by voice"}
              aria-pressed={voice.listening}
              className={`focus-ring flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ease-out ${
                voice.listening
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              }`}
            >
              <MicIcon className={`size-4 ${voice.listening ? "animate-pulse-dot" : ""}`} />
            </button>
          ) : null}
          {/* Hidden on a phone by its wrapper: `.kbd`'s inline-flex would win
              over `hidden` on the same element. */}
          <span className="hidden sm:inline-flex">
            <span className="kbd">esc</span>
          </span>
        </div>

        <div ref={listRef} className="custom-scrollbar flex-1 overflow-y-auto overscroll-contain py-2">
          {results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">Nothing matches &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Try a page name, like &ldquo;invoices&rdquo;, or a reference ID, like &ldquo;AIX-311&rdquo;.
              </p>
            </div>
          ) : null}
          {/* Always there, empty or not, because the field names it. */}
          <div id={listId} role="listbox" aria-label="Results">
            {grouped.map(([group, items], groupIndex) => (
              <div key={group} role="group" aria-labelledby={`${listId}-group-${groupIndex}`} className={groupIndex > 0 ? "mt-2" : ""}>
                <p
                  id={`${listId}-group-${groupIndex}`}
                  role="presentation"
                  className="px-4 py-1.5 text-theme-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {group}
                </p>
                {items.map(({ command, index }) => {
                  const isActive = index === active;
                  return (
                    <button
                      key={command.id}
                      id={`${listId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      data-cmd-index={index}
                      onMouseMove={() => setActive(index)}
                      // Its highlight is its focus ring: focus moves the highlight.
                      onFocus={() => setActive(index)}
                      onClick={() => command.run()}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-100 ${
                        isActive ? "bg-brand-50 dark:bg-brand-500/[0.12]" : "bg-transparent"
                      }`}
                    >
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg [&>svg]:size-4 ${
                          isActive
                            ? "bg-brand-700 text-white dark:bg-brand-500"
                            : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                        }`}
                      >
                        {command.icon}
                      </span>
                      <span
                        title={command.label}
                        className={`flex-1 truncate text-sm ${
                          isActive ? "font-semibold text-brand-ink dark:text-brand-400" : "font-medium text-gray-800 dark:text-white/90"
                        }`}
                      >
                        {command.label}
                      </span>
                      {command.hint ? (
                        <span className="hidden shrink-0 text-xs text-gray-500 sm:inline dark:text-gray-400">{command.hint}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-2.5 dark:border-gray-800 dark:bg-white/[0.03]">
          {/* Keys a phone does not have, so a phone is not told about them. */}
          <div className="flex items-center gap-3 text-xs text-gray-500 max-sm:invisible dark:text-gray-400">
            <span className="flex items-center gap-1">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> move
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">↵</span> open
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{APP.name}</span>
        </div>
      </div>
    </div>
  );
}
