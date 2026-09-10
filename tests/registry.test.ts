import { describe, expect, it } from "vitest";
import { getIntegration, getTool } from "@/lib/tools-integrations/registry";

describe("tools/integrations registry", () => {
  it("returns the internet_search tool", () => {
    expect(getTool("internet_search")).toEqual({
      id: "internet_search",
      name: "Internet Search",
      requiresAuth: false,
    });
  });

  it("returns the crm_zoho integration", () => {
    expect(getIntegration("crm_zoho")).toEqual({
      id: "crm_zoho",
      integrationType: "crm",
      system: "zoho",
      requiresAuth: true,
    });
  });

  it("returns undefined for unknown ids", () => {
    expect(getTool("not_a_tool")).toBeUndefined();
    expect(getIntegration("not_an_integration")).toBeUndefined();
  });
});
