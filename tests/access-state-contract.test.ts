import { describe, expect, it } from "vitest";
import { PlatformAuthError, platformAuthErrorResponse } from "@/lib/clerk-core-auth";
// The frontend's detector (no React, no aliases), checked against the
// backend's real responses so the two can't drift apart.
import { accessProblemFrom } from "../frontend/src/lib/access-state";

async function detect(error: PlatformAuthError) {
  const res = platformAuthErrorResponse(error);
  return accessProblemFrom(res.status, await res.json());
}

describe("no-access screen contract (backend response -> frontend detector)", () => {
  it("recognises AIX Core's 'no access', with its reason", async () => {
    expect(await detect(new PlatformAuthError(403, "No access to Mike", { error: "no_agent_access", reason: "not_assigned" }))).toEqual({
      kind: "no_access",
      reason: "not_assigned",
    });
    expect(
      await detect(new PlatformAuthError(403, "No access to Mike", { error: "no_agent_access", reason: "agent_not_enabled_for_org" })),
    ).toEqual({ kind: "no_access", reason: "agent_not_enabled_for_org" });
  });

  it("recognises Core being unreachable or Mike missing from its catalog (fails closed)", async () => {
    expect(await detect(new PlatformAuthError(503, "AIX Core access check failed"))).toEqual({ kind: "unavailable" });
    expect(await detect(new PlatformAuthError(503, "Mike is not registered in the AIX Core catalog"))).toEqual({ kind: "unavailable" });
  });

  it("leaves ordinary errors alone (a member's 403 on a setting is not 'no access')", async () => {
    expect(accessProblemFrom(403, { error: "Only org admins can do this" })).toBeNull();
    expect(accessProblemFrom(401, { error: "Missing Authorization header" })).toBeNull();
    expect(accessProblemFrom(500, null)).toBeNull();
  });
});
