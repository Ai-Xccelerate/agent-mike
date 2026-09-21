/**
 * Shared surface and control classes for every Settings screen.
 *
 * These exist so the screens cannot drift apart. Each page used to hand-roll
 * its own heading, hint and field markup, and they had already diverged —
 * different sizes for the same thing on adjacent pages.
 *
 * Two rules from AIX-DESIGN-SYSTEM.md that these encode, because both were
 * being broken:
 *
 *   Shadows are for the primary CTA only. Inputs carried `shadow-theme-xs`,
 *   which put a drop shadow on every field on every settings screen. Fields
 *   sit on the surface via border and focus ring, nothing else.
 *
 *   Cards never lift. Hover is a border shift — no shadow, no scale.
 */

/** Text input, select, and anything else a single line tall. */
export const fieldClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500";

/** Auto-grows to fit its content (see `AutoGrowTextarea`) — never a manual resize handle. */
export const textareaClass =
  "w-full resize-none rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm leading-6 text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500";

/** The `{used}/{max}` counter under a length-limited field. */
export const counterClass = "mt-1.5 block text-xs font-normal text-gray-500 dark:text-gray-400";

/**
 * A settings card. Opaque and flat — glass is chrome-only, and content cards
 * stay on the surface. Hover shifts the border rather than lifting.
 *
 * Light-mode border is gray-300 at reduced opacity — a step above plain
 * gray-200 (which read as barely-there against the ambient backdrop) without
 * going as dark as gray-300 at full strength.
 */
export const cardClass =
  "rounded-2xl border border-gray-300/70 bg-white p-5 transition-colors hover:border-gray-400/80 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700 md:p-6";

/** A card that holds no interactive content, so it should not react to hover. */
export const staticCardClass =
  "rounded-2xl border border-gray-300/70 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6";

/** A nested panel inside a card — one integration, one row, one sub-form. */
export const panelClass =
  "rounded-xl border border-gray-300/70 p-4 transition-colors hover:border-gray-400/80 dark:border-gray-800 dark:hover:border-gray-700";

/** Section heading inside a card. Never the display face — that is for page titles. */
export const sectionTitleClass =
  "text-base font-semibold tracking-tight text-gray-800 dark:text-white/90";

/** The sentence under a heading that says what the section is for. */
export const sectionHintClass = "mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400";

/** Field label. */
export const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

/** The small print under a field. Never standalone gray-400 on light — it fails contrast. */
export const hintClass = "mt-1.5 block text-xs font-normal leading-5 text-gray-500 dark:text-gray-400";

/** Dividing rule between rows inside a card. */
export const dividerClass = "divide-y divide-gray-100 dark:divide-gray-800";

/**
 * What an internal tool says when the server holds no credentials for it.
 *
 * The API reports exactly which environment variables are missing, which is
 * the right answer for whoever deploys the service and the wrong one here: a
 * manager cannot act on a variable name, and printing it leaks the server's
 * configuration into a product surface. The detail stays in the API response
 * for support and logs — the screen just says who can fix it.
 */
export const NOT_CONNECTED_NOTE =
  "Not connected yet. An administrator sets this up on the API service.";
