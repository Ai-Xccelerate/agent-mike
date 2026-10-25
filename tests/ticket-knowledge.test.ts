import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "@/lib/tools-integrations/composio-client";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";
import {
  RESOLVED_TICKETS_TOOL_NAME,
  adfToText,
  fetchRedactedResolvedTickets,
  issueFromGetResult,
  keysFromSearchResult,
  redactIssue,
  resolvedTicketsJql,
} from "@/lib/ticket-knowledge";

vi.mock("@/lib/tools-integrations/composio-client", () => ({ executeTool: vi.fn() }));
vi.mock("@/lib/tools-integrations/tool-call-log", () => ({ logToolCall: vi.fn(async () => undefined) }));

const executeToolMock = vi.mocked(executeTool);
const logMock = vi.mocked(logToolCall);

const adf = (text: string) => ({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

function issue(over: Record<string, unknown> = {}) {
  return {
    key: "EESD-101",
    fields: {
      summary: "Cannot log in to MyAPP",
      description: adf("Dana Smith (dana.smith@acme.com, 416-555-0188) cannot log in. Case 20481377."),
      issuetype: { name: "Report a Bug" },
      priority: { name: "High" },
      reporter: { accountId: "r1", displayName: "Dana Smith" },
      creator: { accountId: "r1", displayName: "Dana Smith" },
      assignee: { accountId: "t1", displayName: "Asif Khan" },
      resolutiondate: "2026-09-30T10:00:00.000+0000",
      comment: {
        comments: [
          { author: { accountId: "r1", displayName: "Dana Smith" }, body: adf("Still broken, thanks Asif") },
          { author: { accountId: "t1", displayName: "Asif Khan" }, body: adf("Hi Dana, we reset the account lock in Administration. Asif") },
        ],
      },
      ...over,
    },
  };
}

beforeEach(() => {
  executeToolMock.mockReset();
  logMock.mockClear();
});

describe("adfToText", () => {
  it("flattens Atlassian Document Format and passes plain text through", () => {
    expect(adfToText(adf("Hello"))).toBe("Hello\n");
    expect(adfToText("wiki text")).toBe("wiki text");
    expect(adfToText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "x", text: "@Dana" } }, { type: "text", text: " hi" }] }] })).toBe("[name] hi\n");
    expect(adfToText(null)).toBe("");
  });
});

describe("redactIssue", () => {
  it("returns the redacted problem and the team's reply, with every person's name removed", () => {
    const { ticket } = redactIssue(issue());
    expect(ticket).toMatchObject({ requestType: "Report a Bug", priority: "High" });
    expect(ticket?.problem).toContain("Cannot log in to MyAPP");
    expect(ticket?.resolution).toContain("we reset the account lock in Administration");
    const everything = JSON.stringify(ticket);
    for (const secret of ["Dana", "Smith", "Asif", "Khan", "acme.com", "416", "20481377"]) expect(everything).not.toContain(secret);
  });

  it("takes the resolution only from people other than the reporter", () => {
    const { ticket } = redactIssue(issue());
    expect(ticket?.resolution).not.toContain("Still broken");
  });

  it("leaves out a ticket that mentions health or identity documents, and says so", () => {
    expect(redactIssue(issue({ description: adf("The diagnosis field is empty") })).reason).toBe("sensitive");
    expect(redactIssue(issue({ comment: { comments: [{ author: { accountId: "t1" }, body: adf("Updated her date of birth") }] } })).reason).toBe("sensitive");
  });

  it("leaves out a ticket with nothing to write from", () => {
    expect(redactIssue({ fields: {} }).reason).toBe("empty");
    expect(redactIssue({ key: "X-1" }).reason).toBe("empty");
  });

  it("works with wiki-text descriptions and no comments", () => {
    const { ticket } = redactIssue(issue({ description: "Plain text for 25 forms", comment: undefined }));
    expect(ticket?.problem).toContain("Plain text for 25 forms");
    expect(ticket?.resolution).toBeNull();
  });

  it("holds back a ticket whose text may still hold a name, so it is never passed on", () => {
    const result = redactIssue(issue({ description: adf("Tested together with Jordan Whitfield last week") }));
    expect(result.ticket).toBeNull();
    expect(result.reason).toBe("review");
  });
});

/** Tickets shaped like the ones that slipped through the first version. Every name, number and password here is made up. */
describe("tickets that slipped through the first version", () => {
  it("drops a ticket whose reply contains a password, and a username", () => {
    const withPassword = redactIssue(issue({ comment: { comments: [{ author: { accountId: "t1", displayName: "Asif Khan" }, body: adf("I have reset her password to Ab3dEf6Gh9. Let us know.") }] } }));
    expect(withPassword.ticket).toBeNull();
    expect(withPassword.reason).toBe("sensitive");

    const withUsername = redactIssue(issue({ description: adf("Please reset username jdoe123 for the portal") }));
    expect(withUsername.ticket).toBeNull();
    expect(withUsername.reason).toBe("sensitive");
  });

  it("drops a ticket that is a person's name in the title and a username in the body", () => {
    const result = redactIssue(issue({ summary: "Reset Jane Doe Parallels Password", description: adf("Hello, please reset username jdoe parallels password") }));
    expect(result.ticket).toBeNull();
  });

  it("drops database work", () => {
    const result = redactIssue(
      issue({ comment: { comments: [{ author: { accountId: "t1" }, body: adf("select * from ServiceAuthorization a inner join Base b on a.Oid = b.Oid where a.Number = 5") }] } }),
    );
    expect(result.reason).toBe("internal");
  });

  it("holds back a ticket that mentions a company with odd capitals or a bare web address", () => {
    expect(redactIssue(issue({ description: adf("If no response in 2 days call MYgroup at 416-555-0188") })).reason).toBe("review");
    expect(redactIssue(issue({ summary: "Integration with a vendor", description: adf("Please integrate with GoRendezvous") })).reason).toBe("review");
  });

  it("still passes a clean how-to ticket, with template placeholders and plain wording", () => {
    const { ticket } = redactIssue(
      issue({
        summary: "add authorization number to text message",
        description: adf("Current text: Please call {PrimaryCounselor} at {ProviderPrimaryPhone}. I would like to add the authorization number to the message."),
        comment: { comments: [{ author: { accountId: "t1", displayName: "Asif Khan" }, body: adf("We will add a new placeholder for the authorization number in the email and sms template.") }] },
      }),
    );
    expect(ticket?.problem).toContain("authorization number");
    expect(ticket?.resolution).toContain("new placeholder");
  });
});

/** Composio's flat search record: no `fields` wrapper, no comments. Its text is raw and must never be used. */
const flatHit = (key: string) => ({
  id: "1",
  key,
  summary: "Dana Smith cannot log in",
  description: "Dana Smith, dana.smith@acme.com, 416-555-0188, case 20481377",
  issue_type: { id: "1", name: "Report a Bug" },
  priority: { id: "2", name: "High" },
  reporter: { account_id: "r1", display_name: "Dana Smith" },
  status: { id: "3", name: "Done", category: "done" },
  created: "2026-09-01T00:00:00.000+0000",
  updated: "2026-09-30T00:00:00.000+0000",
});

const searchReply = (keys: string[], nextPageToken?: string) => ({
  successful: true,
  error: null,
  data: { issues: keys.map(flatHit), total: keys.length, max_results: 10, jql_used: "x", search_method: "jql", ...(nextPageToken ? { next_page_token: nextPageToken } : {}) },
});

const getReply = (over: Record<string, unknown> = {}) => ({ successful: true, error: null, data: issue(over) });

describe("keysFromSearchResult", () => {
  it("takes only the keys and the paging token from Composio's flat search result", () => {
    const found = keysFromSearchResult(searchReply(["EESD-1", "EESD-2"], "tok123"));
    expect(found).toEqual({ keys: ["EESD-1", "EESD-2"], nextPageToken: "tok123" });
  });

  it("drops anything that isn't an issue key, and reports no token when there isn't one", () => {
    const found = keysFromSearchResult({ data: { issues: [{ key: "EESD-1" }, { key: 'x" OR 1=1' }, { summary: "no key" }] } });
    expect(found).toEqual({ keys: ["EESD-1"], nextPageToken: null });
  });

  it("returns null for a shape it doesn't recognise", () => {
    expect(keysFromSearchResult({ data: { message: "nope" } })).toBeNull();
    expect(keysFromSearchResult(null)).toBeNull();
  });
});

describe("issueFromGetResult", () => {
  it("finds the issue in the reply, one level deeper, or bare", () => {
    expect(issueFromGetResult({ data: issue() })).toBeTruthy();
    expect(issueFromGetResult({ data: { data: issue() } })).toBeTruthy();
    expect(issueFromGetResult(issue())).toBeTruthy();
    expect(issueFromGetResult({ data: { message: "no" } })).toBeNull();
  });
});

describe("resolvedTicketsJql", () => {
  it("asks for resolved tickets in the project, newest first", () => {
    expect(resolvedTicketsJql("EESD")).toBe('project = "EESD" AND statusCategory = Done ORDER BY resolved DESC');
  });
});

describe("fetchRedactedResolvedTickets", () => {
  const base = { organizationId: "org-1", connectedAccountId: "ca_1", projectKey: "eesd", limit: 5, nextPageToken: null };
  const RAW = ["Dana", "Smith", "Asif", "Khan", "acme.com", "20481377", "416-555"];

  function jira(searchResult: unknown, getResult: (key: string) => unknown) {
    executeToolMock.mockImplementation((async (slug: string, args: Record<string, unknown>) => {
      if (slug === "JIRA_SEARCH_ISSUES") return searchResult;
      if (slug === "JIRA_GET_ISSUE") return getResult(String(args.issue_id_or_key));
      throw new Error(`unexpected tool ${slug}`);
    }) as never);
  }

  it("searches for keys, reads each ticket, and returns only redacted text; nothing raw is returned or logged", async () => {
    jira(searchReply(["EESD-1", "EESD-2"], "next-tok"), () => getReply());
    const out = await fetchRedactedResolvedTickets(base);

    const calls = executeToolMock.mock.calls;
    expect(calls[0][0]).toBe("JIRA_SEARCH_ISSUES");
    expect(calls[0][1]).toMatchObject({ jql: 'project = "EESD" AND statusCategory = Done ORDER BY resolved DESC', max_results: 5 });
    expect(calls.slice(1).map((c) => [c[0], (c[1] as Record<string, unknown>).issue_id_or_key])).toEqual([
      ["JIRA_GET_ISSUE", "EESD-1"],
      ["JIRA_GET_ISSUE", "EESD-2"],
    ]);

    const parsed = JSON.parse(out);
    expect(parsed.tickets).toHaveLength(2);
    expect(parsed.nextPageToken).toBe("next-tok");
    expect(parsed.tickets[0].resolution).toContain("account lock");
    for (const secret of RAW) expect(out).not.toContain(secret);

    const logged = JSON.stringify(logMock.mock.calls);
    for (const secret of [...RAW, "account lock"]) expect(logged).not.toContain(secret);
    expect(logMock.mock.calls[0][0]).toMatchObject({ toolId: RESOLVED_TICKETS_TOOL_NAME, status: "success", output: { returned: 2, unreadable: 0 } });
  });

  it("uses nothing from the flat search records except the keys", async () => {
    jira(searchReply(["EESD-1"]), () => getReply({ summary: "Report export fails", description: adf("Export to Excel returns an error") }));
    const out = await fetchRedactedResolvedTickets(base);
    expect(out).toContain("Report export fails");
    expect(out).not.toContain("cannot log in");
  });

  it("passes the page token on to continue a batch", async () => {
    jira(searchReply([]), () => getReply());
    await fetchRedactedResolvedTickets({ ...base, nextPageToken: "abc123==" });
    expect(executeToolMock.mock.calls[0][1]).toMatchObject({ next_page_token: "abc123==" });
  });

  it("accepts the punctuation a real Jira paging token carries", async () => {
    jira(searchReply([]), () => getReply());
    await fetchRedactedResolvedTickets({ ...base, nextPageToken: "Ch4IAVIg:w~Q*9%3D!@#$&,;|{}[]" });
    expect(executeToolMock.mock.calls[0][1]).toMatchObject({ next_page_token: "Ch4IAVIg:w~Q*9%3D!@#$&,;|{}[]" });
  });

  it("refuses a page token with odd characters, so nothing can be injected and nothing silently restarts at page 1", async () => {
    jira(searchReply([]), () => getReply());
    const out = await fetchRedactedResolvedTickets({ ...base, nextPageToken: 'x" OR project = "Y' });
    expect(out).toContain("paging token isn't valid");
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it("counts sensitive, empty and unreadable tickets separately", async () => {
    jira(searchReply(["EESD-1", "EESD-2", "EESD-3", "EESD-4", "EESD-5"]), (key) => {
      if (key === "EESD-1") return getReply();
      if (key === "EESD-2") return getReply({ description: adf("diagnosis field is empty") });
      if (key === "EESD-3") return { successful: true, error: null, data: { id: "3", key: "EESD-3", fields: {} } };
      if (key === "EESD-4") return { successful: false, error: "403 Dana Smith", data: {} };
      throw new Error("boom Dana Smith");
    });
    const parsed = JSON.parse(await fetchRedactedResolvedTickets(base));
    expect(parsed).toMatchObject({ excludedSensitive: 1, excludedInternal: 0, heldBackForReview: 0, excludedEmpty: 1, unreadable: 2 });
    expect(parsed.tickets).toHaveLength(1);
    expect(JSON.stringify(logMock.mock.calls)).not.toContain("Dana");
  });

  it("rejects a bad project key without calling Jira", async () => {
    expect(await fetchRedactedResolvedTickets({ ...base, projectKey: 'EESD" OR 1=1' })).toMatch(/valid Jira project key/);
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it("caps the limit", async () => {
    jira(searchReply([]), () => getReply());
    await fetchRedactedResolvedTickets({ ...base, limit: 500 });
    expect(executeToolMock.mock.calls[0][1]).toMatchObject({ max_results: 25 });
  });

  it("says so, without the raw result, when the search is refused, fails or comes back oddly", async () => {
    executeToolMock.mockResolvedValueOnce({ successful: false, error: "secret detail Dana Smith", data: {} });
    expect(await fetchRedactedResolvedTickets(base)).toMatch(/refused/);

    executeToolMock.mockRejectedValueOnce(new Error("boom Dana Smith"));
    expect(await fetchRedactedResolvedTickets(base)).toMatch(/failed/);

    executeToolMock.mockResolvedValueOnce({ successful: true, error: null, data: { weird: "Dana Smith" } });
    expect(await fetchRedactedResolvedTickets(base)).toMatch(/not in a shape/);

    expect(JSON.stringify(logMock.mock.calls)).not.toContain("Dana");
    expect(logMock.mock.calls.map((call) => call[0].status)).toEqual(["error", "error", "error"]);
  });
});

describe("redactIssue as a conversation", () => {
  const threaded = (comments: unknown[], over: Record<string, unknown> = {}) =>
    issue({
      summary: "Preview button does nothing",
      description: adf("Hi, I'm Dana Smith. The Preview button does nothing when I run the duplicates report."),
      comment: { comments },
      ...over,
    });
  const customer = (text: string, created: string) => ({ author: { accountId: "r1", displayName: "Dana Smith" }, body: adf(text), created, jsdPublic: true });
  const team = (text: string, created: string, over: Record<string, unknown> = {}) => ({ author: { accountId: "t1", displayName: "Asif Khan" }, body: adf(text), created, jsdPublic: true, ...over });

  it("returns the customer's messages and the team's replies in order, with roles", () => {
    const { ticket } = redactIssue(
      threaded([
        team("Can you tell me which browser you use?", "2026-09-30T10:00:00.000+0000"),
        customer("Chrome. Same on Edge.", "2026-09-30T10:05:00.000+0000"),
        team("We applied a fix, please try again.", "2026-09-30T11:00:00.000+0000"),
      ]),
      { turns: true, keepRequesterFirstName: true },
    );
    expect(ticket?.turns?.map((t) => t.from)).toEqual(["customer", "team", "customer", "team"]);
    expect(ticket?.turns?.[0].text).toContain("Preview button does nothing");
    expect(ticket?.turns?.[2].text).toBe("Chrome. Same on Edge.");
  });

  it("sorts by time, not by the order Jira listed them", () => {
    const { ticket } = redactIssue(threaded([team("Second.", "2026-09-30T12:00:00.000+0000"), team("First.", "2026-09-30T09:00:00.000+0000")]), { turns: true });
    expect(ticket?.turns?.map((t) => t.text).slice(1)).toEqual(["First.", "Second."]);
  });

  it("leaves out internal notes and automatic messages", () => {
    const { ticket } = redactIssue(
      threaded([
        team("Internal: check the report cache", "2026-09-30T10:00:00.000+0000", { jsdPublic: false }),
        team("This is an automated message. Greetings, we haven't heard from you in a while.", "2026-09-30T10:10:00.000+0000"),
        team("Please try again now.", "2026-09-30T10:20:00.000+0000"),
      ]),
      { turns: true },
    );
    expect(ticket?.turns?.map((t) => t.text).slice(1)).toEqual(["Please try again now."]);
  });

  it("keeps the requester's first name, and removes the surname and the team's names", () => {
    const { ticket } = redactIssue(
      threaded([
        team("Hi Dana, this is Asif Khan. We looked at your report.", "2026-09-30T10:00:00.000+0000"),
        customer("Thanks Dana Smith here again, it works now.", "2026-09-30T10:30:00.000+0000"),
      ]),
      { turns: true, keepRequesterFirstName: true },
    );
    const all = ticket?.turns?.map((t) => t.text).join(" ") ?? "";
    expect(all).toContain("Dana");
    expect(all).not.toContain("Smith");
    expect(all).not.toContain("Asif");
    expect(all).not.toContain("Khan");
  });

  it("holds the ticket for review when an unknown person's name is in a reply", () => {
    const { ticket, reason } = redactIssue(threaded([team("Hi Dana, we checked with Priya Raman on your report.", "2026-09-30T10:00:00.000+0000")]), { turns: true, keepRequesterFirstName: true });
    expect(ticket).toBeNull();
    expect(reason).toBe("review");
  });

  it("removes the requester's name entirely when the first name is not asked for", () => {
    const { ticket } = redactIssue(threaded([customer("Thanks, Dana", "2026-09-30T10:00:00.000+0000")]), { turns: true });
    expect((ticket?.turns ?? []).map((t) => t.text).join(" ")).not.toContain("Dana");
  });

  it("drops the whole ticket when a later reply mentions health details", () => {
    const { ticket, reason } = redactIssue(threaded([team("Was this about a client's diagnosis?", "2026-09-30T10:00:00.000+0000")]), { turns: true });
    expect(ticket).toBeNull();
    expect(reason).toBe("sensitive");
  });

  it("gives no turns unless they are asked for", () => {
    expect(redactIssue(threaded([])).ticket).not.toHaveProperty("turns");
  });
});

describe("a login name written straight after 'user'", () => {
  it("is caught, so the ticket is left out", () => {
    expect(redactIssue(issue({ summary: "User mhales unable to open system", description: adf("Cannot open it.") })).reason).toBe("sensitive");
  });

  it("does not catch ordinary words after 'user'", () => {
    for (const text of ["User cannot open the system", "The user guide says to restart", "A user is locked out of the report"]) {
      expect(redactIssue(issue({ summary: text, description: adf("It happens daily."), comment: { comments: [] } })).ticket, text).not.toBeNull();
    }
  });
});
