import { beforeEach, describe, expect, it, vi } from "vitest";

const executeToolMock = vi.hoisted(() => vi.fn());
const triggers = vi.hoisted(() => ({ create: vi.fn(), listActive: vi.fn(), delete: vi.fn() }));

vi.mock("@/lib/tools-integrations/composio-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools-integrations/composio-client")>();
  return { ...actual, executeTool: executeToolMock, getComposioClient: () => ({ triggers }) };
});

import {
  GMAIL_NEW_MESSAGE_TRIGGER,
  isAutomatedEmail,
  parseAddress,
  sendWithGmail,
  startReceivingIfGmail,
  stopReceivingIfGmail,
  toGmailInbound,
} from "@/lib/composio-email";
import { GMAIL_TOOLKIT_VERSION } from "@/lib/agent";

beforeEach(() => {
  executeToolMock.mockReset();
  for (const fn of Object.values(triggers)) fn.mockReset();
});

describe("reading a Gmail trigger delivery", () => {
  it("splits a display name from the address", () => {
    expect(parseAddress('"Anna Customer" <Anna@Customer.com>')).toEqual({ email: "anna@customer.com", name: "Anna Customer" });
    expect(parseAddress("anna@customer.com")).toEqual({ email: "anna@customer.com", name: "" });
  });

  it("needs a message id and a sender, and falls back to the message id for the thread", () => {
    expect(toGmailInbound({ sender: "a@b.com" })).toBeNull();
    expect(toGmailInbound({ message_id: "m1" })).toBeNull();
    expect(toGmailInbound({ message_id: "m1", sender: "a@b.com", label_ids: ["inbox"] })).toMatchObject({
      messageId: "m1",
      threadId: "m1",
      labelIds: ["INBOX"],
    });
  });

  it("recognises mail no person is waiting on", () => {
    const person = { senderEmail: "anna@customer.com", headers: {} };
    expect(isAutomatedEmail(person)).toBe(false);
    expect(isAutomatedEmail({ ...person, senderEmail: "no-reply@vendor.com" })).toBe(true);
    expect(isAutomatedEmail({ ...person, headers: { "auto-submitted": "auto-replied" } })).toBe(true);
    expect(isAutomatedEmail({ ...person, headers: { "auto-submitted": "no" } })).toBe(false);
    expect(isAutomatedEmail({ ...person, headers: { precedence: "bulk" } })).toBe(true);
    expect(isAutomatedEmail({ ...person, headers: { "list-unsubscribe": "<mailto:x>" } })).toBe(true);
  });
});

describe("sending through Gmail", () => {
  const base = { organizationId: "org-1", connectedAccountId: "ca_1", to: "anna@customer.com", subject: "Re: Hi", html: "<p>Hi</p>" };
  const options = { connectedAccountId: "ca_1", userId: "org-1", version: GMAIL_TOOLKIT_VERSION };

  it("replies within the thread when there is one", async () => {
    executeToolMock.mockResolvedValue({ successful: true, data: { id: "sent-9" } });
    expect(await sendWithGmail({ ...base, threadId: "t1" })).toEqual({ id: "sent-9" });
    expect(executeToolMock).toHaveBeenCalledWith(
      "GMAIL_REPLY_TO_THREAD",
      { thread_id: "t1", recipient_email: "anna@customer.com", message_body: "<p>Hi</p>", is_html: true },
      options,
    );
  });

  it("sends a new email otherwise", async () => {
    executeToolMock.mockResolvedValue({ successful: true, data: { id: "sent-10" } });
    await sendWithGmail(base);
    expect(executeToolMock).toHaveBeenCalledWith(
      "GMAIL_SEND_EMAIL",
      { recipient_email: "anna@customer.com", subject: "Re: Hi", body: "<p>Hi</p>", is_html: true },
      options,
    );
  });

  it("throws when Composio reports the action failed", async () => {
    executeToolMock.mockResolvedValue({ successful: false, error: "invalid_grant", data: {} });
    await expect(sendWithGmail(base)).rejects.toThrow("invalid_grant");
  });
});

describe("receiving lifecycle", () => {
  const gmail = { organizationId: "org-1", integrationType: "email", system: "gmail", composioConnectedAccountId: "ca_1" };

  it("starts the inbox trigger for a connected Gmail, and nothing else", async () => {
    triggers.create.mockResolvedValue({ triggerId: "ti_1" });
    await startReceivingIfGmail(gmail);
    expect(triggers.create).toHaveBeenCalledWith("org-1", GMAIL_NEW_MESSAGE_TRIGGER, {
      connectedAccountId: "ca_1",
      triggerConfig: { labelIds: "INBOX", userId: "me" },
    });

    triggers.create.mockClear();
    await startReceivingIfGmail({ ...gmail, system: "outlook" });
    await startReceivingIfGmail({ ...gmail, integrationType: "calendar" });
    expect(triggers.create).not.toHaveBeenCalled();
  });

  it("never fails the connect when the trigger can't be created", async () => {
    triggers.create.mockRejectedValue(new Error("Composio down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(startReceivingIfGmail(gmail)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("removes the account's inbox triggers on disconnect", async () => {
    triggers.listActive.mockResolvedValue({ items: [{ id: "ti_1" }, { id: "ti_2" }] });
    await stopReceivingIfGmail(gmail);
    expect(triggers.listActive).toHaveBeenCalledWith({
      connectedAccountIds: ["ca_1"],
      triggerNames: [GMAIL_NEW_MESSAGE_TRIGGER],
    });
    expect(triggers.delete).toHaveBeenCalledTimes(2);
  });
});
