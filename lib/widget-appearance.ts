import { z } from "zod";

/**
 * How the website chat looks, apart from its brand colour (that is the worker's accent colour). Chosen per worker
 * under Settings > Channels > Chat. Nothing here is free text that reaches a style sheet: every value is one of a
 * short list, or a short label shown as text.
 */
export const WIDGET_THEMES = ["light", "dark", "auto"] as const;
export const WIDGET_CORNERS = ["square", "rounded", "soft"] as const;
export const WIDGET_LAUNCHER_ICONS = ["chat", "message", "headset"] as const;
export const WIDGET_LABEL_MAX_LENGTH = 40;

const label = z
  .union([z.literal(""), z.string().trim().max(WIDGET_LABEL_MAX_LENGTH, `Keep it under ${WIDGET_LABEL_MAX_LENGTH} characters`)])
  .nullable()
  .transform((value) => (value ? value : null));

export const widgetAppearanceSchema = z.object({
  /** light by default: the chat sits on someone else's page, so it should not follow a manager's saved console theme. */
  theme: z.enum(WIDGET_THEMES),
  corners: z.enum(WIDGET_CORNERS),
  launcherIcon: z.enum(WIDGET_LAUNCHER_ICONS),
  /** null = the worker's display name. */
  panelTitle: label,
  /** null = "AI assistant". */
  panelSubtitle: label,
});

export type WidgetAppearance = z.infer<typeof widgetAppearanceSchema>;

export const DEFAULT_WIDGET_APPEARANCE: WidgetAppearance = {
  theme: "light",
  corners: "rounded",
  launcherIcon: "chat",
  panelTitle: null,
  panelSubtitle: null,
};

/** What is stored, filled out with defaults. Anything that does not validate falls back to the defaults. */
export function resolveWidgetAppearance(stored: unknown): WidgetAppearance {
  if (!stored || typeof stored !== "object") return DEFAULT_WIDGET_APPEARANCE;
  const merged = widgetAppearanceSchema.safeParse({ ...DEFAULT_WIDGET_APPEARANCE, ...(stored as Record<string, unknown>) });
  return merged.success ? merged.data : DEFAULT_WIDGET_APPEARANCE;
}
