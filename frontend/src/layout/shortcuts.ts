/**
 * Keyboard shortcuts shared by the frame: the events that open things, and the
 * one rule every single-key shortcut obeys.
 */

/** Fired to open the keyboard-shortcuts sheet (the sidebar's Help, or `?`). */
export const OPEN_SHORTCUTS_EVENT = "aix:open-shortcuts";

/** Fired by `/` for a page that has a search box of its own to focus. */
export const FOCUS_SEARCH_EVENT = "aix:focus-search";

/**
 * Whether a keystroke belongs to what the person is typing into.
 *
 * A single-letter shortcut that fired inside a text box would eat the letter --
 * "c" in a title would navigate away mid-word -- so these never run while focus
 * is in a field, a contenteditable region or an open IME composition, or when a
 * modifier is held (Ctrl+C is copy, not "create").
 */
export function isTypingTarget(event: KeyboardEvent): boolean {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere, for the keycaps we draw. */
export function modifierLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
}
