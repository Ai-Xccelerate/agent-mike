/**
 * What the website widget opens with when Settings > Channels > Chat leaves it
 * unset. Shared by the widget itself and the settings screen that edits it.
 */

/**
 * Only used when the API did not say what this worker's built-in quick actions
 * are (an older API). The real list comes from the server as `defaultQuickActions`
 * and follows what the worker can do: "Check my ticket" only with a helpdesk.
 */
const FALLBACK_QUICK_ACTIONS = ["Ask a question"];

/** The quick actions to show: the worker's own, else the built-in ones for what it can do. */
export function quickActionsFor(profile: { quickActions?: string[] | null; defaultQuickActions?: string[] } | null | undefined): string[] {
  return profile?.quickActions ?? profile?.defaultQuickActions ?? FALLBACK_QUICK_ACTIONS;
}

export const WELCOME_MESSAGE_MAX_LENGTH = 300;
export const QUICK_ACTION_MAX_LENGTH = 40;
export const QUICK_ACTIONS_MAX = 6;

export function defaultWelcomeMessage(name: string): string {
  return `Hi! I'm ${name}. How can I help today?`;
}

/** The greeting, with "{name}" replaced by the worker's customer-facing name. */
export function welcomeText(custom: string | null | undefined, name: string): string {
  const text = custom?.trim();
  return text ? text.replace(/\{name\}/gi, name) : defaultWelcomeMessage(name);
}
