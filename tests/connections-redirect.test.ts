import { describe, expect, it } from "vitest";
import { CONNECTION_TABS, connectionsHref, isConnectionTab, redirectFromOldAddress } from "../frontend/src/lib/connections";

describe("Settings > Connections addresses", () => {
  it("sends each old Settings address to its tab", () => {
    expect(redirectFromOldAddress("tools")).toBe("/settings/connections?tab=tools");
    expect(redirectFromOldAddress("apps")).toBe("/settings/connections?tab=apps");
    expect(redirectFromOldAddress("connectors")).toBe("/settings/connections?tab=connectors");
  });

  it("keeps the rest of the query, so a sign-in that returns with its result still shows it", () => {
    expect(redirectFromOldAddress("tools", { mailbox: "error", reason: "access_denied" })).toBe("/settings/connections?tab=email&mailbox=error&reason=access_denied");
  });

  it("lands a mailbox return on Email, whichever old address it came back to", () => {
    expect(redirectFromOldAddress("apps", { mailbox: "connected" })).toContain("tab=email");
  });

  it("does not repeat or trust a tab given in the old address", () => {
    expect(redirectFromOldAddress("tools", { tab: "evil" })).toBe("/settings/connections?tab=tools");
  });

  it("knows the tabs", () => {
    expect(CONNECTION_TABS.map((tab) => tab.id)).toEqual(["email", "apps", "tools", "connectors"]);
    expect(isConnectionTab("apps")).toBe(true);
    expect(isConnectionTab("nope")).toBe(false);
    expect(connectionsHref("email")).toBe("/settings/connections?tab=email");
  });
});
