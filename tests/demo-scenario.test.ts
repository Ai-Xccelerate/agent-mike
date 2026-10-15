import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { checkExpectations, checkTarget, parseScenario, productionHosts, summarizeReply } from "../scripts/demo-scenario-lib.mjs";

const SCENARIOS_DIR = join(__dirname, "..", "docs", "demo-scenarios");
const valid = {
  name: "office-outage",
  description: "A whole office cannot log in.",
  approved: true,
  turns: [{ say: "Nobody can log in" }],
  expect: { finalStatus: "needs_human", ticketRaised: true, mustMention: ["1-905"] },
};

describe("the scenario files in the repo", () => {
  const files = readdirSync(SCENARIOS_DIR).filter((name) => name.endsWith(".json"));

  it("has at least the approved demo scenarios", () => {
    expect(files).toEqual(expect.arrayContaining(["how-to-reset-password.json", "office-outage.json"]));
  });

  for (const file of files) {
    it(`${file} is valid and named after its file`, () => {
      const scenario = parseScenario(JSON.parse(readFileSync(join(SCENARIOS_DIR, file), "utf8")));
      expect(`${scenario.name}.json`).toBe(file);
    });
  }
});

describe("parseScenario", () => {
  it("accepts a good scenario and defaults expect to empty", () => {
    expect(parseScenario(valid).turns).toHaveLength(1);
    expect(parseScenario({ ...valid, expect: undefined }).expect).toEqual({});
  });

  it.each([
    ["not an object", [] as unknown],
    ["a bad name", { ...valid, name: "Office Outage" }],
    ["no description", { ...valid, description: " " }],
    ["approved not a boolean", { ...valid, approved: "yes" }],
    ["no turns", { ...valid, turns: [] }],
    ["a blank turn", { ...valid, turns: [{ say: "  " }] }],
    ["a turn that is too long", { ...valid, turns: [{ say: "x".repeat(4001) }] }],
    ["a bad finalStatus", { ...valid, expect: { finalStatus: "closed" } }],
    ["mustMention not a list of strings", { ...valid, expect: { mustMention: [1] } }],
    ["a blank requestType", { ...valid, expect: { requestType: " " } }],
  ])("rejects %s", (_label, scenario) => {
    expect(() => parseScenario(scenario)).toThrow(/Invalid scenario/);
  });
});

describe("checkTarget", () => {
  const staging = "https://mike-api-staging.aiworkforce.md";
  const production = "https://mike-api.aiworkforce.md";

  it("lets any scenario run on staging or locally, approved or not", () => {
    expect(checkTarget({ apiUrl: staging, scenario: { ...valid, approved: false }, productionFlag: false })).toMatchObject({ ok: true, production: false });
    expect(checkTarget({ apiUrl: "http://localhost:3000", scenario: { ...valid, approved: false }, productionFlag: false }).ok).toBe(true);
  });

  it("will not run an unapproved scenario on production, even with the flag", () => {
    const result = checkTarget({ apiUrl: production, scenario: { ...valid, approved: false }, productionFlag: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not approved/);
  });

  it("will not run an approved scenario on production without the flag", () => {
    const result = checkTarget({ apiUrl: production, scenario: valid, productionFlag: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/--production/);
  });

  it("runs an approved scenario on production with the flag", () => {
    expect(checkTarget({ apiUrl: production, scenario: valid, productionFlag: true })).toMatchObject({ ok: true, production: true });
  });

  it("matches the production host whatever the case or path, and honours extra hosts", () => {
    expect(checkTarget({ apiUrl: "https://MIKE-API.aiworkforce.md/api/v1", scenario: { ...valid, approved: false }, productionFlag: true }).ok).toBe(false);
    const env = { DEMO_PRODUCTION_HOSTS: "other.example.com, third.example.com" } as unknown as NodeJS.ProcessEnv;
    expect(productionHosts(env)).toEqual(["mike-api.aiworkforce.md", "other.example.com", "third.example.com"]);
    expect(checkTarget({ apiUrl: "https://other.example.com", scenario: { ...valid, approved: false }, productionFlag: true, env }).ok).toBe(false);
  });

  it("refuses a URL it cannot read", () => {
    expect(checkTarget({ apiUrl: "not a url", scenario: valid, productionFlag: true }).ok).toBe(false);
  });
});

describe("summarizeReply and checkExpectations", () => {
  const raised = summarizeReply({
    conversation_id: "c1",
    status: "needs_human",
    escalated: true,
    message: { body: "Please call 1-905-702-1380.", cards: [{ kind: "helpdesk_ticket", data: { key: "EAPR-6" } }] },
  });
  const plain = summarizeReply({ conversation_id: "c2", status: "open", message: { body: "Which product?", cards: [{ kind: "choices" }] } });

  it("reads status, text and the ticket key out of a chat reply", () => {
    expect(raised).toMatchObject({ status: "needs_human", ticketKey: "EAPR-6", conversationId: "c1", escalated: true });
    expect(plain).toMatchObject({ status: "open", ticketKey: null });
    expect(summarizeReply({})).toMatchObject({ status: null, body: "", ticketKey: null });
  });

  it("passes when everything expected happened", () => {
    expect(checkExpectations(valid.expect, [raised])).toEqual([]);
    expect(checkExpectations({ finalStatus: "open", ticketRaised: false }, [plain])).toEqual([]);
  });

  it("names each thing that did not happen", () => {
    expect(checkExpectations({ finalStatus: "open", ticketRaised: true, mustMention: ["refund"] }, [raised])).toEqual([
      "the conversation ended needs_human, expected open",
      'no reply mentioned "refund"',
    ]);
    expect(checkExpectations({ ticketRaised: true }, [plain])).toEqual(["no helpdesk ticket was raised"]);
    expect(checkExpectations({ ticketRaised: false }, [raised])).toEqual(["a helpdesk ticket was raised and should not have been"]);
  });

  it("checks the ticket across all turns, but the status on the last", () => {
    expect(checkExpectations({ finalStatus: "needs_human", ticketRaised: true }, [raised, summarizeReply({ status: "needs_human", message: { body: "Thanks", cards: [] } })])).toEqual([]);
  });

  it("checks the request type on the ticket that was raised", () => {
    const typed = summarizeReply({ status: "needs_human", message: { body: "Logged.", cards: [{ kind: "helpdesk_ticket", data: { key: "EAPR-9", requestType: "Report a Bug" } }] } });
    expect(typed.requestType).toBe("Report a Bug");
    expect(checkExpectations({ requestType: "report a bug" }, [typed])).toEqual([]);
    expect(checkExpectations({ requestType: "System Unavailable" }, [typed])).toEqual(["the ticket was raised as Report a Bug, expected System Unavailable"]);
    expect(checkExpectations({ requestType: "Report a Bug" }, [plain])).toEqual(["no ticket named a request type, expected Report a Bug"]);
  });

  it("matches phrases case-insensitively and fails with no replies", () => {
    expect(checkExpectations({ mustMention: ["PLEASE CALL"] }, [raised])).toEqual([]);
    expect(checkExpectations({}, [])).toEqual(["no reply came back"]);
  });
});
