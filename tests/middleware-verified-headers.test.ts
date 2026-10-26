import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

const forged = {
  "x-aix-verified-org-id": "org_victim",
  "x-aix-verified-user-id": "user_attacker",
  "x-aix-verified-role": "owner",
  "x-aix-verified-email": "attacker@example.com",
};

describe("middleware on public routes", () => {
  it.each([
    ["/api/v1/chat", { "x-mike-site-token": "anything" }],
    ["/api/v1/chat/agui", { "x-worker-site-token": "anything" }],
    ["/api/v1/chat/attachments", { "x-worker-site-token": "anything" }],
    ["/api/v1/worker", { "x-worker-site-token": "anything" }],
    ["/api/v1/transcribe", { "x-worker-site-token": "anything" }],
    ["/api/health", {}],
  ])("drops client-supplied x-aix-verified-* headers on %s", async (path, extra) => {
    const req = new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { ...forged, ...extra },
    });
    const res = await middleware(req);

    // Without an override Next forwards the inbound headers untouched, forged
    // copies included. With one, the route sees exactly the listed headers.
    const overridden = res.headers.get("x-middleware-override-headers");
    expect(overridden).not.toBeNull();
    for (const name of Object.keys(forged)) {
      expect(overridden!.split(",")).not.toContain(name);
      expect(res.headers.get(`x-middleware-request-${name}`)).toBeNull();
    }
  });
});

describe("the file upload route, with sign-in required as on a deployed server", () => {
  const previous = process.env.MIKE_PLATFORM_AUTH;
  beforeEach(() => {
    process.env.MIKE_PLATFORM_AUTH = "true";
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.MIKE_PLATFORM_AUTH;
    else process.env.MIKE_PLATFORM_AUTH = previous;
  });

  it("is open to the website widget with its site token, and to nobody without one", async () => {
    const withToken = await middleware(new NextRequest("http://localhost/api/v1/chat/attachments", { method: "POST", headers: { "x-worker-site-token": "anything" } }));
    expect(withToken.status).toBe(200);
    const without = await middleware(new NextRequest("http://localhost/api/v1/chat/attachments", { method: "POST" }));
    expect(without.status).toBe(401);
  });

  it("keeps the manager's download route behind sign-in, even with a site token", async () => {
    const res = await middleware(new NextRequest("http://localhost/api/v1/attachments/00000000-0000-0000-0000-000000000000", { headers: { "x-worker-site-token": "anything" } }));
    expect(res.status).toBe(401);
  });
});
