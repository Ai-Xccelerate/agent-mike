/**
 * The quick actions a widget opens with when Settings > Channels > Chat has none
 * of its own. They follow what the worker can really do for this organization: a
 * button that sends "Check my ticket" is a promise, so it only appears when the
 * worker can look tickets up. One list, decided here, for the widget, the
 * Playground and the settings screen.
 */

export type HelpdeskCapabilities = {
  /** A handoff raises a ticket on a connected helpdesk. */
  raisesTickets: boolean;
  /** The worker can read this customer's tickets from a connected helpdesk. */
  looksUpTickets: boolean;
};

export const NO_HELPDESK: HelpdeskCapabilities = { raisesTickets: false, looksUpTickets: false };

export function defaultQuickActions(capabilities: HelpdeskCapabilities): string[] {
  return [
    ...(capabilities.raisesTickets ? ["Report a problem"] : []),
    "Ask a question",
    ...(capabilities.looksUpTickets ? ["Check my ticket"] : []),
    ...(capabilities.raisesTickets ? ["Request a feature"] : []),
  ];
}
