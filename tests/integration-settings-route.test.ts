import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { GET, PATCH } from "@/app/api/v1/integrations/[type]/route";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { executeTool } from "@/lib/tools-integrations/composio-client";
import { disconnectIntegration } from "@/lib/tools-integrations/disconnect";
import {
  getConnectionForOrg,
  markConnectionActive,
  upsertPendingConnection,
} from "@/lib/tools-integrations/connection-repository";

vi.mock("@/lib/tools-integrations/composio-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/composio-client")>()),
  executeTool: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("@/lib/tools-integrations/tool-call-log", () => ({ logToolCall: vi.fn() }));

const executeToolMock = vi.mocked(executeTool);
const jiraProjects = {
  successful: true,
  error: null,
  data: { projects: [{ key: "SUP", name: "Support", issueTypes: [{ name: "Task" }, { name: "[System] Incident" }] }] },
};

const previousAdapter = getIdentityAdapter();
let orgId: string;
let role: "owner" | "member" = "owner";

function patch(type: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/v1/integrations/${type}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      duplex: "half" as const,
    }),
    { params: { type } },
  );
}

async function connect(integrationType: string, system: string) {
  const row = await upsertPendingConnection({
    organizationId: orgId,
    integrationType,
    system,
    composioAuthConfigId: `ac_${system}`,
  });
  return markConnectionActive(row.id, `ca_${system}`);
}

beforeEach(async () => {
  executeToolMock.mockReset();
  executeToolMock.mockResolvedValue(jiraProjects);
  orgId = `org-${crypto.randomUUID()}`;
  role = "owner";
  await ensureOrganization(orgId, "Integration settings org");
  setIdentityAdapter({
    resolveManagerRequest: async () => ({ orgId, userId: "manager", role, source: "test" }),
    resolveWidgetRequest: async () => null,
  });
});

afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("PATCH /api/v1/integrations/:type settings", () => {
  it("saves Jira's handoff project and issue type, and GET returns them with defaults", async () => {
    await connect("helpdesk", "jira");

    const res = await patch("helpdesk", { settings: { projectKey: "sup", issueType: "Task" } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { settings: unknown }).settings).toEqual({ projectKey: "SUP", issueType: "Task", createTicketOnHandoff: true });

    const stored = await getConnectionForOrg(orgId, "helpdesk");
    expect(stored?.metadata).toEqual({ settings: { projectKey: "SUP", issueType: "Task", createTicketOnHandoff: true } });

    const got = await GET(new NextRequest("http://localhost/api/v1/integrations/helpdesk"), { params: { type: "helpdesk" } });
    expect(((await got.json()) as { settings: { projectKey: string } }).settings.projectKey).toBe("SUP");
  });

  it("refuses an issue type the project doesn't have, naming the ones it does", async () => {
    await connect("helpdesk", "jira");
    const res = await patch("helpdesk", { settings: { projectKey: "SUP", issueType: "Support" } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      '"Support" isn\'t an issue type in SUP. Choose one of: Task, [System] Incident.',
    );
    expect((await getConnectionForOrg(orgId, "helpdesk"))?.metadata).toEqual({});
  });

  it("refuses to save when Jira can't be reached to check", async () => {
    await connect("helpdesk", "jira");
    executeToolMock.mockRejectedValue(new Error("down"));
    expect((await patch("helpdesk", { settings: { projectKey: "SUP", issueType: "Task" } })).status).toBe(502);
  });

  it("keeps the settings through a disconnect and reconnect", async () => {
    await connect("helpdesk", "jira");
    await patch("helpdesk", { settings: { projectKey: "SUP", issueType: "Task" } });
    await disconnectIntegration(orgId, "helpdesk");
    expect(await getConnectionForOrg(orgId, "helpdesk")).toBeNull();

    await connect("helpdesk", "jira");
    const got = await GET(new NextRequest("http://localhost/api/v1/integrations/helpdesk"), { params: { type: "helpdesk" } });
    expect(((await got.json()) as { settings: unknown }).settings).toEqual({
      projectKey: "SUP",
      issueType: "Task",
      createTicketOnHandoff: true,
    });
  });

  it("changes only the fields sent", async () => {
    await connect("knowledge_base", "confluence");
    await patch("knowledge_base", { settings: { spaceKey: "SK" } });
    const res = await patch("knowledge_base", { settings: { searchBeforeAnswering: false } });
    expect(((await res.json()) as { settings: unknown }).settings).toEqual({ spaceKey: "SK", searchBeforeAnswering: false });
  });

  it("rejects an invalid or unknown field, and a connection with no settings", async () => {
    await connect("helpdesk", "jira");
    expect((await patch("helpdesk", { settings: { projectKey: "not a key" } })).status).toBe(400);
    expect((await patch("helpdesk", { settings: { spaceKey: "SK" } })).status).toBe(400);

    await connect("crm", "zoho");
    expect((await patch("crm", { settings: {} })).status).toBe(400);
  });

  it("needs a connection and an admin", async () => {
    expect((await patch("helpdesk", { settings: { projectKey: "SUP" } })).status).toBe(404);
    role = "member";
    expect((await patch("helpdesk", { settings: { projectKey: "SUP" } })).status).toBe(403);
  });
});
