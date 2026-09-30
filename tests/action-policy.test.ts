import { describe, expect, it } from "vitest";
import { classifyAction, decideAction, emailRecipients } from "@/lib/tools-integrations/action-policy";

describe("classifyAction", () => {
  const cases: [string, string, ReturnType<typeof classifyAction>][] = [
    ["JIRA_SEARCH_ISSUES", "jira", "read"],
    ["JIRA_GET_COMMENT", "jira", "read"],
    ["JIRA_LIST_USERS", "jira", "read"],
    ["GMAIL_BATCH_GET", "gmail", "read"],
    ["GMAIL_LIST_DRAFTS", "gmail", "read"],
    ["GOOGLECALENDAR_FIND_FREE_SLOTS", "googlecalendar", "read"],
    ["CONFLUENCE_GET_PAGE_BY_ID", "confluence", "read"],
    ["JIRA_CREATE_ISSUE", "jira", "routine"],
    ["JIRA_ADD_COMMENT", "jira", "routine"],
    ["JIRA_TRANSITION_ISSUE", "jira", "routine"],
    ["LINEAR_UPDATE_ISSUE", "linear", "routine"],
    ["ZOHO_UPDATE_RECORD", "zoho", "routine"],
    ["GMAIL_CREATE_EMAIL_DRAFT", "gmail", "routine"],
    ["GOOGLECALENDAR_CREATE_EVENT", "googlecalendar", "routine"],
    ["GMAIL_SEND_EMAIL", "gmail", "email"],
    ["GMAIL_REPLY_TO_THREAD", "gmail", "email"],
    ["OUTLOOK_SEND_EMAIL", "outlook", "email"],
    ["ZOHO_SEND_MAIL", "zoho", "risky"],
    ["GMAIL_FORWARD_MESSAGE", "gmail", "risky"],
    ["JIRA_ASSIGN_ISSUE", "jira", "risky"],
    ["JIRA_BULK_CREATE_ISSUE", "jira", "risky"],
    ["JIRA_UPDATE_USER", "jira", "risky"],
    ["LINEAR_SET_PRIORITY", "linear", "risky"],
    ["JIRA_DELETE_ISSUE", "jira", "delete"],
    ["GMAIL_MOVE_TO_TRASH", "gmail", "delete"],
    ["GMAIL_BATCH_DELETE_MESSAGES", "gmail", "delete"],
    ["ZOHO_REMOVE_TAG", "zoho", "delete"],
    ["SOMETHING_UNRECOGNISED", "jira", "risky"],
  ];

  it.each(cases)("%s → %s", (slug, toolkit, tier) => {
    expect(classifyAction({ slug, toolkit })).toBe(tier);
  });

  it("honours Composio's hints, but a delete slug wins over a read-only hint", () => {
    expect(classifyAction({ slug: "JIRA_WHATEVER", toolkit: "jira", tags: ["readOnlyHint"] })).toBe("read");
    expect(classifyAction({ slug: "JIRA_WHATEVER", toolkit: "jira", tags: ["destructiveHint"] })).toBe("delete");
    expect(classifyAction({ slug: "JIRA_DELETE_ISSUE", toolkit: "jira", tags: ["readOnlyHint"] })).toBe("delete");
  });
});

describe("emailRecipients", () => {
  it("reads recipient fields in any common shape and ignores addresses in the body", () => {
    expect(
      emailRecipients({
        recipient_email: "A@x.com",
        extra_recipients: ["b@x.com"],
        cc: ["c@x.com"],
        toRecipients: [{ emailAddress: { address: "d@x.com" } }],
        body: "Write to e@x.com any time",
      }).sort(),
    ).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
  });
});

describe("decideAction", () => {
  const base = { args: {}, customerEmail: "customer@example.com" };

  it("always runs reads, never runs risky changes or deletes on its own", () => {
    for (const requireWriteApproval of [true, false]) {
      expect(decideAction({ ...base, tier: "read", requireWriteApproval }).run).toBe(true);
      expect(decideAction({ ...base, tier: "risky", requireWriteApproval }).run).toBe(false);
      expect(decideAction({ ...base, tier: "delete", requireWriteApproval }).run).toBe(false);
    }
  });

  it("runs routine changes only when approval isn't required for every change", () => {
    expect(decideAction({ ...base, tier: "routine", requireWriteApproval: true }).run).toBe(false);
    expect(decideAction({ ...base, tier: "routine", requireWriteApproval: false }).run).toBe(true);
  });

  it("sends email on its own only when every recipient is this conversation's customer", () => {
    const toCustomer = { recipient_email: "Customer@Example.com" };
    expect(decideAction({ ...base, tier: "email", requireWriteApproval: false, args: toCustomer }).run).toBe(true);
    expect(decideAction({ ...base, tier: "email", requireWriteApproval: true, args: toCustomer }).run).toBe(false);
    expect(
      decideAction({ ...base, tier: "email", requireWriteApproval: false, args: { ...toCustomer, cc: ["x@y.com"] } }).run,
    ).toBe(false);
    expect(
      decideAction({ tier: "email", requireWriteApproval: false, args: toCustomer, customerEmail: null }).run,
    ).toBe(false);
    expect(decideAction({ ...base, tier: "email", requireWriteApproval: false, args: { thread_id: "t1" } }).run).toBe(false);
  });
});
