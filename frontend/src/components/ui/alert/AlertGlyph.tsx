/**
 * The glyph each kind of message wears, shared by `Alert` and `Notification`
 * so a warning looks the same wherever it is said. Lucide's shapes, drawn like
 * `common/icons` (24 grid, 1.75 stroke, `currentColor`).
 */

import { AlertTriangleIcon, CheckCircleIcon, CircleXIcon, InfoIcon } from "@/components/common/icons";

export type MessageTone = "success" | "error" | "warning" | "info";

export function AlertGlyph({ tone, className = "size-5" }: { tone: MessageTone; className?: string }) {
  if (tone === "success") return <CheckCircleIcon className={className} />;
  if (tone === "warning") return <AlertTriangleIcon className={className} />;
  if (tone === "error") return <CircleXIcon className={className} />;
  return <InfoIcon className={className} />;
}

/**
 * The tones' colours. A tint and a hairline in the tone's own family -- 25 and
 * 200 on light, a whisper of the 500 on dark -- with the words in ink: the
 * glyph carries the colour, the sentence stays readable.
 */
export const TONE_SURFACE: Record<MessageTone, string> = {
  success: "border-success-200 bg-success-25 dark:border-success-500/20 dark:bg-success-500/[0.06]",
  error: "border-error-200 bg-error-25 dark:border-error-500/20 dark:bg-error-500/[0.06]",
  warning: "border-warning-200 bg-warning-25 dark:border-warning-500/20 dark:bg-warning-500/[0.06]",
  info: "border-blue-light-200 bg-blue-light-25 dark:border-blue-light-500/20 dark:bg-blue-light-500/[0.06]",
};

export const TONE_GLYPH: Record<MessageTone, string> = {
  success: "text-success-600 dark:text-success-400",
  error: "text-error-600 dark:text-error-400",
  warning: "text-warning-600 dark:text-warning-400",
  info: "text-blue-light-600 dark:text-blue-light-400",
};
