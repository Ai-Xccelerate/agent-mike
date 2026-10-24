/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { GET } from "@/app/api/v1/worker/ticket-sample/route";

const fetchMock = vi.hoisted(() => vi.fn());
const connectionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ticket-knowledge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ticket-knowledge")>()),
  fetchRedactedResolvedTickets: fetchMock,
}));
vi.mock("@/lib/tools-integrations/connection-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/connection-repository")>()),
  getConnectionForOrg: connectionMock,
}));

const previousAdapter = getIdentityAdapter();
const adapter = (role: "owner" | "member"): IdentityAdapter => ({
  resolveManagerRequest: async () => ({ orgId: "org-sample", userId: "m", role, source: "test" }),
  resolveWidgetRequest: async () => null,
});
const active = { system: "jira", status: "active", composioConnectedAccountId: "ca_1" };
const ticket = (n: number) => ({ requestType: "Service Request", priority: null, problem: `Problem ${n}`, resolution: `Fix ${n}` });
const page = (tickets: number[], left: Partial<Record<string, number>> = {}, next: string | null = null) =>
  JSON.stringify({ project: "EESD", tickets: tickets.map(ticket), excludedSensitive: 0, excludedInternal: 0, heldBackForReview: 0, excludedEmpty: 0, unreadable: 0, ...left, nextPageToken: next });
const call = async (query = "") => {
  const res = await GET(new NextRequest(`http://localhost/api/v1/worker/ticket-sample${query}`));
  return { status: res.status, body: (await res.json()) as any };
};

beforeEach(() => {
  setIdentityAdapter(adapter("owner"));
  fetchMock.mockReset();
  connectionMock.mockReset();
  connectionMock.mockResolvedValue(active);
});
afterEach(() => setIdentityAdapter(previousAdapter));

describe("GET /api/v1/worker/ticket-sample", () => {
  it("pages through the tickets itself, collecting what is kept and counting what is left out", async () => {
    fetchMock
      .mockResolvedValueOnce(page([1, 2], { excludedSensitive: 3, heldBackForReview: 20 }, "t1"))
      .mockResolvedValueOnce(page([3], { excludedInternal: 4 }, "t2"))
      .mockResolvedValueOnce(page([4], { excludedEmpty: 1 }, null));
    const { status, body } = await call("?count=100");
    expect(status).toBe(200);
    expect(body.kept).toBe(4);
    expect(body.tickets.map((t: any) => t.problem)).toEqual(["Problem 1", "Problem 2", "Problem 3", "Problem 4"]);
    expect(body.leftOut).toEqual({ sensitive: 3, internal: 4, heldBack: 20, empty: 1, unreadable: 0 });
    expect(body.read).toBe(2 + 3 + 20 + 1 + 4 + 1 + 1);
    expect(body.reachedTheEnd).toBe(true);
    // The token from one batch is handed to the next by the server.
    expect(fetchMock.mock.calls.map((c) => c[0].nextPageToken)).toEqual([null, "t1", "t2"]);
  });

  it("stops at the number asked for", async () => {
    fetchMock.mockImplementation(async () => page([1], { heldBackForReview: 24 }, "again-" + fetchMock.mock.calls.length));
    const { body } = await call("?count=50");
    expect(body.read).toBeGreaterThanOrEqual(50);
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(body.reachedTheEnd).toBe(false);
  });

  it("stops, and says so, when the paging does not advance", async () => {
    fetchMock.mockResolvedValue(page([1], { heldBackForReview: 24 }, "same"));
    const { body } = await call("?count=300");
    expect(body.stoppedBecause).toContain("did not advance");
    expect(fetchMock.mock.calls.length).toBe(2);
  });

  it("passes on a plain-words problem from the tool", async () => {
    fetchMock.mockResolvedValueOnce("Jira refused that search for EESD. The connected account may not be able to read that project.");
    const { body } = await call();
    expect(body.stoppedBecause).toContain("Jira refused");
    expect(body.kept).toBe(0);
  });

  it("is for org admins only, and needs Jira connected", async () => {
    setIdentityAdapter(adapter("member"));
    expect((await call()).status).toBe(403);
    setIdentityAdapter(adapter("owner"));
    connectionMock.mockResolvedValue({ ...active, status: "failed" });
    expect((await call()).status).toBe(409);
    connectionMock.mockResolvedValue(null);
    expect((await call()).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
