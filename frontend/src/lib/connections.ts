/**
 * Settings > Connections: Email, Apps, Tools and Connectors on one page. Each used to be its own Settings entry
 * (Tools, Integrations, Connectors); their old addresses still work and land on the right tab.
 */

export const CONNECTION_TABS = [
  { id: "email", label: "Email" },
  { id: "apps", label: "Apps" },
  { id: "tools", label: "Tools" },
  { id: "connectors", label: "Connectors" },
] as const;

export type ConnectionTab = (typeof CONNECTION_TABS)[number]["id"];

export const DEFAULT_CONNECTION_TAB: ConnectionTab = "email";

export function isConnectionTab(value: unknown): value is ConnectionTab {
  return CONNECTION_TABS.some((tab) => tab.id === value);
}

export function connectionsHref(tab: ConnectionTab): string {
  return `/settings/connections?tab=${tab}`;
}

type Query = Record<string, string | string[] | undefined>;

/**
 * Where an old Settings address goes. The query is kept (the mailbox sign-in returns with `mailbox=connected` or
 * `mailbox=error`), and a return from the mailbox always lands on Email, whatever address it came back to.
 */
export function redirectFromOldAddress(oldTab: ConnectionTab, query: Query = {}): string {
  const tab = query.mailbox !== undefined ? "email" : oldTab;
  const params = new URLSearchParams({ tab });
  for (const [key, value] of Object.entries(query)) {
    if (key === "tab" || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  }
  return `/settings/connections?${params.toString()}`;
}
