"use client";

/**
 * You, at the foot of the sidebar: who is signed in, and the settings that are
 * about you rather than the workspace -- theme, density, account, sign out.
 *
 * It replaces three header controls (a theme button, a density button and the
 * user menu). Two of those were icon buttons drawn with three horizontal lines,
 * beside the sidebar toggle's own three lines, so the header showed the same
 * glyph twice for two different things.
 *
 * The panel is a small non-modal dialog, not a `menu`. It holds two radio
 * groups as well as two commands, and a menu may only contain menu items -- a
 * screen reader in a menu reads nothing else, and axe calls the radio groups
 * inside one a critical error. As a dialog, Tab walks it, the arrows move
 * within each radio group the way native radios do, and Escape closes it and
 * puts you back on the button.
 */

import { useClerk, useOrganization, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SlidersIcon,
  SunIcon,
} from "@/components/common/icons";
import { APP, initialsOf, type AppUser } from "@/config/app";
import { useDensity, type Density } from "@/context/DensityContext";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";

const THEMES: Array<{ value: ThemePreference; label: string; icon: React.ReactNode }> = [
  { value: "light", label: "Light", icon: <SunIcon className="size-4" /> },
  { value: "dark", label: "Dark", icon: <MoonIcon className="size-4" /> },
  { value: "system", label: "System", icon: <MonitorIcon className="size-4" /> },
];

const DENSITIES: Array<{ value: Density; label: string }> = [
  { value: "default", label: "Roomy" },
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

/**
 * The person signed in. The template's is `DEMO_USER`; a product reads Clerk
 * here (`useUser()` for the name, email and picture, `useOrganization()` for
 * the workspace and role) and returns `null` while it loads, which draws the
 * placeholder row below.
 */
function useAccount(): AppUser | null {
  const { user, isLoaded } = useUser();
  const { membership } = useOrganization();
  if (!isLoaded || !user) return null;
  const role = membership?.role;
  return {
    name: user.fullName || user.primaryEmailAddress?.emailAddress || "Account",
    email: user.primaryEmailAddress?.emailAddress ?? "",
    // "org:admin" -> "Admin": a word, not a key.
    role: role ? role.replace(/^org:/, "").replace(/^./, (c) => c.toUpperCase()) : null,
    imageUrl: user.imageUrl || null,
  };
}

/**
 * A choice of one value from a few, drawn as a segmented row.
 *
 * Equal thirds of the panel, with a gap between them and room inside each: the
 * segments used to be as wide as their words and no wider, so "Comfortable" and
 * "Compact" ran into each other and into the panel's edge. The panel is sized
 * so the longest word ("Comfortable") still has air either side. The word is
 * centred, so a segment's own padding is only the least air it keeps: at 4px a
 * side it still fits on a 320px phone, where the panel is 296px wide (6px cut
 * its last letter).
 *
 * A radio group: arrows move between segments and choose as they go, and only
 * the chosen segment is in the tab order.
 */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  onChange: (next: T) => void;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const move = (next: number) => {
    const at = (next + options.length) % options.length;
    onChange(options[at].value);
    refs.current[at]?.focus();
  };

  return (
    <div>
      <p id={id} className="pb-2 text-theme-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={id}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            move(index + 1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            move(index - 1);
          } else if (event.key === "Home") {
            event.preventDefault();
            move(0);
          } else if (event.key === "End") {
            event.preventDefault();
            move(options.length - 1);
          }
        }}
        className="grid grid-cols-3 gap-1 rounded-[10px] bg-gray-900/[0.05] p-1 dark:bg-white/[0.06]"
      >
        {options.map((option, at) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                refs.current[at] = node;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={`focus-ring flex h-8 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-1 text-theme-xs font-medium transition-colors duration-150 ease-out max-sm:h-11 ${
                on
                  ? "bg-white text-gray-900 shadow-theme-xs dark:bg-white/[0.14] dark:text-white"
                  : "text-gray-600 hover:bg-white/60 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
              }`}
            >
              {option.icon ? (
                <span
                  className={`shrink-0 ${on ? "text-gray-700 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"}`}
                >
                  {option.icon}
                </span>
              ) : null}
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AccountMenu({
  compact = false,
  onGo,
}: {
  compact?: boolean;
  /** A link was chosen: on a phone, the drawer gets out of the way. */
  onGo?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const user = useAccount();
  const { signOut } = useClerk();
  const { organization } = useOrganization();
  const { preference, setPreference } = useTheme();
  const { density, setDensity } = useDensity();

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Into the panel, on the theme that is chosen: from the keyboard the next
    // thing anyone wants is a setting, and a mouse never sees the move.
    panel.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!user) {
    // A placeholder the size of the row, so the sidebar does not jump when
    // the account arrives. Not an empty circle with nothing in it: the row says what
    // it is waiting for.
    return (
      <div className="flex items-center gap-2.5 px-2 py-2" aria-hidden="true">
        <span className="size-8 shrink-0 animate-pulse rounded-full bg-gray-200 dark:bg-white/[0.08]" />
        {compact ? null : (
          <span className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-white/[0.08]" />
        )}
      </div>
    );
  }

  const name = user.name || user.email || "Account";
  const initials = initialsOf(name);
  const email = user.email || null;
  const role = user.role;
  const workspace = organization?.name ?? APP.workspace;

  const item =
    "focus-ring flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-theme-sm font-medium text-gray-700 transition-colors duration-150 ease-out hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06] max-sm:h-11";

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          // Kept here: the library's own Escape clears its selection.
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
      onBlur={(event) => {
        // Tabbing out of the panel closes it, as leaving any popover does. A
        // null target is the window losing focus, which leaves it as it was.
        const next = event.relatedTarget as Node | null;
        if (open && next && !root.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={compact ? `Account: ${name}` : undefined}
        className={`focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 ease-out hover:bg-gray-900/[0.04] dark:hover:bg-white/[0.04] ${
          open ? "bg-gray-900/[0.04] dark:bg-white/[0.04]" : ""
        } ${compact ? "justify-center" : ""}`}
      >
        {user.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.imageUrl}
            alt=""
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-theme-xs font-semibold text-white"
          >
            {initials}
          </span>
        )}
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-theme-sm font-semibold text-gray-900 dark:text-white">
                {name}
              </span>
              {/* gray-600: on the row's hover tint gray-500 is 4.48:1, just
                  under AA for 12px text. */}
              <span className="block truncate text-theme-xs text-gray-600 dark:text-gray-400">
                {role ?? email ?? "Signed in"}
              </span>
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-gray-500 dark:text-gray-400" />
          </>
        )}
      </button>

      {open ? (
        /* Wider than the sidebar and anchored to its left edge, so it reads the
           same expanded, collapsed to the rail, and in the phone's drawer: the
           sidebar's 224px inside its padding is narrower than three equal
           segments with room in them. */
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label="Account"
          // Focusable itself, so a click on its text keeps focus inside it and
          // the blur handler above does not read that as leaving.
          tabIndex={-1}
          className="glass-popover absolute bottom-full left-0 z-40 mb-2 w-[19.5rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-gray-200 shadow-theme-lg outline-none dark:border-gray-800"
        >
          <div className="px-4 pb-3 pt-3.5">
            <p
              title={name}
              className="truncate text-theme-sm font-semibold text-gray-900 dark:text-white"
            >
              {name}
            </p>
            {email && email !== name ? (
              <p
                title={email}
                className="mt-0.5 truncate text-theme-xs text-gray-600 dark:text-gray-400"
              >
                {email}
              </p>
            ) : null}
            {workspace || role ? (
              /* The role is a word of its own rather than the tail of the
                 workspace's name, so a long name truncates and the role stays. */
              <p className="mt-2 flex min-w-0 items-center gap-2 text-theme-xs text-gray-600 dark:text-gray-400">
                {workspace ? (
                  <span title={workspace} className="min-w-0 truncate">
                    {workspace}
                  </span>
                ) : null}
                {role ? (
                  <span className="shrink-0 rounded-md bg-gray-900/[0.05] px-1.5 py-px text-[11px] font-medium leading-4 text-gray-700 dark:bg-white/[0.08] dark:text-gray-300">
                    {role}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="space-y-3.5 border-t border-gray-200 px-4 py-3.5 dark:border-white/[0.06]">
            <Choice label="Theme" value={preference} options={THEMES} onChange={setPreference} />
            <Choice label="Density" value={density} options={DENSITIES} onChange={setDensity} />
          </div>
          <div className="flex flex-col gap-0.5 border-t border-gray-200 p-1.5 dark:border-white/[0.06]">
            <Link
              href="/settings"
              onClick={() => {
                setOpen(false);
                onGo?.();
              }}
              className={item}
            >
              <SlidersIcon className="size-4 shrink-0 text-gray-500 dark:text-gray-400" />
              <span className="flex-1">Settings</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className={`group ${item} hover:text-error-700 dark:hover:text-error-400`}
            >
              <LogOutIcon className="size-4 shrink-0 text-gray-500 group-hover:text-error-700 dark:text-gray-400 dark:group-hover:text-error-400" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
