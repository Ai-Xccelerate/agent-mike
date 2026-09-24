import { describe, expect, it } from "vitest";
import type { workerProfiles } from "@/db/schema";
import {
  auditWorkerConfiguration,
  formatConfigurationSnapshot,
  type ConfigurationSnapshot,
} from "@/lib/assistant-config-audit";
import type { IntegrationStatus } from "@/lib/integrations";

type Profile = typeof workerProfiles.$inferSelect;

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    displayName: "Mike",
    status: "active",
    role: "Answer billing and account questions for Acme customers.",
    jobDescription: null,
    tone: "Warm",
    model: "gpt-5.6-luna",
    maxAgentTurns: 3,
    confidenceThreshold: 0.72,
    escalationTerms: ["refund", "lawyer"],
    requireUserVerification: false,
    assistantActionsEnabled: true,
    managerName: "Charan",
    managerEmail: "charan@example.com",
    channelsConfig: { chat: true, email: false, voice: false },
    toolsConfig: { internet_search: false, browser_use: false },
    allowedDomains: [],
    enabledSkills: [],
    ...overrides,
  } as Profile;
}

function internal(overrides: Partial<IntegrationStatus> & { key: string; name: string }): IntegrationStatus {
  return {
    description: "",
    available: true,
    enabled: false,
    active: false,
    unavailableReason: null,
    settings: {},
    ...overrides,
  } as IntegrationStatus;
}

function snapshot(overrides: Partial<ConfigurationSnapshot> = {}): ConfigurationSnapshot {
  return {
    profile: profile(),
    knowledgeCount: 4,
    mailbox: null,
    integrationConnections: { crm: null },
    internalIntegrations: [internal({ key: "parchment", name: "Parchment", enabled: true, active: true })],
    skills: [],
    emailDomains: { approved: 0, pending: 0 },
    realConversationCount: 3,
    ...overrides,
  };
}

const issues = (s: ConfigurationSnapshot) => auditWorkerConfiguration(s).map((f) => `${f.severity}:${f.area}`);

describe("auditWorkerConfiguration", () => {
  it("finds nothing to fix on a well-configured worker", () => {
    expect(auditWorkerConfiguration(snapshot())).toEqual([]);
  });

  it("flags the placeholder role as a blocker the assistant can propose a fix for", () => {
    const findings = auditWorkerConfiguration(
      snapshot({ profile: profile({ role: "Configure this worker's role and responsibilities." }) }),
    );
    expect(findings[0]).toMatchObject({ severity: "blocker", area: "Role" });
    expect(findings[0].fix).toContain("propose_role_change");
  });

  it("flags no knowledge at all as a blocker, but only a tip when a source is connected", () => {
    const none = snapshot({ knowledgeCount: 0, internalIntegrations: [] });
    expect(issues(none)).toContain("blocker:Knowledge");
    expect(issues(snapshot({ knowledgeCount: 0 }))).toContain("tip:Knowledge");
  });

  it("flags email on without a connected mailbox or approved domains", () => {
    const s = snapshot({ profile: profile({ channelsConfig: { chat: true, email: true, voice: false } }) });
    expect(issues(s)).toEqual(expect.arrayContaining(["blocker:Channels", "warning:Email domains"]));
    const reconnect = auditWorkerConfiguration({ ...s, mailbox: { connected: false, email: "a@b.co" } });
    expect(reconnect.find((f) => f.area === "Channels")?.issue).toContain("needs reconnecting");
  });

  it("doesn't tie outbound email domains to chat, but warns when a sender allowlist would block chat visitors", () => {
    const approvedOnly = auditWorkerConfiguration(snapshot({ emailDomains: { approved: 2, pending: 0 } }));
    expect(approvedOnly.filter((f) => f.area === "Email domains" || f.area === "Guardrails")).toEqual([]);
    expect(issues(snapshot({ emailDomains: { approved: 0, pending: 1 } }))).toContain("tip:Email domains");

    const restricted = auditWorkerConfiguration(snapshot({ profile: profile({ allowedDomains: ["acme.com"] }) }));
    expect(restricted.find((f) => f.area === "Guardrails")?.issue).toContain("every chat message will be handed to a human");
    const noChat = auditWorkerConfiguration(
      snapshot({ profile: profile({ allowedDomains: ["acme.com"], channelsConfig: { chat: false, email: false, voice: false } }) }),
    );
    expect(noChat.some((f) => f.area === "Guardrails")).toBe(false);
  });

  it("flags an enabled skill whose integration isn't connected, and verification without its skill", () => {
    const findings = auditWorkerConfiguration(
      snapshot({
        profile: profile({ requireUserVerification: true }),
        skills: [
          { id: "stay-on-topic", name: "Stay on topic", description: "", requires: ["crm"], requirementsMet: false, enabled: true, source: "catalog" },
          { id: "verify-customer", name: "Verify customer", description: "", requires: ["crm"], requirementsMet: false, enabled: false, source: "catalog" },
        ],
      }),
    );
    expect(findings.some((f) => f.area === "Skills" && f.issue.includes("Stay on topic"))).toBe(true);
    expect(findings.some((f) => f.area === "Guardrails" && f.issue.includes("verify-customer"))).toBe(true);
  });

  it("is honest about stored-but-unwired settings", () => {
    const findings = auditWorkerConfiguration(
      snapshot({
        profile: profile({
          status: "paused",
          managerEmail: null,
          toolsConfig: { browser_use: true },
        }),
      }),
    );
    expect(findings.find((f) => f.area === "Identity")?.issue).toContain("isn't enforced");
    expect(findings.find((f) => f.area === "Human manager")?.issue).toContain("aren't sent yet");
    expect(findings.some((f) => f.issue.includes("Browser use"))).toBe(true);
  });

  it("flags default names, empty escalation terms, bad model, broken integrations, and unavailable tools", () => {
    const findings = issues(
      snapshot({
        profile: profile({ displayName: "AI Worker", managerName: "Manager", escalationTerms: [], model: "gpt-4" }),
        integrationConnections: { crm: "failed" },
        internalIntegrations: [
          internal({ key: "parchment", name: "Parchment", enabled: true, active: true }),
          internal({ key: "scribe", name: "Scribe", enabled: true, available: false, unavailableReason: "Set SCRIBE_API_URL" }),
        ],
      }),
    );
    expect(findings).toEqual(
      expect.arrayContaining([
        "tip:Identity",
        "warning:Human manager",
        "warning:Guardrails",
        "blocker:Agent configuration",
        "warning:Integrations",
        "warning:Tools",
      ]),
    );
  });

  it("orders blockers before warnings before tips", () => {
    const severities = auditWorkerConfiguration(
      snapshot({
        knowledgeCount: 0,
        internalIntegrations: [],
        profile: profile({ displayName: "AI Worker", escalationTerms: [], assistantActionsEnabled: false }),
      }),
    ).map((f) => f.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ["blocker", "warning", "tip"].indexOf(a) - ["blocker", "warning", "tip"].indexOf(b)));
    expect(severities[0]).toBe("blocker");
  });
});

describe("formatConfigurationSnapshot", () => {
  it("lists skills with their ids, on and off, so the assistant can propose toggles", () => {
    const out = formatConfigurationSnapshot(
      snapshot({
        skills: [
          { id: "stay-on-topic", name: "Stay on topic", description: "", requires: [], requirementsMet: true, enabled: true, source: "catalog" },
          { id: "abc-123", name: "Returns", description: "", requires: [], requirementsMet: true, enabled: false, source: "custom" },
        ],
      }),
    );
    expect(out).toContain("Skills enabled: Stay on topic [stay-on-topic]");
    expect(out).toContain("Skills available but off: Returns [abc-123]");
    expect(out).toContain("Mailbox: not connected");
    expect(out).toContain("pausing does not stop replies yet");
  });
});
