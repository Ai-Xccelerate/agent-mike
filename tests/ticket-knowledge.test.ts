import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "@/lib/tools-integrations/composio-client";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";
import {
  RESOLVED_TICKETS_TOOL_NAME,
  adfToText,
  fetchRedactedResolvedTickets,
  redactIssue,
  redactSearchResult,
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

  it("flags text that may still hold a name", () => {
    const { ticket } = redactIssue(issue({ description: adf("Tested together with Jordan Whitfield last week") }));
    expect(ticket?.checkForNames).toBe(true);
  });
});

describe("redactSearchResult", () => {
  it("reads the common result envelopes", () => {
    for (const shape of [{ data: { issues: [issue()] } }, { data: { data: { issues: [issue()] } } }, { issues: [issue()] }]) {
      expect(redactSearchResult(shape, 10)?.tickets).toHaveLength(1);
    }
  });

  it("returns null for a shape it doesn't recognise, rather than guessing", () => {
    expect(redactSearchResult({ data: { message: "nope" } }, 10)).toBeNull();
    expect(redactSearchResult(null, 10)).toBeNull();
  });

  it("counts exclusions, applies the limit and reports the oldest resolution date", () => {
    const result = redactSearchResult(
      {
        data: {
          issues: [
            issue(),
            issue({ description: adf("diagnosis"), resolutiondate: "2026-09-01T00:00:00.000+0000" }),
            { fields: {} },
            issue({ resolutiondate: "2026-08-15T00:00:00.000+0000" }),
          ],
        },
      },
      3,
    );
    expect(result).toMatchObject({ excludedSensitive: 1, excludedEmpty: 1, oldestResolved: "2026-09-01T00:00:00.000+0000" });
    expect(result?.tickets).toHaveLength(1);
  });
});

describe("resolvedTicketsJql", () => {
  it("asks for resolved tickets, newest first, and pages by date", () => {
    expect(resolvedTicketsJql("EESD", null)).toBe('project = "EESD" AND statusCategory = Done ORDER BY resolved DESC');
    expect(resolvedTicketsJql("EESD", "2026-09-01")).toBe('project = "EESD" AND statusCategory = Done AND resolved < "2026-09-01" ORDER BY resolved DESC');
  });

  it("ignores a date that isn't a plain date, so nothing can be injected into the query", () => {
    expect(resolvedTicketsJql("EESD", '2026-09-01" OR project = "X')).toBe('project = "EESD" AND statusCategory = Done ORDER BY resolved DESC');
  });
});

describe("fetchRedactedResolvedTickets", () => {
  const base = { organizationId: "org-1", connectedAccountId: "ca_1", projectKey: "eesd", limit: 5, resolvedBefore: null };

  it("searches read-only, returns only redacted text, and never logs the raw result", async () => {
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { issues: [issue()] } });
    const out = await fetchRedactedResolvedTickets(base);

    expect(executeToolMock).toHaveBeenCalledTimes(1);
    const [slug, args] = executeToolMock.mock.calls[0];
    expect(slug).toBe("JIRA_SEARCH_ISSUES");
    expect(args).toMatchObject({ jql: 'project = "EESD" AND statusCategory = Done ORDER BY resolved DESC', max_results: 5 });

    for (const secret of ["Dana", "Smith", "Asif", "acme.com", "20481377"]) expect(out).not.toContain(secret);
    expect(JSON.parse(out).tickets).toHaveLength(1);

    const logged = JSON.stringify(logMock.mock.calls);
    for (const secret of ["Dana", "Smith", "Asif", "acme.com", "20481377", "account lock"]) expect(logged).not.toContain(secret);
    expect(logMock.mock.calls[0][0]).toMatchObject({ toolId: RESOLVED_TICKETS_TOOL_NAME, status: "success", output: { returned: 1 } });
  });

  it("rejects a bad project key without calling Jira", async () => {
    expect(await fetchRedactedResolvedTickets({ ...base, projectKey: 'EESD" OR 1=1' })).toMatch(/valid Jira project key/);
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it("caps the limit", async () => {
    executeToolMock.mockResolvedValue({ successful: true, error: null, data: { issues: [] } });
    await fetchRedactedResolvedTickets({ ...base, limit: 500 });
    expect(executeToolMock.mock.calls[0][1]).toMatchObject({ max_results: 25 });
  });

  it("says so, without the raw result, when Jira refuses, fails or answers oddly", async () => {
    executeToolMock.mockResolvedValueOnce({ successful: false, error: "secret detail Dana Smith", data: {} });
    expect(await fetchRedactedResolvedTickets(base)).toMatch(/refused/);

    executeToolMock.mockRejectedValueOnce(new Error("boom Dana Smith"));
    expect(await fetchRedactedResolvedTickets(base)).toMatch(/failed/);

    executeToolMock.mockResolvedValueOnce({ successful: true, error: null, data: { weird: "Dana Smith" } });
    const odd = await fetchRedactedResolvedTickets(base);
    expect(odd).toMatch(/not in a shape/);

    expect(JSON.stringify(logMock.mock.calls)).not.toContain("Dana");
    expect(logMock.mock.calls.map((call) => call[0].status)).toEqual(["error", "error", "error"]);
  });
});
