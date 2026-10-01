import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const sendWithGmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/composio-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/composio-email")>();
  return { ...actual, sendWithGmail: sendWithGmailMock };
});

import { db } from "@/lib/db";
import { emailDomains, integrationConnections, nylasMailboxes, organizations, workerProfiles } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { OutboundBlocked, applyEmailSignature, blockedRecipients, sendAsWorker } from "@/lib/outbound";

/**
 * The allow-list is the only thing standing between an autonomous worker and
 * an inbox it was never meant to reach, so these run against a real database
 * rather than a stub of the query.
 */
const ORG = "outbound-test-org";

describe("outbound policy (db)", () => {
  let demo: string | undefined;

  beforeEach(async () => {
    demo = process.env.DEMO_MODE;
    // Stop at the transport boundary: these assert policy, not delivery.
    process.env.DEMO_MODE = "true";

    await db.insert(organizations).values({ id: ORG, name: "Outbound Test" }).onConflictDoNothing();
    await db.delete(emailDomains).where(eq(emailDomains.organizationId, ORG));
    await db.delete(nylasMailboxes).where(eq(nylasMailboxes.organizationId, ORG));
    // These assert the approved-domains rule, which only applies when
    // Settings > Email domains is switched on.
    await getOrCreateProfile(ORG);
    await db.update(workerProfiles).set({ restrictEmailDomains: true }).where(eq(workerProfiles.organizationId, ORG));
  });

  afterEach(async () => {
    await db.delete(emailDomains).where(eq(emailDomains.organizationId, ORG));
    await db.delete(nylasMailboxes).where(eq(nylasMailboxes.organizationId, ORG));
    await db.delete(organizations).where(eq(organizations.id, ORG));
    if (demo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = demo;
  });

  async function approve(domain: string, status = "approved") {
    await db.insert(emailDomains).values({ organizationId: ORG, domain, status });
  }

  async function connectMailbox(status = "connected") {
    await db.insert(nylasMailboxes).values({
      organizationId: ORG,
      grantId: "grant-123",
      email: "agent@acme.com",
      provider: "google",
      status,
    });
  }

  function send(to: string[]) {
    return sendAsWorker({
      orgId: ORG,
      to: to.map((email) => ({ email })),
      subject: "Hello",
      body: "Body",
    });
  }

  describe("with Settings > Email domains switched off (the default)", () => {
    it("lets the worker email any domain", async () => {
      await db.update(workerProfiles).set({ restrictEmailDomains: false }).where(eq(workerProfiles.organizationId, ORG));
      expect(await blockedRecipients(ORG, ["a@acme.com", "b@gmail.com"])).toEqual([]);
      await connectMailbox();
      await expect(send(["b@gmail.com"])).resolves.toMatchObject({ demo: true, to: ["b@gmail.com"] });
    });
  });

  describe("recipient screening", () => {
    it("blocks everything when nothing is approved — an empty list means nobody", async () => {
      expect(await blockedRecipients(ORG, ["a@acme.com", "b@other.com"])).toEqual([
        "acme.com",
        "other.com",
      ]);
    });

    it("allows an approved domain and nothing else", async () => {
      await approve("acme.com");
      expect(await blockedRecipients(ORG, ["a@acme.com"])).toEqual([]);
      expect(await blockedRecipients(ORG, ["a@other.com"])).toEqual(["other.com"]);
    });

    it("does not treat pending or revoked as approved", async () => {
      await approve("pending.com", "pending");
      await approve("gone.com", "revoked");
      expect(await blockedRecipients(ORG, ["a@pending.com", "b@gone.com"])).toEqual([
        "pending.com",
        "gone.com",
      ]);
    });

    it("does not let an approved domain carry its subdomains", async () => {
      await approve("acme.com");
      expect(await blockedRecipients(ORG, ["a@mail.acme.com"])).toEqual(["mail.acme.com"]);
    });

    it("reports each offending domain once, however many recipients share it", async () => {
      expect(await blockedRecipients(ORG, ["a@x.com", "b@x.com", "c@x.com"])).toEqual(["x.com"]);
    });
  });

  describe("sending as the worker", () => {
    it("refuses before touching the mailbox when a domain is unapproved", async () => {
      await connectMailbox();
      await expect(send(["someone@other.com"])).rejects.toBeInstanceOf(OutboundBlocked);
      await expect(send(["someone@other.com"])).rejects.toMatchObject({
        reason: "domain_not_approved",
        blockedDomains: ["other.com"],
      });
    });

    it("refuses the whole message if any one recipient is unapproved", async () => {
      await approve("acme.com");
      await connectMailbox();
      // Three of four are fine. A partial send is indistinguishable from a
      // complete one to the manager, so none of it goes.
      await expect(
        send(["a@acme.com", "b@acme.com", "c@acme.com", "d@other.com"]),
      ).rejects.toMatchObject({ blockedDomains: ["other.com"] });
    });

    it("checks the allow-list before the mailbox, so a blocked send never needs one", async () => {
      // No mailbox connected at all, and an unapproved recipient.
      await expect(send(["someone@other.com"])).rejects.toMatchObject({
        reason: "domain_not_approved",
      });
    });

    it("refuses when approved but no mailbox is connected", async () => {
      await approve("acme.com");
      await expect(send(["someone@acme.com"])).rejects.toMatchObject({ reason: "no_mailbox" });
    });

    it("refuses when the grant has been revoked upstream", async () => {
      await approve("acme.com");
      await connectMailbox("invalid");
      await expect(send(["someone@acme.com"])).rejects.toMatchObject({ reason: "no_mailbox" });
    });

    it("sends when the domain is approved and a mailbox is live", async () => {
      await approve("acme.com");
      await connectMailbox();
      const result = await send(["someone@acme.com"]);
      expect(result.to).toEqual(["someone@acme.com"]);
      expect(result.demo).toBe(true);
    });

    it("normalizes the stored domain, so approving Acme.com covers the address", async () => {
      await db.insert(emailDomains).values({ organizationId: ORG, domain: "acme.com", status: "approved" });
      await connectMailbox();
      await expect(send(["Someone@ACME.com"])).resolves.toMatchObject({ demo: true });
    });

    it("refuses an empty recipient list", async () => {
      await connectMailbox();
      await expect(sendAsWorker({ orgId: ORG, to: [], subject: "s", body: "b" })).rejects.toBeInstanceOf(
        OutboundBlocked,
      );
    });
  });
});

describe("applyEmailSignature", () => {
  it("doesn't add the signature again when the body already ends with it, spacing aside", () => {
    const body = "Thanks.\n\nBest,\r\nMike \nSupport Operations Executive\nAIXccelerate.com\n";
    expect(applyEmailSignature(body, "Best,\nMike\nSupport Operations Executive\nAIXccelerate.com")).toBe(body.trimEnd());
  });

  it("appends a signature under the body", () => {
    expect(applyEmailSignature("Thanks for writing in.", "Best,\nMike")).toBe(
      "Thanks for writing in.\n\nBest,\nMike",
    );
  });

  it("does not double-append when the body already ends with the signature", () => {
    const body = "Thanks.\n\nBest,\nMike";
    expect(applyEmailSignature(body, "Best,\nMike")).toBe("Thanks.\n\nBest,\nMike");
  });

  it("leaves the body alone when no signature is configured", () => {
    expect(applyEmailSignature("Thanks.", "")).toBe("Thanks.");
    expect(applyEmailSignature("Thanks.", null)).toBe("Thanks.");
  });
});

describe("which mailbox sends (db)", () => {
  const GMAIL_ORG = "outbound-gmail-test-org";
  let demo: string | undefined;

  beforeEach(async () => {
    demo = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "false";
    sendWithGmailMock.mockReset();
    sendWithGmailMock.mockResolvedValue({ id: "gmail-sent-1" });
    await db.insert(organizations).values({ id: GMAIL_ORG, name: "Gmail Outbound Test" }).onConflictDoNothing();
    await getOrCreateProfile(GMAIL_ORG);
    await db.update(workerProfiles).set({ emailSignature: "" }).where(eq(workerProfiles.organizationId, GMAIL_ORG));
    await db.insert(integrationConnections).values({
      organizationId: GMAIL_ORG,
      integrationType: "email",
      system: "gmail",
      composioAuthConfigId: "ac_test",
      composioConnectedAccountId: "ca_outbound",
      status: "active",
    });
  });

  afterEach(async () => {
    await db.delete(organizations).where(eq(organizations.id, GMAIL_ORG));
    if (demo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = demo;
  });

  it("sends through the connected Gmail, in the thread, when there is no Nylas mailbox", async () => {
    const sent = await sendAsWorker({
      orgId: GMAIL_ORG,
      to: [{ email: "anna@customer.com" }],
      subject: "Re: Invoice",
      body: "Refunded.",
      threadId: "gthread-1",
    });
    expect(sent).toEqual({ id: "gmail-sent-1", to: ["anna@customer.com"], demo: false });
    expect(sendWithGmailMock).toHaveBeenCalledWith({
      organizationId: GMAIL_ORG,
      connectedAccountId: "ca_outbound",
      to: "anna@customer.com",
      subject: "Re: Invoice",
      html: "<p>Refunded.</p>",
      threadId: "gthread-1",
    });
  });

  it("refuses rather than half-send to more than one recipient", async () => {
    await expect(
      sendAsWorker({ orgId: GMAIL_ORG, to: [{ email: "a@x.com" }, { email: "b@x.com" }], subject: "s", body: "b" }),
    ).rejects.toBeInstanceOf(OutboundBlocked);
    expect(sendWithGmailMock).not.toHaveBeenCalled();
  });

  it("refuses when the Gmail connection is not active", async () => {
    await db
      .update(integrationConnections)
      .set({ status: "pending" })
      .where(eq(integrationConnections.organizationId, GMAIL_ORG));
    await expect(
      sendAsWorker({ orgId: GMAIL_ORG, to: [{ email: "a@x.com" }], subject: "s", body: "b" }),
    ).rejects.toMatchObject({ reason: "no_mailbox" });
  });
});
