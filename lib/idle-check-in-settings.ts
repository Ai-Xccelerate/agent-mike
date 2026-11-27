import { z } from "zod";

/**
 * Settings > Channels > Website chat: when a visitor goes quiet after the worker's reply, the worker asks whether
 * they still need help, and closes the chat if they still say nothing. Stored on the worker profile's channels_config
 * as `idleCheckIn`; absent means off, so no widget changes until a manager turns it on.
 */
export type IdleCheckInSettings = { enabled: boolean; nudgeAfterSeconds: number; closeAfterSeconds: number };

export const IDLE_CHECK_IN_DEFAULTS: IdleCheckInSettings = { enabled: false, nudgeAfterSeconds: 120, closeAfterSeconds: 120 };

/** At least 30 seconds (anything shorter interrupts someone reading), at most a day. */
const seconds = z.number().int().min(30).max(86_400);

export const idleCheckInSchema = z.object({
  enabled: z.boolean(),
  nudgeAfterSeconds: seconds,
  closeAfterSeconds: seconds,
});

/** The stored setting with the defaults filled in. Anything malformed reads as off. */
export function readIdleCheckIn(channelsConfig: unknown): IdleCheckInSettings {
  const raw = channelsConfig && typeof channelsConfig === "object" ? (channelsConfig as { idleCheckIn?: unknown }).idleCheckIn : undefined;
  if (!raw || typeof raw !== "object") return IDLE_CHECK_IN_DEFAULTS;
  const parsed = idleCheckInSchema.partial().safeParse(raw);
  if (!parsed.success) return IDLE_CHECK_IN_DEFAULTS;
  return { ...IDLE_CHECK_IN_DEFAULTS, ...parsed.data };
}

/** What the worker says when the visitor has gone quiet. */
export const IDLE_NUDGE_TEXT = "Are you still there? Is there anything else I can help with?";
/** What the worker says when it closes the chat after no reply. */
export const IDLE_CLOSE_TEXT = "I haven't heard back, so I'll close this chat for now. If you need anything else, just send a new message.";
