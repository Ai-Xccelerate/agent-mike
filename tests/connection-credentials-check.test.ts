import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { GET } from "@/app/api/v1/integrations/[type]/route";
import { db } from "@/lib/db";
import { integrationConnections, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { getAccountSite, getAccountStatus, proxyRequest } from "@/lib/tools-integrations/composio-client";
import { getConnectionForOrg, upsertPendingConnection } from "@/lib/tools-integrations/connection-repository";
import { confluenceCredentialsRefused, jiraCredentialsRefused } from "@/lib/tools-integrations/atlassian";

vi.mock("@/lib/tools-integrations/composio-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/composio-client")>()),
  getAccountStatus: vi.fn(),
  getAccountSite: vi.fn(),
  proxyRequest: vi.fn(),
}));
vi.mock("@/lib/tools-integrations/tool-call-log", () => ({ logToolCall: vi.fn() }));

const statusMock = vi.mocked(getAccountStatus);
const proxyMock = vi.mocked(proxyRequest);
const previousAdapter = getIdentityAdapter();
let orgId: string;

/** An API-token connection: Atlassian has no OAuth site list for it, so the site's cloud ID is read instead. */
function tokenConnection(answer: (endpoint: string) => { status: number; data: unknown }) {
  vi.mocked(getAccountSite).mockResolvedValue("https://acme.atlassian.net/");
  proxyMock.mockImplementation(async ({ endpoint }) =>
    endpoint.endsWith("/accessible-resources") ? { status: 401, data: { code: 401 } } : answer(endpoint),
  );
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ cloudId: "cloud-acme" }), { status: 200 })));
}

async function pending(integrationType: string, system: string, account: string) {
  const row = await upsertPendingConnection({ organizationId: orgId, integrationType, system, composioAuthConfigId: `ac_${system}` });
  await db.update(integrationConnections).set({ composioConnectedAccountId: account }).where(eq(integrationConnections.id, row.id));
}

const read = (type: string) =>
  GET(new NextRequest(`http://localhost/api/v1/integrations/${type}`), { params: { type } }).then(async (res) => (await res.json()) as { status: string });

beforeEach(async () => {
  statusMock.mockReset();
  statusMock.mockResolvedValue("ACTIVE");
  proxyMock.mockReset();
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Connection check org");
  setIdentityAdapter({
    resolveManagerRequest: async () => ({ orgId, userId: "manager", role: "owner", source: "test" }),
    resolveWidgetRequest: async () => null,
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setIdentityAdapter(previousAdapter);
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("a new Jira or Confluence connection is only shown as connected when Atlassian accepts its credentials", () => {
  it("marks a Jira connection failed when Atlassian turns the credentials away (a blank API key)", async () => {
    await pending("helpdesk", "jira", "ca_jira_blank");
    tokenConnection(() => ({ status: 401, data: { message: "Unauthorized" } }));
    expect((await read("helpdesk")).status).toBe("failed");
    expect((await getConnectionForOrg(orgId, "helpdesk"))?.status).toBe("failed");
  });

  it("marks a Confluence connection failed in the same case", async () => {
    await pending("knowledge_base", "confluence", "ca_conf_blank");
    tokenConnection(() => ({ status: 401, data: { message: "Unauthorized" } }));
    expect((await read("knowledge_base")).status).toBe("failed");
  });

  it("connects when the credentials are accepted", async () => {
    await pending("knowledge_base", "confluence", "ca_conf_ok");
    tokenConnection(() => ({ status: 200, data: { results: [] } }));
    expect((await read("knowledge_base")).status).toBe("active");
  });

  it("still connects when a key lacks a scope (403) or Atlassian can't be reached", async () => {
    await pending("knowledge_base", "confluence", "ca_conf_403");
    tokenConnection(() => ({ status: 403, data: { message: "Forbidden" } }));
    expect((await read("knowledge_base")).status).toBe("active");
  });

  it("does not check an OAuth sign-in, which has no blank-key failure", async () => {
    await pending("knowledge_base", "confluence", "ca_conf_oauth");
    vi.mocked(getAccountSite).mockResolvedValue("https://acme.atlassian.net");
    proxyMock.mockImplementation(async ({ endpoint }) =>
      endpoint.endsWith("/accessible-resources") ? { status: 200, data: [{ id: "cloud-acme", url: "https://acme.atlassian.net" }] } : { status: 401, data: null },
    );
    expect((await read("knowledge_base")).status).toBe("active");
    expect(proxyMock.mock.calls.some(([call]) => call.endpoint.includes("/rest/api/search"))).toBe(false);
  });

  it("answers the check itself: only a 401 is a refusal", async () => {
    tokenConnection((endpoint) => ({ status: endpoint.includes("/ex/confluence/") ? 401 : 200, data: null }));
    expect(await confluenceCredentialsRefused("ca_check_401")).toBe(true);
    tokenConnection(() => ({ status: 200, data: null }));
    expect(await confluenceCredentialsRefused("ca_check_200")).toBe(false);
    proxyMock.mockImplementation(async () => {
      throw new Error("network down");
    });
    expect(await confluenceCredentialsRefused("ca_check_down")).toBe(false);
    expect(await jiraCredentialsRefused("ca_check_jira_down")).toBe(false);
  });
});
