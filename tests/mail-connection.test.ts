import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { GET as getMailbox } from "@/app/api/v1/mailbox/route";
import { db } from "@/lib/db";
import { nylasMailboxes, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { describeMailConnection } from "@/lib/mail-connection";
import { getAccountEmail } from "@/lib/tools-integrations/composio-client";
import { markConnectionActive, upsertPendingConnection } from "@/lib/tools-integrations/connection-repository";

vi.mock("@/lib/tools-integrations/composio-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/composio-client")>()),
  getAccountEmail: vi.fn(),
}));

const gmail = { system: "gmail", status: "active" };
const outlook = { system: "outlook", status: "active" };
const mailbox = { status: "connected", email: "support@acme.com" };

describe("which mail platform the worker is connected to", () => {
  it("is the mailbox when one is connected, with its address", () => {
    expect(describeMailConnection({ mailbox, mailboxLive: true, email: null })).toEqual({
      platform: "mailbox",
      state: "connected",
      address: "support@acme.com",
    });
  });

  it("is Gmail connected under Connections when there is no mailbox: Identity used to say 'Not connected' here", () => {
    expect(describeMailConnection({ mailbox: null, email: gmail, gmailAddress: "help@acme.com" })).toEqual({
      platform: "gmail",
      state: "connected",
      address: "help@acme.com",
    });
    expect(describeMailConnection({ mailbox: null, email: gmail }).address).toBeNull();
  });

  it("prefers the mailbox when both exist, the way sending does", () => {
    expect(describeMailConnection({ mailbox, mailboxLive: true, email: gmail }).platform).toBe("mailbox");
  });

  it("falls back to Gmail when the mailbox's grant has stopped working", () => {
    expect(describeMailConnection({ mailbox, mailboxLive: false, email: gmail }).platform).toBe("gmail");
  });

  it("says reconnect, not 'none', when what was connected no longer works", () => {
    expect(describeMailConnection({ mailbox: { status: "invalid", email: "support@acme.com" }, email: null })).toMatchObject({ platform: null, state: "reconnect" });
    expect(describeMailConnection({ mailbox, mailboxLive: false, email: null })).toMatchObject({ platform: null, state: "reconnect" });
    expect(describeMailConnection({ mailbox: null, email: { system: "gmail", status: "failed" } })).toMatchObject({ state: "reconnect" });
    expect(describeMailConnection({ mailbox: null, email: { system: "gmail", status: "pending" } })).toMatchObject({ state: "none" });
  });

  it("is none with nothing connected", () => {
    expect(describeMailConnection({ mailbox: null, email: null })).toEqual({ platform: null, state: "none", address: null });
  });

  it("counts Outlook under Connections as a platform the worker sends through, after the mailbox", () => {
    expect(describeMailConnection({ mailbox: null, email: outlook, outlookAddress: "eva@acme.com" })).toEqual({ platform: "outlook", state: "connected", address: "eva@acme.com" });
    expect(describeMailConnection({ mailbox, mailboxLive: true, email: outlook })).toMatchObject({ platform: "mailbox" });
  });
});

describe("GET /api/v1/mailbox says what is connected, whichever platform it is", () => {
  const previous = getIdentityAdapter();
  let orgId: string;

  beforeEach(async () => {
    orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Mail connection org");
    setIdentityAdapter({ resolveManagerRequest: async () => ({ orgId, userId: "m", role: "owner", source: "test" }), resolveWidgetRequest: async () => null });
    vi.mocked(getAccountEmail).mockReset();
  });
  afterEach(async () => {
    setIdentityAdapter(previous);
    await db.delete(nylasMailboxes).where(eq(nylasMailboxes.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const read = async () => (await (await getMailbox(new NextRequest("http://localhost/api/v1/mailbox"))).json()) as { connected: boolean; mail: { platform: string | null; state: string; address: string | null } };

  it("reports Gmail connected under Connections, with its address, although no mailbox exists", async () => {
    const row = await upsertPendingConnection({ organizationId: orgId, integrationType: "email", system: "gmail", composioAuthConfigId: "ac_gmail" });
    await markConnectionActive(row.id, "ca_gmail_test");
    vi.mocked(getAccountEmail).mockResolvedValue("help@acme.com");

    const body = await read();

    expect(body.connected).toBe(false); // the mailbox itself: unchanged
    expect(body.mail).toEqual({ platform: "gmail", state: "connected", address: "help@acme.com" });
  });

  it("reports nothing connected when nothing is, and Outlook as the platform when that is all there is", async () => {
    expect((await read()).mail).toMatchObject({ platform: null, state: "none" });
    vi.mocked(getAccountEmail).mockResolvedValue("eva@acme.com");
    const row = await upsertPendingConnection({ organizationId: orgId, integrationType: "email", system: "outlook", composioAuthConfigId: "ac_outlook" });
    await markConnectionActive(row.id, "ca_outlook_test");
    expect((await read()).mail).toEqual({ platform: "outlook", state: "connected", address: "eva@acme.com" });
  });

  it("still answers when Composio cannot say the address", async () => {
    const row = await upsertPendingConnection({ organizationId: orgId, integrationType: "email", system: "gmail", composioAuthConfigId: "ac_gmail" });
    await markConnectionActive(row.id, "ca_gmail_test");
    vi.mocked(getAccountEmail).mockRejectedValue(new Error("composio down"));
    expect((await read()).mail).toMatchObject({ platform: "gmail", state: "connected", address: null });
  });
});
