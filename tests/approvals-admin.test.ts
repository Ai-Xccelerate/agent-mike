import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/tools-integrations/approval-repository", () => ({
  getApproval: vi.fn(async () => null),
  decideApproval: vi.fn(),
  recordApprovalResult: vi.fn(),
}));

import { setIdentityAdapter, type IdentityAdapter, type TenantContext } from "@/lib/identity";
import { decideApproval } from "@/lib/tools-integrations/approval-repository";
import { PATCH } from "@/app/api/v1/approvals/[id]/route";

// Stands in for the Clerk adapter: the route only sees the verified tenant.
function as(role: TenantContext["role"]): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({ orgId: "org-1", userId: `user-${role}`, role, source: "test" }),
    resolveWidgetRequest: async () => null,
  };
}

function decide() {
  const id = "00000000-0000-0000-0000-000000000001";
  const req = new NextRequest(`http://localhost/api/v1/approvals/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved" }),
  });
  return PATCH(req, { params: { id } });
}

beforeEach(() => vi.mocked(decideApproval).mockReset());
afterAll(() => setIdentityAdapter(as("owner")));

describe("deciding a queued approval (it can send real email)", () => {
  it("is refused for a member", async () => {
    setIdentityAdapter(as("member"));
    expect((await decide()).status).toBe(403);
    expect(decideApproval).not.toHaveBeenCalled();
  });

  it("gets past the role check for an owner or admin (an unknown id is then a 404, not a 403)", async () => {
    setIdentityAdapter(as("admin"));
    expect((await decide()).status).toBe(404);
    setIdentityAdapter(as("owner"));
    expect((await decide()).status).toBe(404);
  });
});
