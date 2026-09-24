import { beforeEach, describe, expect, it, vi } from "vitest";
import type { workerProfiles } from "@/db/schema";

// A chainable stand-in for drizzle: every builder call returns the chain,
// and awaiting it yields `rows`. Records update/insert so tests can see
// whether anything was written.
// `queue` hands out one result per awaited query, in order, before falling
// back to `rows` - for tests where different queries must see different data.
const dbState = vi.hoisted(() => ({ rows: [] as unknown[], queue: [] as unknown[][], writes: [] as string[] }));
vi.mock("@/lib/db", () => {
  const chain = (): unknown =>
    new Proxy(() => undefined, {
      get: (_target, prop) =>
        prop === "then" ? (resolve: (v: unknown) => void) => resolve(dbState.queue.length ? dbState.queue.shift() : dbState.rows) : chain,
      apply: () => chain(),
    });
  return {
    db: {
      select: () => chain(),
      update: () => {
        dbState.writes.push("update");
        return chain();
      },
      insert: () => {
        dbState.writes.push("insert");
        return chain();
      },
      delete: () => chain(),
    },
  };
});

vi.mock("@/lib/tools-integrations/tool-call-log", () => ({ logToolCall: vi.fn() }));
vi.mock("@/lib/worker-settings", () => ({
  applyWorkerPatch: vi.fn(async () => ({ ok: true, profile: {} })),
  describePatchErrors: vi.fn(() => "invalid"),
}));
vi.mock("@/lib/tools-integrations/approval-repository", () => ({
  createPendingApproval: vi.fn(),
  listPendingApprovals: vi.fn(),
  decideApproval: vi.fn(),
  recordApprovalResult: vi.fn(),
  retirePendingApprovals: vi.fn(),
}));
vi.mock("@/lib/connection-flows", () => ({
  ConnectionFlowError: class extends Error {},
  startIntegrationConnection: vi.fn(async () => ({ redirectUrl: "https://auth.example/zoho" })),
  startMailboxConnection: vi.fn(),
}));
vi.mock("@/lib/assistant-attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant-attachments")>()),
  getConversationAttachment: vi.fn(),
}));

import {
  buildAssistantTools,
  CONFIRM_PENDING_CHANGE_TOOL_NAME,
  livePendingApprovals,
  pendingChangeDetails,
  PENDING_APPROVAL_TTL_MS,
  PROPOSE_CHANNEL_CHANGE_TOOL_NAME,
  PROPOSE_EDIT_KNOWLEDGE_TOOL_NAME,
  PROPOSE_SKILL_FROM_ATTACHMENT_TOOL_NAME,
  READ_ONLY_REPLY,
  PROPOSE_EMAIL_DOMAIN_CHANGE_TOOL_NAME,
  PROPOSE_SETTINGS_CHANGE_TOOL_NAME,
  PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME,
  PROPOSE_MANAGER_CONTACT_CHANGE_TOOL_NAME,
  PROPOSE_ROLE_CHANGE_TOOL_NAME,
  PROPOSE_TONE_CHANGE_TOOL_NAME,
  runAssistantAgent,
  speakable,
  toPendingActionView,
} from "@/lib/assistant-agent";
import {
  createPendingApproval,
  decideApproval,
  listPendingApprovals,
  retirePendingApprovals,
  type ToolApproval,
} from "@/lib/tools-integrations/approval-repository";
import { getConversationAttachment, type AssistantAttachment } from "@/lib/assistant-attachments";

type Profile = typeof workerProfiles.$inferSelect;

const createMock = vi.mocked(createPendingApproval);
const listMock = vi.mocked(listPendingApprovals);
const decideMock = vi.mocked(decideApproval);
const retireMock = vi.mocked(retirePendingApprovals);
const attachmentMock = vi.mocked(getConversationAttachment);

function profile(overrides: Partial<Profile> = {}): Profile {
  return { displayName: "Mike", managerName: "Charan", assistantActionsEnabled: false, model: "gpt-5.6-luna", ...overrides } as Profile;
}

function approval(id: string, toolId: string, input: Record<string, unknown>, ageMs = 0): ToolApproval {
  return {
    id,
    organizationId: "org-1",
    conversationId: "conv-1",
    toolId,
    input,
    status: "pending",
    result: null,
    errorMessage: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date(Date.now() - ageMs),
    updatedAt: new Date(),
  };
}

async function invoke(tools: unknown[], name: string, input: Record<string, unknown>): Promise<string> {
  const found = tools.find((t) => (t as { name?: string }).name === name) as
    | { invoke: (ctx: unknown, raw: string) => Promise<string> }
    | undefined;
  if (!found) throw new Error(`${name} not found`);
  return found.invoke(undefined, JSON.stringify(input));
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = [];
  dbState.queue = [];
  dbState.writes = [];
  let n = 0;
  createMock.mockImplementation(async (entry) => approval(`new-${++n}`, entry.toolId, entry.input));
  listMock.mockResolvedValue([]);
  decideMock.mockImplementation(async (id) => approval(id, "x", {}));
});

describe("proposals", () => {
  it("retires earlier-turn proposals once, when this turn makes its first proposal", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1", { priorPendingIds: ["old-1", "old-2"] });
    await invoke(tools, PROPOSE_ROLE_CHANGE_TOOL_NAME, { newValue: "Billing support", reason: "asked" });
    await invoke(tools, PROPOSE_TONE_CHANGE_TOOL_NAME, { newValue: "Friendly", reason: "asked" });
    expect(retireMock).toHaveBeenCalledTimes(1);
    expect(retireMock).toHaveBeenCalledWith(["old-1", "old-2"], "system:superseded");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("retires nothing when nothing was pending", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const out = await invoke(tools, PROPOSE_ROLE_CHANGE_TOOL_NAME, { newValue: "Billing support", reason: "asked" });
    expect(out).toContain("Waiting for confirmation");
    expect(retireMock).not.toHaveBeenCalled();
  });

  it("refuses to propose turning on voice, which isn't available", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const out = await invoke(tools, PROPOSE_CHANNEL_CHANGE_TOOL_NAME, { channel: "voice", enabled: true, reason: "asked" });
    expect(out).toContain("isn't available yet");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("validates the manager email and requires at least one field", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    expect(
      await invoke(tools, PROPOSE_MANAGER_CONTACT_CHANGE_TOOL_NAME, { managerName: null, managerEmail: "not-an-email", reason: "x" }),
    ).toContain("isn't a valid email");
    expect(
      await invoke(tools, PROPOSE_MANAGER_CONTACT_CHANGE_TOOL_NAME, { managerName: " ", managerEmail: null, reason: "x" }),
    ).toContain("give a new name");
    expect(createMock).not.toHaveBeenCalled();
    await invoke(tools, PROPOSE_MANAGER_CONTACT_CHANGE_TOOL_NAME, { managerName: "Charan Naik", managerEmail: null, reason: "x" });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ managerName: "Charan Naik", managerEmail: null }) }),
    );
  });

  it("only turns a file into knowledge if it was attached in this conversation", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    attachmentMock.mockResolvedValueOnce(null);
    expect(
      await invoke(tools, PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME, {
        attachmentId: "att-x",
        title: "Refunds",
        conceptId: null,
        updateConceptId: null,
        body: null,
        allowOverlap: false,
        reason: "upload",
      }),
    ).toContain("no file with that id");

    attachmentMock.mockResolvedValueOnce({ id: "att-1", filename: "refunds.pdf", extractedText: "Refunds within 30 days." } as AssistantAttachment);
    const out = await invoke(tools, PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME, {
      attachmentId: "att-1",
      title: "Refunds",
      conceptId: null,
      updateConceptId: null,
      body: null,
      allowOverlap: false,
      reason: "upload",
    });
    expect(out).toContain('add a new knowledge article "Refunds" from refunds.pdf');
    expect(attachmentMock).toHaveBeenLastCalledWith("org-1", "conv-1", "att-1");
  });

  it("refuses to update a knowledge article that doesn't exist", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    attachmentMock.mockResolvedValueOnce({ id: "att-1", filename: "refunds.pdf", extractedText: "text" } as AssistantAttachment);
    dbState.rows = [];
    const out = await invoke(tools, PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME, {
      attachmentId: "att-1",
      title: "Refunds",
      conceptId: null,
      updateConceptId: "refund-policy",
      body: null,
      allowOverlap: false,
      reason: "upload",
    });
    expect(out).toContain('no knowledge article with concept id "refund-policy"');
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("settings and email domains", () => {
  const none = {
    displayName: null, name: null, avatarInitials: null, accentColor: null, timezone: null, emailSignature: null,
    jobDescription: null, systemPromptTemplate: null, model: null, maxAgentTurns: null, confidenceThreshold: null,
    requireUserVerification: null, internetSearch: null,
  };

  it("proposes several settings in one change, with before/after on the card", async () => {
    dbState.rows = [{ displayName: "AI Worker", model: "gpt-5.6-luna", confidenceThreshold: 0.72, toolsConfig: {} }];
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const out = await invoke(tools, PROPOSE_SETTINGS_CHANGE_TOOL_NAME, {
      changes: { ...none, displayName: "Mike from Acme", model: "gpt-5.6-sol", confidenceThreshold: 0.8, internetSearch: true },
      reason: "asked",
    });
    expect(out).toContain("set the customer-facing name to Mike from Acme, set the model to gpt-5.6-sol, set the minimum confidence to 0.8 and turn on internet search");
    const input = createMock.mock.calls[0][0].input;
    expect(pendingChangeDetails("assistant_configure_settings", input)).toContain("model: gpt-5.6-luna → gpt-5.6-sol");
  });

  it("rejects values the Settings screens would reject", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    expect(await invoke(tools, PROPOSE_SETTINGS_CHANGE_TOOL_NAME, { changes: { ...none, model: "gpt-4" }, reason: "x" })).toContain(
      "must be one of gpt-5.6-luna, gpt-5.6-sol",
    );
    expect(
      await invoke(tools, PROPOSE_SETTINGS_CHANGE_TOOL_NAME, { changes: { ...none, confidenceThreshold: 0.99 }, reason: "x" }),
    ).toContain("between 0.5 and 0.95");
    expect(await invoke(tools, PROPOSE_SETTINGS_CHANGE_TOOL_NAME, { changes: { ...none, accentColor: "orange" }, reason: "x" })).toContain(
      "Can't propose that: accentColor",
    );
    expect(await invoke(tools, PROPOSE_SETTINGS_CHANGE_TOOL_NAME, { changes: none, reason: "x" })).toContain("no setting");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("normalizes and validates email domains", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    expect(await invoke(tools, PROPOSE_EMAIL_DOMAIN_CHANGE_TOOL_NAME, { domain: "not a domain", decision: "approve", reason: "x" })).toContain(
      "isn't a valid domain",
    );
    const out = await invoke(tools, PROPOSE_EMAIL_DOMAIN_CHANGE_TOOL_NAME, { domain: "https://Acme.com/", decision: "approve", reason: "x" });
    expect(out).toContain("approve the email domain acme.com");
  });
});

describe("knowledge overlap", () => {
  const RETURNS = `# Returns & exchanges
Customers can request a full refund within 30 days of purchase.
Annual plans are refunded pro rata after 30 days.
Exchanges for a different desk size are free within 30 days.
Refunds go back to the original payment method within 5-7 business days.`;

  beforeEach(() => {
    attachmentMock.mockResolvedValue({ id: "att-1", filename: "returns.md", extractedText: RETURNS } as AssistantAttachment);
    dbState.rows = [
      {
        conceptId: "refund-policy",
        title: "Refund policy",
        body: "Customers can request a full refund within 14 days of purchase. Annual plans are refunded pro rata after 14 days. Refunds go back to the original payment method within 5-7 business days.",
      },
      { conceptId: "shipping", title: "Shipping times", body: "Standard shipping takes 3-5 business days in the EU." },
    ];
    // First query: "is there already an article with this file's id?" (no).
    dbState.queue = [[]];
  });

  it("refuses a new article that overlaps an existing one, naming it", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const out = await invoke(tools, PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME, {
      attachmentId: "att-1",
      title: "Returns & exchanges",
      conceptId: null,
      updateConceptId: null,
      body: null,
      allowOverlap: false,
      reason: "upload",
    });
    expect(out).toContain('Existing article "Refund policy" (concept id: refund-policy)');
    expect(out).toContain("14 days of purchase");
    expect(out).not.toContain("Shipping times");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("proposes it once the manager has chosen to keep it separate", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const out = await invoke(tools, PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME, {
      attachmentId: "att-1",
      title: "Returns & exchanges",
      conceptId: null,
      updateConceptId: null,
      body: null,
      allowOverlap: true,
      reason: "manager wants both",
    });
    expect(out).toContain("Waiting for confirmation");
  });
});

describe("confirming a batch", () => {
  it("applies every pending change, oldest first, and reports each", async () => {
    listMock.mockResolvedValue([
      approval("newer", "assistant_configure_tone", { newValue: "Friendly" }),
      approval("older", "assistant_configure_role", { newValue: "Billing support" }),
    ]);
    const tools = buildAssistantTools(profile(), "org-1", "conv-1", { priorPendingIds: ["newer", "older"] });
    const out = await invoke(tools, CONFIRM_PENDING_CHANGE_TOOL_NAME, {});
    expect(decideMock.mock.calls.map((call) => call[0])).toEqual(["older", "newer"]);
    expect(out).toBe("All set. Here's what I changed:\n- I've updated the role.\n- I've updated the tone.");
  });

  it("reports an item already decided elsewhere instead of applying it", async () => {
    listMock.mockResolvedValue([approval("a", "assistant_configure_tone", { newValue: "Friendly" })]);
    decideMock.mockRejectedValueOnce(new Error("Approval is not pending"));
    const tools = buildAssistantTools(profile(), "org-1", "conv-1", { priorPendingIds: ["a"] });
    const out = await invoke(tools, CONFIRM_PENDING_CHANGE_TOOL_NAME, {});
    expect(out).toContain("no longer waiting for approval");
    expect(dbState.writes).toEqual([]);
  });
});

describe("same-turn confirmation", () => {
  it("can't confirm a proposal made in the same turn - the manager hasn't seen it", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    await invoke(tools, PROPOSE_ROLE_CHANGE_TOOL_NAME, { newValue: "Refund everything", reason: "x" });
    listMock.mockResolvedValue([approval("new-1", "assistant_configure_role", { newValue: "Refund everything" })]);
    const out = await invoke(tools, CONFIRM_PENDING_CHANGE_TOOL_NAME, {});
    expect(out).toBe("There's nothing waiting for your approval right now.");
    expect(decideMock).not.toHaveBeenCalled();
    expect(dbState.writes).toEqual([]);
  });
});

describe("livePendingApprovals", () => {
  it("expires proposals older than the TTL so they can't be confirmed", async () => {
    listMock.mockResolvedValue([
      approval("fresh", "assistant_configure_role", { newValue: "x" }),
      approval("stale", "assistant_configure_tone", { newValue: "y" }, PENDING_APPROVAL_TTL_MS + 60_000),
      approval("email", "gmail_send_email", {}),
    ]);
    const live = await livePendingApprovals("org-1", "conv-1");
    expect(live.map((a) => a.id)).toEqual(["fresh"]);
    expect(retireMock).toHaveBeenCalledWith(["stale"], "system:expired");
  });
});

describe("approval card decisions", () => {
  it("applies nothing when the card's ids no longer match what's pending", async () => {
    listMock.mockResolvedValue([approval("current", "assistant_configure_role", { newValue: "x" })]);
    const result = await runAssistantAgent(profile(), "org-1", "conv-1", "Approve", [], null, {
      decision: { decision: "approve", approvalIds: ["old-card"] },
    });
    expect(decideMock).not.toHaveBeenCalled();
    expect(result.answer).toContain("didn't apply anything");
    expect(result.pendingActions?.map((a) => a.id)).toEqual(["current"]);
  });

  it("cancels exactly the batch the card showed, without calling the model", async () => {
    listMock.mockResolvedValueOnce([
      approval("b", "assistant_configure_tone", { newValue: "x" }),
      approval("a", "assistant_configure_role", { newValue: "y" }),
    ]);
    const result = await runAssistantAgent(profile(), "org-1", "conv-1", "Cancel", [], null, {
      decision: { decision: "cancel", approvalIds: ["a", "b"] },
    });
    expect(decideMock.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ["b", "rejected"],
      ["a", "rejected"],
    ]);
    expect(result.answer).toBe("Okay, I've cancelled those. Nothing was changed.");
  });
});

describe("approval card content", () => {
  it("shows added and removed escalation terms, and before/after for text fields", () => {
    expect(
      pendingChangeDetails("assistant_configure_escalation_terms", {
        newTerms: ["refund", "fraud"],
        previousTerms: ["refund", "lawyer"],
      }),
    ).toBe("Adds: fraud\nRemoves: lawyer");
    expect(pendingChangeDetails("assistant_configure_role", { newValue: "New", previousValue: "Old" })).toBe("Current: Old\nNew: New");
  });

  it("labels actions separately from configuration changes", () => {
    const view = toPendingActionView(approval("x", "assistant_action_send_reply", { ticketNumber: 1042, replyText: "Hi there" }));
    expect(view).toMatchObject({ kind: "action", summary: 'Send this reply to ticket #1042: "Hi there"', details: "Hi there" });
    expect(toPendingActionView(approval("y", "assistant_configure_channel", { channel: "email", enabled: false })).kind).toBe(
      "configure",
    );
  });
});

describe("panel buttons", () => {
  it("turn a click into a proposal on the approval card, never a direct change", async () => {
    const result = await runAssistantAgent(profile(), "org-1", "conv-1", "Connect Zoho: CRM", [], null, {
      uiAction: { tool: "propose_connect_integration", args: { integrationType: "crm", system: "zoho", reason: "panel" } },
    });
    expect(result.answer).toBe("Here's that change. Take a look and approve it when you're ready.");
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ toolId: "assistant_connect_integration" }));
    expect(dbState.writes).toEqual([]);
  });

  it("refuse tools that aren't proposals", async () => {
    const result = await runAssistantAgent(profile(), "org-1", "conv-1", "x", [], null, {
      uiAction: { tool: "confirm_pending_change", args: {} },
    });
    expect(result.answer).toBe("I can't do that from here.");
    expect(decideMock).not.toHaveBeenCalled();
  });

  it("only hand back a sign-in link once the connection is approved", async () => {
    listMock.mockResolvedValueOnce([approval("c1", "assistant_connect_integration", { integrationType: "crm", system: "zoho" })]);
    const result = await runAssistantAgent(profile(), "org-1", "conv-1", "Approve", [], null, {
      decision: { decision: "approve", approvalIds: ["c1"] },
      appOrigin: "https://app.example",
      userId: "u-1",
    });
    expect(result.connectLink).toEqual({ url: "https://auth.example/zoho", label: "Zoho", kind: "integration", integrationType: "crm" });
    expect(result.answer).toContain("I've opened the Zoho sign-in");
  });

  it("show a panel straight from a chip", async () => {
    const result = await runAssistantAgent(profile(), "org-1", "conv-1", "Show skills", [], null, { showPanel: "skills" });
    expect(result.panels).toEqual(["skills"]);
    expect(result.answer).toContain("Here are the worker's skills");
  });
});

describe("voice", () => {
  it("never lets an em dash through, but keeps en dashes in ranges", () => {
    expect(speakable("I checked your setup — it looks good.")).toBe("I checked your setup, it looks good.");
    expect(speakable("Shipping takes 1–2 days.")).toBe("Shipping takes 1–2 days.");
  });

  it("marks sign-in changes so the browser opens the popup on the Approve click", () => {
    expect(toPendingActionView(approval("c", "assistant_connect_mailbox", {})).opensSignIn).toBe(true);
    expect(toPendingActionView(approval("r", "assistant_configure_role", { newValue: "x" })).opensSignIn).toBe(false);
  });
});

describe("knowledge follows the Knowledge page's OKF rules", () => {
  const baseArgs = { updateConceptId: null, conceptId: null, title: null, body: null, allowOverlap: true, reason: "upload" };

  it("keeps Markdown frontmatter as written and takes the article id from it", async () => {
    attachmentMock.mockResolvedValueOnce({
      id: "att-1",
      filename: "whatever.md",
      extractedText: "---\ntype: reference\nid: returns-v2\ntitle: Returns\n---\n# Returns\nFree within 30 days.",
    } as AssistantAttachment);
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    await invoke(tools, PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME, { ...baseArgs, attachmentId: "att-1" });
    const input = createMock.mock.calls[0][0].input;
    expect(input).toMatchObject({ targetConceptId: "returns-v2", title: "Returns", format: "as_written", autoUpdate: false });
    expect(pendingChangeDetails("assistant_configure_knowledge_from_attachment", input)).toContain("Stored as written");
  });

  it("takes the id from the filename, and updates an existing article with that id like a re-upload", async () => {
    attachmentMock.mockResolvedValueOnce({ id: "att-1", filename: "Refund Policy.pdf", extractedText: "Refunds within 30 days of purchase." } as AssistantAttachment);
    dbState.queue = [[{ id: "doc-1", title: "Refund policy" }]];
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const out = await invoke(tools, PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME, { ...baseArgs, attachmentId: "att-1" });
    expect(out).toContain('already exists, so this updates it');
    expect(createMock.mock.calls[0][0].input).toMatchObject({ targetConceptId: "refund-policy", updateConceptId: "refund-policy", autoUpdate: true, format: "wrapped" });
  });

  it("refuses file types the Knowledge page doesn't accept, unless an article is written from them", async () => {
    attachmentMock.mockResolvedValue({ id: "att-1", filename: "prices.csv", extractedText: "plan,price\nbasic,10" } as AssistantAttachment);
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    expect(await invoke(tools, PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME, { ...baseArgs, attachmentId: "att-1" })).toContain(
      "accepts PDF, Markdown, or plain text",
    );
    expect(createMock).not.toHaveBeenCalled();
    dbState.queue = [[]];
    await invoke(tools, PROPOSE_KNOWLEDGE_FROM_ATTACHMENT_TOOL_NAME, {
      ...baseArgs,
      attachmentId: "att-1",
      title: "Pricing",
      body: "# Pricing\nBasic costs 10.",
    });
    expect(createMock.mock.calls[0][0].input).toMatchObject({ targetConceptId: "pricing", format: "written_from_file" });
  });
});

describe("editing a knowledge article in place", () => {
  const article = { conceptId: "faq", title: "AI Worker FAQ", body: "Up to 5 files at a time, 8 MB each.\nMore text.", checksum: "abc", description: null, tags: [] };

  it("replaces one exact passage and keeps a checksum to detect later edits", async () => {
    dbState.rows = [article];
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const out = await invoke(tools, PROPOSE_EDIT_KNOWLEDGE_TOOL_NAME, {
      conceptId: "faq",
      find: "Up to 5 files at a time, 8 MB each.",
      replaceWith: "Attach up to 5 files (8 MB each).",
      newBody: null,
      newTitle: null,
      reason: "asked",
    });
    expect(out).toContain('edit the knowledge article "AI Worker FAQ"');
    const input = createMock.mock.calls[0][0].input;
    expect(input).toMatchObject({ checksum: "abc", find: "Up to 5 files at a time, 8 MB each." });
    expect(pendingChangeDetails("assistant_configure_edit_knowledge", input)).toContain("Keeps the article's id, description and tags");
  });

  it("refuses text that isn't there exactly once", async () => {
    dbState.rows = [{ ...article, body: "a b a" }];
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const none = await invoke(tools, PROPOSE_EDIT_KNOWLEDGE_TOOL_NAME, { conceptId: "faq", find: "zzz", replaceWith: "y", newBody: null, newTitle: null, reason: "x" });
    expect(none).toContain("isn't in the article");
    const twice = await invoke(tools, PROPOSE_EDIT_KNOWLEDGE_TOOL_NAME, { conceptId: "faq", find: "a", replaceWith: "y", newBody: null, newTitle: null, reason: "x" });
    expect(twice).toContain("appears 2 times");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("won't apply if the article changed after it was proposed", async () => {
    listMock.mockResolvedValue([approval("e1", "assistant_configure_edit_knowledge", { conceptId: "faq", title: "AI Worker FAQ", find: "Up to 5", replaceWith: "Five", checksum: "old" })]);
    dbState.rows = [article];
    const tools = buildAssistantTools(profile(), "org-1", "conv-1", { priorPendingIds: ["e1"] });
    const out = await invoke(tools, CONFIRM_PENDING_CHANGE_TOOL_NAME, {});
    expect(out).toContain("the article changed after I proposed this edit");
  });
});

describe("skills from files follow Settings > Skills", () => {
  const args = { attachmentId: "att-1", name: "Chargebacks", description: "Use for chargebacks.", requires: [], enable: false, reason: "x" };
  beforeEach(() => {
    attachmentMock.mockResolvedValue({ id: "att-1", filename: "proc.txt", extractedText: "steps" } as AssistantAttachment);
  });

  it("enforces the instruction length limit and valid integration types", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    expect(await invoke(tools, PROPOSE_SKILL_FROM_ATTACHMENT_TOOL_NAME, { ...args, body: "x".repeat(6001) })).toContain("at most 6,000 characters");
    expect(await invoke(tools, PROPOSE_SKILL_FROM_ATTACHMENT_TOOL_NAME, { ...args, body: "Do it.", requires: ["fax"] })).toContain("Unknown integration type");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("won't offer to turn a skill on before its integration is connected", async () => {
    const tools = buildAssistantTools(profile(), "org-1", "conv-1");
    const out = await invoke(tools, PROPOSE_SKILL_FROM_ATTACHMENT_TOOL_NAME, { ...args, body: "Look up the customer.", requires: ["crm"], enable: true });
    expect(out).toContain("needs crm connected first");
  });
});

describe("read-only members", () => {
  it("get no tools that propose or apply changes", () => {
    const names = buildAssistantTools(profile(), "org-1", "conv-1", { readOnly: true }).map((t) => (t as { name: string }).name);
    expect(names.some((name) => name.startsWith("propose_") || name.includes("pending_change"))).toBe(false);
    expect(names).toContain("search_knowledge");
  });

  it("can't approve a card or use a panel button", async () => {
    const decided = await runAssistantAgent(profile(), "org-1", "conv-1", "Approve", [], null, {
      decision: { decision: "approve", approvalIds: ["a"] },
      canChange: false,
    });
    expect(decided.answer).toBe(READ_ONLY_REPLY);
    const clicked = await runAssistantAgent(profile(), "org-1", "conv-1", "Turn on", [], null, {
      uiAction: { tool: "propose_skill_change", args: { skillId: "x", enabled: true, reason: "x" } },
      canChange: false,
    });
    expect(clicked.answer).toBe(READ_ONLY_REPLY);
    expect(decideMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
