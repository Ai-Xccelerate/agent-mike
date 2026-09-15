import { describe, expect, it } from "vitest";
import {
  INTEGRATION_TYPES,
  INTEGRATIONS,
  TOOLS,
  getIntegration,
  getIntegrationType,
  getTool,
} from "@/lib/tools-integrations/registry";

describe("tools/integrations registry", () => {
  it("lists all four tools", () => {
    expect(TOOLS.map((tool) => tool.id)).toEqual([
      "browser_use",
      "internet_search",
      "scribe",
      "artifacts",
    ]);
    expect(getTool("browser_use")).toEqual({
      id: "browser_use",
      name: "Browser",
      requiresAuth: false,
    });
    expect(getTool("internet_search")).toEqual({
      id: "internet_search",
      name: "Internet Search",
      requiresAuth: false,
    });
    expect(getTool("scribe")?.name).toBe("Scribe");
    expect(getTool("artifacts")?.name).toBe("Artifacts");
  });

  it("lists integration types with crm_zoho, project_management_linear, and email_gmail vendors", () => {
    expect(INTEGRATION_TYPES.map((entry) => entry.type)).toEqual([
      "crm",
      "helpdesk",
      "ticketing",
      "project_management",
      "email",
    ]);
    expect(getIntegrationType("crm")).toEqual({ type: "crm", name: "CRM" });
    expect(getIntegrationType("project_management")).toEqual({
      type: "project_management",
      name: "Project Management",
    });
    expect(getIntegrationType("email")).toEqual({ type: "email", name: "Email" });
    expect(getIntegration("crm_zoho")).toEqual({
      id: "crm_zoho",
      integrationType: "crm",
      system: "zoho",
      requiresAuth: true,
    });
    expect(getIntegration("project_management_linear")).toEqual({
      id: "project_management_linear",
      integrationType: "project_management",
      system: "linear",
      requiresAuth: true,
    });
    expect(getIntegration("email_gmail")).toEqual({
      id: "email_gmail",
      integrationType: "email",
      system: "gmail",
      requiresAuth: true,
    });
    expect(getIntegration("crm_zoho")?.integrationType).toBe(getIntegrationType("crm")?.type);
    expect(INTEGRATIONS.every((vendor) => INTEGRATION_TYPES.some((t) => t.type === vendor.integrationType))).toBe(
      true,
    );
  });

  it("returns undefined for unknown ids", () => {
    expect(getTool("not_a_tool")).toBeUndefined();
    expect(getIntegration("not_an_integration")).toBeUndefined();
    expect(getIntegrationType("not_a_type")).toBeUndefined();
  });
});
