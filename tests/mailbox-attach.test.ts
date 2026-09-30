import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

const getGrantMock = vi.hoisted(() => vi.fn());
const credentialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/nylas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nylas")>();
  return { ...actual, getGrant: getGrantMock, resolveNylasCredentials: credentialsMock };
});

import { db } from "@/lib/db";
import { nylasMailboxes, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type TenantContext } from "@/lib/identity";
import { getMailbox } from "@/lib/mailbox-repository";
import { NylasError } from "@/lib/nylas";
import { POST as attach } from "@/app/api/v1/mailbox/attach/route";

const previous = getIdentityAdapter();
let orgId: string;
let otherOrgId: string;
const grantId = () => crypto.randomUUID();

function as(role: TenantContext["role"], org = orgId) {
  setIdentityAdapter({
    resolveManagerRequest: async () => ({ orgId: org, userId: `user-${role}`, role, source: "test" }),
    resolveWidgetRequest: async () => null,
  });
}

function post(body: unknown) {
  return attach(
    new NextRequest("http://localhost/api/v1/mailbox/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  otherOrgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Attach test");
  await ensureOrganization(otherOrgId, "Other org");
  credentialsMock.mockReset();
  credentialsMock.mockResolvedValue({ source: "env", values: { clientId: "c", apiKey: "k", apiUri: "https://api.us.nylas.com" } });
  getGrantMock.mockReset();
});

afterEach(async () => {
  setIdentityAdapter(previous);
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(organizations).where(eq(organizations.id, otherOrgId));
});

describe("attaching an existing Nylas mailbox", () => {
  it("is admin-only", async () => {
    as("member");
    expect((await post({ grantId: grantId() })).status).toBe(403);
  });

  it("checks the grant with the org's Nylas application and saves it for that org", async () => {
    as("admin");
    const id = grantId();
    getGrantMock.mockResolvedValue({ grantId: id, email: "mike@aiwkr.com", provider: "nylas", status: "valid" });
    const res = await post({ grantId: id });
    expect(res.status).toBe(200);
    expect(credentialsMock).toHaveBeenCalledWith(orgId);
    expect(await getMailbox(orgId)).toMatchObject({ grantId: id, email: "mike@aiwkr.com", status: "connected" });
  });

  it("refuses a grant Nylas doesn't know or that isn't valid", async () => {
    as("admin");
    getGrantMock.mockRejectedValueOnce(new NylasError("not found", 404, "http"));
    expect((await post({ grantId: grantId() })).status).toBe(422);
    getGrantMock.mockResolvedValueOnce({ grantId: "g", email: "x@y.com", provider: "nylas", status: "invalid" });
    expect((await post({ grantId: grantId() })).status).toBe(422);
    expect(await getMailbox(orgId)).toBeNull();
  });

  it("refuses a grant another organization already uses", async () => {
    const id = grantId();
    await db.insert(nylasMailboxes).values({ organizationId: otherOrgId, grantId: id, email: "a@b.com", status: "connected" });
    as("admin");
    expect((await post({ grantId: id })).status).toBe(409);
    expect(getGrantMock).not.toHaveBeenCalled();
  });

  it("needs a Nylas application first", async () => {
    as("admin");
    credentialsMock.mockResolvedValue(null);
    expect((await post({ grantId: grantId() })).status).toBe(422);
  });
});
