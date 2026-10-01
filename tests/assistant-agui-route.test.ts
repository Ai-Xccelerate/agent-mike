import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { POST as postAgui } from "@/app/api/v1/assistant/agui/route";
import { db } from "@/lib/db";
import { messages, organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import { makeCard } from "@/lib/assistant-cards";
import type { RunAssistantOptions } from "@/lib/assistant-agent";

const runAssistantAgentMock = vi.hoisted(() => vi.fn());
const titleMock = vi.hoisted(() => vi.fn());
const summaryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/assistant-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/assistant-agent")>();
  return {
    ...actual,
    runAssistantAgent: runAssistantAgentMock,
    generateAssistantTitle: titleMock,
    maybeRefreshAssistantSummary: summaryMock,
  };
});

const previousAdapter = getIdentityAdapter();

function adapterFor(orgId: string): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({ orgId, userId: "test-manager", role: "owner", source: "test" }),
    resolveWidgetRequest: async () => null,
  };
}

function aguiRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/v1/assistant/agui", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    duplex: "half" as const,
  });
}

type AguiEvent = { type: string; [key: string]: unknown };

async function readEvents(res: Response): Promise<AguiEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)) as AguiEvent);
}

describe("POST /api/v1/assistant/agui", () => {
  let orgId: string;

  beforeEach(async () => {
    orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Assistant AG-UI test");
    setIdentityAdapter(adapterFor(orgId));
    runAssistantAgentMock.mockReset();
    titleMock.mockReset();
    titleMock.mockResolvedValue("Open conversations");
    summaryMock.mockReset();
    summaryMock.mockImplementation(async (_profile, current) => current);
  });

  afterEach(async () => {
    setIdentityAdapter(previousAdapter);
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it("streams cards as render_* tool calls, then the text, then the stored turn", async () => {
    const card = makeCard("ticket_list", { filter: { status: "open", sinceDays: null }, tickets: [] });
    runAssistantAgentMock.mockImplementation(async (...args: unknown[]) => {
      const options = args[6] as RunAssistantOptions;
      options.onEvent?.({ type: "activity", label: "Looked up conversations" });
      options.onEvent?.({ type: "card", card });
      options.onEvent?.({ type: "text", delta: "Nothing is open " });
      options.onEvent?.({ type: "text", delta: "right now." });
      return { answer: "Nothing is open right now.", cards: [card], pendingActions: [] };
    });

    const threadId = crypto.randomUUID();
    const res = await postAgui(
      aguiRequest({
        threadId,
        runId: "run-1",
        messages: [{ id: "u1", role: "user", content: "What's open?" }],
        forwardedProps: { new_conversation_id: threadId },
      }),
    );
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const events = await readEvents(res);

    expect(events.map((event) => event.type)).toEqual([
      "RUN_STARTED",
      "STEP_STARTED",
      "STEP_FINISHED",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "CUSTOM",
      "RUN_FINISHED",
    ]);
    const start = events[3];
    expect(start.toolCallName).toBe("render_ticket_list");
    expect(start.toolCallId).toBe(card.id);
    expect(JSON.parse(events[4].delta as string)).toEqual(card.data);

    // The streamed message and the stored reply share one id, so a reload matches.
    const turn = events[11].value as { conversation_id: string; message: { id: string; body: string; cards: unknown[] } };
    expect(events[11].name).toBe("assistant.turn");
    expect(start.parentMessageId).toBe(turn.message.id);
    expect(events[7].messageId).toBe(turn.message.id);
    expect(turn.conversation_id).toBe(threadId);

    const [stored] = await db.select().from(messages).where(eq(messages.id, turn.message.id));
    expect(stored.body).toBe("Nothing is open right now.");
    expect(stored.cards).toEqual([card]);
  });

  it("sends a reply that's only cards with no text message at all", async () => {
    const card = makeCard("panel", { panel: "skills" });
    runAssistantAgentMock.mockImplementation(async (...args: unknown[]) => {
      (args[6] as RunAssistantOptions).onEvent?.({ type: "card", card });
      return { answer: "", cards: [card], panels: ["skills"], pendingActions: [] };
    });

    const threadId = crypto.randomUUID();
    const events = await readEvents(
      await postAgui(
        aguiRequest({
          threadId,
          messages: [{ id: "u1", role: "user", content: "Show skills" }],
          forwardedProps: { new_conversation_id: threadId },
        }),
      ),
    );
    expect(events.some((event) => event.type.startsWith("TEXT_MESSAGE"))).toBe(false);
    expect(events.find((event) => event.type === "TOOL_CALL_START")?.toolCallName).toBe("render_panel");
    expect(events.at(-1)?.type).toBe("RUN_FINISHED");
  });

  it("sends an answer that wasn't streamed (a card click, a chip) as one text message", async () => {
    runAssistantAgentMock.mockResolvedValue({ answer: "Cancelled. Nothing changed.", pendingActions: [] });

    const threadId = crypto.randomUUID();
    const events = await readEvents(
      await postAgui(
        aguiRequest({
          threadId,
          messages: [{ id: "u1", role: "user", content: "no" }],
          forwardedProps: { new_conversation_id: threadId },
        }),
      ),
    );
    const content = events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT");
    expect(content).toHaveLength(1);
    expect(content[0].delta).toBe("Cancelled. Nothing changed.");
  });

  it("reports a refused request as RUN_ERROR without running the assistant", async () => {
    const events = await readEvents(
      await postAgui(
        aguiRequest({
          threadId: "t",
          messages: [{ id: "u1", role: "user", content: "hi" }],
          forwardedProps: { conversation_id: crypto.randomUUID() },
        }),
      ),
    );
    expect(events.map((event) => event.type)).toEqual(["RUN_STARTED", "RUN_ERROR"]);
    expect(events[1].message).toBe("Conversation not found");
    expect(runAssistantAgentMock).not.toHaveBeenCalled();
  });

  it("keeps cards already shown when the run fails partway", async () => {
    const card = makeCard("config_audit", { findings: [] });
    runAssistantAgentMock.mockImplementation(async (...args: unknown[]) => {
      (args[6] as RunAssistantOptions).onEvent?.({ type: "card", card });
      throw new Error("MaxTurnsExceededError");
    });

    const threadId = crypto.randomUUID();
    const events = await readEvents(
      await postAgui(
        aguiRequest({
          threadId,
          messages: [{ id: "u1", role: "user", content: "Check my setup" }],
          forwardedProps: { new_conversation_id: threadId },
        }),
      ),
    );
    const turn = events.find((event) => event.type === "CUSTOM")?.value as { message: { body: string; cards: unknown[] } };
    expect(turn.message.body).toContain("MaxTurnsExceededError");
    expect(turn.message.cards).toEqual([card]);
  });
});
