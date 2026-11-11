/**
 * How the customer chat looks on someone else's site: the worker's brand colour plus a few choices. Pure helpers, with
 * no imports, so they can be tested without a browser. The API side is lib/widget-appearance.ts in the repo root.
 */

export type WidgetTheme = "light" | "dark" | "auto";
export type WidgetCorners = "square" | "rounded" | "soft";
export type WidgetLauncherIcon = "chat" | "message" | "headset";

export type WidgetAppearance = {
  theme: WidgetTheme;
  corners: WidgetCorners;
  launcherIcon: WidgetLauncherIcon;
  panelTitle: string | null;
  panelSubtitle: string | null;
};

export const WIDGET_LABEL_MAX_LENGTH = 40;

export const DEFAULT_WIDGET_APPEARANCE: WidgetAppearance = {
  theme: "light",
  corners: "rounded",
  launcherIcon: "chat",
  panelTitle: null,
  panelSubtitle: null,
};

const THEMES: readonly string[] = ["light", "dark", "auto"];
const CORNERS: readonly string[] = ["square", "rounded", "soft"];
const ICONS: readonly string[] = ["chat", "message", "headset"];

const label = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, WIDGET_LABEL_MAX_LENGTH) : null;

/** What the API sent, filled out with defaults. Anything unexpected falls back to the default. */
export function resolveWidgetAppearance(raw: unknown): WidgetAppearance {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    theme: THEMES.includes(value.theme as string) ? (value.theme as WidgetTheme) : DEFAULT_WIDGET_APPEARANCE.theme,
    corners: CORNERS.includes(value.corners as string) ? (value.corners as WidgetCorners) : DEFAULT_WIDGET_APPEARANCE.corners,
    launcherIcon: ICONS.includes(value.launcherIcon as string) ? (value.launcherIcon as WidgetLauncherIcon) : DEFAULT_WIDGET_APPEARANCE.launcherIcon,
    panelTitle: label(value.panelTitle),
    panelSubtitle: label(value.panelSubtitle),
  };
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const mix = (from: Rgb, to: Rgb, amount: number): Rgb => from.map((v, i) => Math.round(v + (to[i] - v) * amount)) as Rgb;

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/**
 * The 25 to 950 brand scale the chat's styles use (`--color-brand-*`), built from one colour. 500 is the colour
 * itself; lighter steps mix toward white, darker steps toward black. Null for anything that is not a #RRGGBB colour.
 */
export function brandScale(hex: string): Record<string, string> | null {
  const base = hexToRgb(hex);
  if (!base) return null;
  const steps: [string, Rgb][] = [
    ["25", mix(base, WHITE, 0.96)],
    ["50", mix(base, WHITE, 0.92)],
    ["100", mix(base, WHITE, 0.84)],
    ["200", mix(base, WHITE, 0.68)],
    ["300", mix(base, WHITE, 0.48)],
    ["400", mix(base, WHITE, 0.24)],
    ["500", base],
    ["600", mix(base, BLACK, 0.12)],
    ["700", mix(base, BLACK, 0.28)],
    ["800", mix(base, BLACK, 0.44)],
    ["900", mix(base, BLACK, 0.58)],
    ["950", mix(base, BLACK, 0.78)],
  ];
  return Object.fromEntries(steps.map(([step, rgb]) => [`--color-brand-${step}`, toHex(rgb)]));
}

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast of white text on this colour, or null if it is not a colour. 3 is the floor for buttons and large text. */
export function contrastWithWhite(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return Math.round((1.05 / (luminance(rgb) + 0.05)) * 100) / 100;
}

export const CONTRAST_FLOOR = 3;

/** The app's radius scale, retuned per choice. "rounded" is the app's own scale, so it sets nothing. */
const CORNER_VARS: Record<WidgetCorners, Record<string, string>> = {
  square: { "--radius-sm": "0px", "--radius-md": "0px", "--radius-lg": "0px", "--radius-xl": "0px", "--radius-2xl": "0px", "--radius-3xl": "0px" },
  rounded: {},
  soft: { "--radius-sm": "6px", "--radius-md": "10px", "--radius-lg": "14px", "--radius-xl": "18px", "--radius-2xl": "22px", "--radius-3xl": "26px" },
};

export type WidgetLook = { accentColor: string; appearance: WidgetAppearance };

/**
 * Puts the look on the page: the brand scale, the corner radii and the light or dark theme, on the document root.
 * Returns a function that takes them off again.
 */
export function applyWidgetLook(root: HTMLElement, look: WidgetLook, prefersDark: boolean): () => void {
  const vars = { ...(brandScale(look.accentColor) ?? {}), ...CORNER_VARS[look.appearance.corners] };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);

  const wasDark = root.classList.contains("dark");
  const theme = look.appearance.theme;
  root.classList.toggle("dark", theme === "dark" || (theme === "auto" && prefersDark));

  return () => {
    for (const name of Object.keys(vars)) root.style.removeProperty(name);
    root.classList.toggle("dark", wasDark);
  };
}
