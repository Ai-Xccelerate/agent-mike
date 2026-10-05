import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
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
    ["/api/v1/worker", { "x-worker-site-token": "anything" }],
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
