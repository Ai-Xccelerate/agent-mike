import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SCOPES,
  NylasError,
  buildAuthUrl,
  isNylasConfigured,
  nylasApiUri,
  nylasClientId,
  nylasRegion,
  signState,
  verifyState,
} from "@/lib/nylas";

const ENV_KEYS = ["NYLAS_CLIENT_ID", "NYLAS_API_KEY", "NYLAS_API_URI", "NYLAS_CALLBACK_URI"] as const;

let original: Record<string, string | undefined>;

beforeEach(() => {
  original = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

function configured() {
  process.env.NYLAS_CLIENT_ID = "client-abc";
  process.env.NYLAS_API_KEY = "nyk_supersecret";
}

describe("nylas configuration", () => {
  it("needs both halves of the application credential", () => {
    expect(isNylasConfigured()).toBe(false);
    process.env.NYLAS_CLIENT_ID = "client-abc";
    expect(isNylasConfigured()).toBe(false);
    process.env.NYLAS_API_KEY = "nyk_supersecret";
    expect(isNylasConfigured()).toBe(true);
  });

  it("defaults to the US region and strips a trailing slash", () => {
    expect(nylasApiUri()).toBe("https://api.us.nylas.com");
    expect(nylasRegion()).toBe("us");

    process.env.NYLAS_API_URI = "https://api.eu.nylas.com/";
    expect(nylasApiUri()).toBe("https://api.eu.nylas.com");
    expect(nylasRegion()).toBe("eu");
  });

  it("reports an unrecognised host as custom rather than guessing a region", () => {
    process.env.NYLAS_API_URI = "https://nylas.internal.example.com";
    expect(nylasRegion()).toBe("custom");
  });
});

describe("hosted auth url", () => {
  it("refuses to build one when the server holds no credentials", () => {
    expect(() => buildAuthUrl({ redirectUri: "https://app/cb", state: "s" })).toThrow(NylasError);
  });

  it("carries the parameters the hosted flow requires", () => {
    configured();
    const url = new URL(
      buildAuthUrl({
        redirectUri: "https://app.example.com/api/v1/mailbox/callback",
        state: "state-123",
        scopes: DEFAULT_SCOPES,
      }),
    );

    expect(url.origin + url.pathname).toBe("https://api.us.nylas.com/v3/connect/auth");
    expect(url.searchParams.get("client_id")).toBe("client-abc");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/v1/mailbox/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    // Online means Nylas keeps the refresh token — that is what lets this app
    // store only a grant id.
    expect(url.searchParams.get("access_type")).toBe("online");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(DEFAULT_SCOPES.join(" "));
  });

  it("never puts the API key in the URL", () => {
    configured();
    const url = buildAuthUrl({ redirectUri: "https://app/cb", state: "s", scopes: DEFAULT_SCOPES });
    expect(url).not.toContain("nyk_supersecret");
  });

  it("omits optional parameters rather than sending empty ones", () => {
    configured();
    const url = new URL(buildAuthUrl({ redirectUri: "https://app/cb", state: "s" }));
    expect(url.searchParams.has("provider")).toBe(false);
    expect(url.searchParams.has("login_hint")).toBe(false);
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("passes provider and login_hint through when given", () => {
    configured();
    const url = new URL(
      buildAuthUrl({
        redirectUri: "https://app/cb",
        state: "s",
        provider: "google",
        loginHint: "agent@acme.com",
      }),
    );
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("login_hint")).toBe("agent@acme.com");
    expect(nylasClientId()).toBe("client-abc");
  });
});

describe("oauth state", () => {
  it("round-trips the org and the user who started the flow", () => {
    configured();
    expect(verifyState(signState("org-abc", "user-1"))).toMatchObject({
      orgId: "org-abc",
      userId: "user-1",
    });
  });

  it("works without a user, for an adapter that has no concept of one", () => {
    configured();
    expect(verifyState(signState("org-abc"))).toMatchObject({ orgId: "org-abc", userId: null });
  });

  it("survives ids containing delimiters, which Clerk ids do", () => {
    configured();
    const state = signState("org:with:colons", "user_2abc:XYZ|extra");
    expect(verifyState(state)).toMatchObject({
      orgId: "org:with:colons",
      userId: "user_2abc:XYZ|extra",
    });
  });

  it("refuses a tampered payload", () => {
    configured();
    const state = signState("org-abc", "user-1");
    const [encoded, mac] = state.split(".");
    // Re-point it at another org, keeping the original signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({ o: "org-evil", u: "user-1", e: Date.now() + 60000, n: "aa" }),
    ).toString("base64url");
    expect(verifyState(`${forgedPayload}.${mac}`)).toBeNull();
    // And a flipped signature over the real payload.
    expect(verifyState(`${encoded}.${"0".repeat(mac.length)}`)).toBeNull();
  });

  it("refuses a state signed with a different key", () => {
    configured();
    const state = signState("org-abc");
    process.env.NYLAS_API_KEY = "nyk_rotated";
    expect(verifyState(state)).toBeNull();
  });

  it("expires, so a captured link cannot be replayed later", () => {
    configured();
    const state = signState("org-abc", null, 0);
    expect(verifyState(state, 0)).toMatchObject({ orgId: "org-abc" });
    // 15-minute TTL.
    expect(verifyState(state, 16 * 60 * 1000)).toBeNull();
  });

  it("refuses malformed input rather than throwing", () => {
    configured();
    for (const bad of ["", "nodot", "a.b", "....", "!!!.???"]) {
      expect(verifyState(bad)).toBeNull();
    }
  });

  it("issues a different state each time, so two tabs cannot collide", () => {
    configured();
    expect(signState("org-abc")).not.toBe(signState("org-abc"));
  });
});
