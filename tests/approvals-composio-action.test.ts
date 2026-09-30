import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const queued = {
  id: "00000000-0000-0000-0000-000000000009",
  organizationId: "org-1",
  toolId: "composio_action",
  input: { action: "JIRA_DELETE_ISSUE", app: "jira", version: "v1", tier: "delete", arguments: { issue_key: "AIX-1" } },
  status: "pending",
};

vi.mock("@/lib/tools-integrations/approval-repository", () => ({
  getApproval: vi.fn(async () => queued),
  decideApproval: vi.fn(async (_id: string, decision: string) => ({ ...queued, status: decision })),
  recordApprovalResult: vi.fn(),
}));

vi.mock("@/lib/tools-integrations/composio-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools-integrations/composio-actions")>();
  return { ...actual, applyComposioActionApproval: vi.fn(async () => ({ ok: true, output: "{\"successful\":true}" })) };
});

import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { recordApprovalResult } from "@/lib/tools-integrations/approval-repository";
import { applyComposioActionApproval } from "@/lib/tools-integrations/composio-actions";
import { PATCH } from "@/app/api/v1/approvals/[id]/route";

const previous = getIdentityAdapter();

function decide(decision: "approved" | "rejected") {
  const req = new NextRequest(`http://localhost/api/v1/approvals/${queued.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  return PATCH(req, { params: { id: queued.id } });
}

beforeEach(() => {
  setIdentityAdapter({
    resolveManagerRequest: async () => ({ orgId: "org-1", userId: "manager-1", role: "admin", source: "test" }),
    resolveWidgetRequest: async () => null,
  });
  vi.mocked(applyComposioActionApproval).mockClear();
  vi.mocked(recordApprovalResult).mockClear();
});

afterAll(() => setIdentityAdapter(previous));

describe("deciding a queued connected-app action", () => {
  it("runs it on approval and records what happened", async () => {
    const res = await decide("approved");
    expect(res.status).toBe(200);
    expect(applyComposioActionApproval).toHaveBeenCalledWith(queued.input, "org-1", "manager-1");
    expect(recordApprovalResult).toHaveBeenCalledWith(queued.id, { output: "{\"successful\":true}" }, null);
    expect(((await res.json()) as { applied: unknown }).applied).toEqual({ ok: true, output: "{\"successful\":true}" });
  });

  it("runs nothing on rejection", async () => {
    expect((await decide("rejected")).status).toBe(200);
    expect(applyComposioActionApproval).not.toHaveBeenCalled();
  });
});
