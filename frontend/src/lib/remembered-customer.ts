/**
 * The widget remembers a customer whose email was checked with a code, on their own device, so the next visit
 * does not ask for another code. The token is signed by the server; this only keeps and clears it.
 */
export type RememberedCustomer = { token: string; name?: string | null; email?: string };

const key = (siteToken: string | undefined) => `worker.widget.remember.v1.${(siteToken || "").trim()}`;

export function readRemembered(siteToken: string | undefined): RememberedCustomer | null {
  try {
    const raw = localStorage.getItem(key(siteToken));
    const parsed = raw ? (JSON.parse(raw) as RememberedCustomer) : null;
    return parsed && typeof parsed.token === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRemembered(siteToken: string | undefined, customer: RememberedCustomer): void {
  try {
    localStorage.setItem(key(siteToken), JSON.stringify(customer));
  } catch {
    // Private windows and blocked storage: the customer is simply asked again next time.
  }
}

export function forgetRemembered(siteToken: string | undefined): void {
  try {
    localStorage.removeItem(key(siteToken));
  } catch {
    // Nothing to clear.
  }
}
