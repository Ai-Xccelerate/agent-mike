import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Nylas — the worker's own mailbox and calendar.
 *
 * This is not a delegated business-system connection like the CRM. Nylas is
 * the agent's *identity*: the address it sends from, the calendar it books
 * into. One worker per org (`worker_profiles_org_unique`) means one identity,
 * so one grant per org.
 *
 * ── The model ────────────────────────────────────────────────────────────────
 *
 *   Application  NYLAS_CLIENT_ID + NYLAS_API_KEY. One per fleet, shared by
 *                every agent built on this skeleton.
 *   Connector    Per-provider credentials (Google, Microsoft, IMAP), configured
 *                in the Nylas dashboard. A grant cannot exist without one.
 *   Grant        One connected mailbox. `grant_id` is the handle, and every
 *                data call carries it in the path.
 *
 * Note that the API key doubles as the OAuth `client_secret`. It is a
 * server-only secret: never returned from a route, never logged, never shipped
 * to a browser.
 *
 * ── Why hosted OAuth ─────────────────────────────────────────────────────────
 *
 * `access_type=online` means Nylas keeps the refresh token and re-mints access
 * tokens itself. We therefore store no OAuth tokens at all — only the grant id.
 * That is the difference between holding a credential we would have to rotate
 * and holding a foreign key we can revoke.
 *
 * ── Region ───────────────────────────────────────────────────────────────────
 *
 * US and EU are separate data residencies, not load-balanced mirrors. A grant
 * created in one does not exist in the other, so changing `NYLAS_API_URI` after
 * mailboxes are connected orphans every one of them.
 */

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_API_URI = "https://api.us.nylas.com";

/** Minimum a worker needs to read its mail, reply, and see its calendar. */
export const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface NylasGrant {
  grantId: string;
  email: string;
  provider: string;
  /** "valid" once Nylas has confirmed it; anything else means re-auth. */
  status: string;
}

export interface NylasMessageSummary {
  id: string;
  subject: string;
  from: string;
  date: string | null;
  unread: boolean;
}

export interface NylasEventSummary {
  id: string;
  title: string;
  when: string | null;
}

/** Distinguishes "Nylas said no" from "Nylas was unreachable". */
export class NylasError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind:
      | "unconfigured"
      | "auth"
      | "grant_invalid"
      | "forbidden"
      | "not_allowed"
      | "protocol"
      | "http"
      | "network"
      | "timeout",
  ) {
    super(message);
    this.name = "NylasError";
  }
}

export function nylasApiUri(): string {
  return (process.env.NYLAS_API_URI || DEFAULT_API_URI).trim().replace(/\/+$/, "");
}

export function nylasClientId(): string {
  return (process.env.NYLAS_CLIENT_ID || "").trim();
}

function nylasApiKey(): string {
  return (process.env.NYLAS_API_KEY || "").trim();
}

/** Which residency this deployment talks to — shown, never guessed at. */
export function nylasRegion(): "us" | "eu" | "custom" {
  const uri = nylasApiUri();
  if (uri.includes("api.us.nylas.com")) return "us";
  if (uri.includes("api.eu.nylas.com")) return "eu";
  return "custom";
}

/**
 * True when the server holds both halves of the application credential.
 * Without them the integration is unavailable rather than merely disconnected,
 * and fails closed: nothing is ever sent to Nylas.
 */
export function isNylasConfigured(): boolean {
  return Boolean(nylasApiKey() && nylasClientId());
}

/**
 * Where Nylas sends the manager back after they authorise.
 *
 * Lives here rather than in the route because both the connect and callback
 * routes need the identical value — the token exchange fails if the
 * `redirect_uri` differs by so much as a trailing slash from the one the auth
 * request used. A Next route file may only export handlers, so this could not
 * be shared from there anyway.
 */
export function callbackUri(origin: string): string {
  const configured = (process.env.NYLAS_CALLBACK_URI || "").trim();
  return configured || `${origin.replace(/\/+$/, "")}/api/v1/mailbox/callback`;
}

// ── OAuth state ──────────────────────────────────────────────────────────────

/**
 * The `state` round-tripped through the provider.
 *
 * Signed rather than stored: the callback is a separate request with no session
 * to look anything up in, and an unsigned state would let anyone hand the
 * callback an arbitrary org id and bind a mailbox they control to someone
 * else's worker. Carries an expiry so a captured link cannot be replayed later.
 */
const STATE_TTL_MS = 15 * 60 * 1000;

function stateSecret(): string {
  // The API key is already the OAuth client secret, so it is the one value
  // guaranteed to be present wherever a callback can legitimately be handled.
  return nylasApiKey() || "nylas-state";
}

export interface OAuthState {
  orgId: string;
  /** Who started the flow. The callback has no session, so it rides along. */
  userId: string | null;
}

/**
 * JSON rather than a delimited string: org and user ids come from whatever
 * identity adapter is installed, and a Clerk id containing the delimiter would
 * silently split into the wrong fields.
 */
export function signState(orgId: string, userId: string | null = null, now = Date.now()): string {
  const payload = JSON.stringify({
    o: orgId,
    u: userId,
    e: now + STATE_TTL_MS,
    n: randomBytes(8).toString("hex"),
  });
  const encoded = Buffer.from(payload).toString("base64url");
  const mac = createHmac("sha256", stateSecret()).update(encoded).digest("hex");
  return `${encoded}.${mac}`;
}

/** Returns who the state was issued for, or null if it does not verify. */
export function verifyState(state: string, now = Date.now()): OAuthState | null {
  const [encoded, mac] = (state || "").split(".");
  if (!encoded || !mac) return null;

  const expected = createHmac("sha256", stateSecret()).update(encoded).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  // Compare before decoding: never parse a payload whose signature is unproven.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: { o?: unknown; u?: unknown; e?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const orgId = typeof parsed.o === "string" ? parsed.o : "";
  const expiresAt = typeof parsed.e === "number" ? parsed.e : 0;
  if (!orgId || !expiresAt || expiresAt < now) return null;

  return { orgId, userId: typeof parsed.u === "string" && parsed.u ? parsed.u : null };
}

// ── Hosted OAuth ─────────────────────────────────────────────────────────────

/**
 * Where to send the manager to authorise the mailbox.
 *
 * `access_type=online` is deliberate: it tells Nylas to keep the refresh token
 * rather than hand it to us, which is what lets this app store only a grant id.
 */
export function buildAuthUrl(options: {
  redirectUri: string;
  state: string;
  provider?: string | null;
  loginHint?: string | null;
  scopes?: string[];
}): string {
  if (!isNylasConfigured()) {
    throw new NylasError(
      "Nylas is not configured on this server (NYLAS_CLIENT_ID / NYLAS_API_KEY)",
      null,
      "unconfigured",
    );
  }

  const url = new URL(`${nylasApiUri()}/v3/connect/auth`);
  url.searchParams.set("client_id", nylasClientId());
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("state", options.state);
  if (options.provider) url.searchParams.set("provider", options.provider);
  if (options.loginHint) url.searchParams.set("login_hint", options.loginHint);
  const scopes = options.scopes ?? [];
  if (scopes.length) url.searchParams.set("scope", scopes.join(" "));
  return url.toString();
}

interface TokenResponse {
  grant_id?: string;
  email?: string;
  provider?: string;
  access_token?: string;
}

/**
 * Exchanges the callback code for a grant.
 *
 * Only `grant_id` (and the address, for display) is kept. The access token in
 * the response is deliberately discarded — holding it would mean owning a
 * refresh cycle Nylas already runs.
 */
export async function exchangeCodeForGrant(options: {
  code: string;
  redirectUri: string;
  timeoutMs?: number;
}): Promise<NylasGrant> {
  const body = {
    client_id: nylasClientId(),
    client_secret: nylasApiKey(),
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: "nylas",
  };

  const data = (await nylasFetch("/v3/connect/token", {
    method: "POST",
    body,
    // The token exchange authenticates with client_secret in the body, not the
    // bearer header — sending both makes some providers reject the request.
    withAuthHeader: false,
    timeoutMs: options.timeoutMs,
  })) as TokenResponse;

  if (!data.grant_id) {
    throw new NylasError("Nylas did not return a grant id", null, "protocol");
  }

  return {
    grantId: data.grant_id,
    email: (data.email || "").trim(),
    provider: (data.provider || "").trim(),
    status: "valid",
  };
}

// ── Grant-scoped calls ───────────────────────────────────────────────────────

interface FetchOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  withAuthHeader?: boolean;
  timeoutMs?: number;
}

async function nylasFetch(path: string, options: FetchOptions = {}): Promise<unknown> {
  if (!isNylasConfigured()) {
    throw new NylasError(
      "Nylas is not configured on this server (NYLAS_CLIENT_ID / NYLAS_API_KEY)",
      null,
      "unconfigured",
    );
  }

  const url = new URL(`${nylasApiUri()}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (options.withAuthHeader !== false) {
    headers.Authorization = `Bearer ${nylasApiKey()}`;
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      // Next patches global fetch and will cache route-handler requests without
      // this. Cast: `cache` is not on the DOM RequestInit this project compiles against.
      ...({ cache: "no-store" } as Record<string, unknown>),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new NylasError(
      aborted ? `Nylas did not respond within ${timeoutMs}ms` : "Could not reach Nylas",
      null,
      aborted ? "timeout" : "network",
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    const detail = text.slice(0, 300);
    if (res.status === 401) {
      throw new NylasError("Nylas rejected the API key (NYLAS_API_KEY)", 401, "auth");
    }
    // A revoked or expired grant is the one failure a manager can fix
    // themselves, by reconnecting — so it must not read as a server fault.
    if (res.status === 404 || /grant.*(not found|invalid|expired)/i.test(detail)) {
      throw new NylasError(
        "This mailbox is no longer connected — reconnect it to continue.",
        res.status,
        "grant_invalid",
      );
    }
    if (res.status === 403) {
      throw new NylasError(
        "Nylas refused the request — the mailbox may not have granted this scope.",
        403,
        "forbidden",
      );
    }
    throw new NylasError(`Nylas request failed: ${res.status} ${detail}`, res.status, "http");
  }

  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as { data?: unknown };
    // v3 wraps successful payloads in `data`; the token exchange does not.
    return parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed;
  } catch {
    throw new NylasError(
      `Nylas returned an unreadable response: ${text.slice(0, 200)}`,
      null,
      "protocol",
    );
  }
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** Confirms a stored grant is still live, and what address it speaks as. */
export async function getGrant(grantId: string, timeoutMs?: number): Promise<NylasGrant> {
  const data = (await nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}`, {
    timeoutMs,
  })) as Record<string, unknown>;
  return {
    grantId: str(data.id) || grantId,
    email: str(data.email),
    provider: str(data.provider),
    status: str(data.grant_status) || "valid",
  };
}

/** Most recent messages — proof the grant reaches real mail. */
export async function listMessages(
  grantId: string,
  limit = 3,
  timeoutMs?: number,
): Promise<NylasMessageSummary[]> {
  const data = (await nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}/messages`, {
    query: { limit: Math.min(20, Math.max(1, limit)) },
    timeoutMs,
  })) as Array<Record<string, unknown>>;

  if (!Array.isArray(data)) return [];
  return data.map((m) => {
    const from = Array.isArray(m.from) ? (m.from[0] as Record<string, unknown> | undefined) : undefined;
    return {
      id: str(m.id),
      subject: str(m.subject) || "(no subject)",
      from: str(from?.email),
      date: typeof m.date === "number" ? new Date(m.date * 1000).toISOString() : null,
      unread: Boolean(m.unread),
    };
  });
}

/** Upcoming events — proof the calendar scope actually landed. */
export async function listEvents(
  grantId: string,
  calendarId = "primary",
  limit = 3,
  timeoutMs?: number,
): Promise<NylasEventSummary[]> {
  const data = (await nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}/events`, {
    query: {
      calendar_id: calendarId,
      limit: Math.min(20, Math.max(1, limit)),
      start: Math.floor(Date.now() / 1000),
    },
    timeoutMs,
  })) as Array<Record<string, unknown>>;

  if (!Array.isArray(data)) return [];
  return data.map((e) => {
    const when = e.when as Record<string, unknown> | undefined;
    const startTime = when?.start_time ?? when?.start_date;
    return {
      id: str(e.id),
      title: str(e.title) || "(untitled)",
      when:
        typeof startTime === "number"
          ? new Date(startTime * 1000).toISOString()
          : str(startTime) || null,
    };
  });
}

export interface SendMessageInput {
  to: Array<{ email: string; name?: string }>;
  subject: string;
  body: string;
  replyToMessageId?: string | null;
}

/**
 * Sends mail as the worker.
 *
 * Callers must go through `lib/outbound.ts` rather than calling this directly —
 * that is where the email-domain allow-list is enforced. This function is the
 * transport, not the policy.
 */
export async function sendMessage(
  grantId: string,
  input: SendMessageInput,
  timeoutMs?: number,
): Promise<{ id: string }> {
  const data = (await nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}/messages/send`, {
    method: "POST",
    body: {
      to: input.to.map((r) => ({ email: r.email, ...(r.name ? { name: r.name } : {}) })),
      subject: input.subject,
      body: input.body,
      ...(input.replyToMessageId ? { reply_to_message_id: input.replyToMessageId } : {}),
    },
    timeoutMs,
  })) as Record<string, unknown>;
  return { id: str(data.id) };
}

export interface NylasConnectionCheck {
  ok: boolean;
  email: string | null;
  provider: string | null;
  messageCount: number;
  recentMessages: NylasMessageSummary[];
  upcomingEvents: NylasEventSummary[];
  error: string | null;
  errorKind: NylasError["kind"] | null;
}

/**
 * "Test connection" for the settings screen.
 *
 * Checks the grant, then mail, then calendar. Calendar is allowed to fail
 * without failing the test: a mailbox connected without the calendar scope is
 * a real and useful state, and saying so beats reporting the whole thing
 * broken. Never throws; the screen renders the failure.
 */
export async function checkNylasConnection(
  grantId: string,
  timeoutMs?: number,
): Promise<NylasConnectionCheck> {
  try {
    const grant = await getGrant(grantId, timeoutMs);
    const messages = await listMessages(grantId, 3, timeoutMs);
    const events = await listEvents(grantId, "primary", 3, timeoutMs).catch(() => []);
    return {
      ok: true,
      email: grant.email || null,
      provider: grant.provider || null,
      messageCount: messages.length,
      recentMessages: messages,
      upcomingEvents: events,
      error: null,
      errorKind: null,
    };
  } catch (error) {
    const known = error instanceof NylasError;
    return {
      ok: false,
      email: null,
      provider: null,
      messageCount: 0,
      recentMessages: [],
      upcomingEvents: [],
      error: known ? error.message : "Nylas connection test failed",
      errorKind: known ? error.kind : null,
    };
  }
}
