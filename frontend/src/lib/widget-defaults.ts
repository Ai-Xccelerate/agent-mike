/**
 * What the website widget opens with when Settings > Channels > Chat leaves it
 * unset. Shared by the widget itself and the settings screen that edits it.
 */

export const DEFAULT_QUICK_ACTIONS = ["Report a problem", "Ask a question", "Check my ticket", "Request a feature"];

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
