import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// 27 Nov, staging: a 32-second turn lost its stream in the widget after ~30 s with nothing sent, and the visitor saw
// "can't reach the API" under the reply the server did send. A quiet stream now says every few seconds it is working.
const turn = vi.hoisted(() => ({ release: () => {} }));
vi.mock("@/lib/chat-turn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chat-turn")>()),
  runChatRequest: vi.fn(
    () =>
      new Promise((resolve) => {
        turn.release = () =>
          resolve({ status: 200, json: { conversation_id: "c1", message: { id: "m1", body: "Here you go." }, escalated: false } });
      }),
  ),
}));

const { POST } = await import("@/app/api/v1/chat/agui/route");

afterEach(() => vi.useRealTimers());

describe("the chat stream while a turn takes a while", () => {
  it("sends a keep-alive every 10 seconds, and stops once the run is finished", async () => {
    vi.useFakeTimers();
    const res = await POST(
      new NextRequest("http://x/api/v1/chat/agui", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: "t", runId: "r", messages: [{ id: "u", role: "user", content: "hi" }] }),
      }),
    );
    const reader = res.body!.getReader();
    await vi.advanceTimersByTimeAsync(31_000);
    turn.release();
    await vi.advanceTimersByTimeAsync(100);
    let text = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    const events = text.split("\n\n").filter(Boolean).map((line) => JSON.parse(line.replace(/^data: /, "")));
    expect(events.filter((event) => event.name === "chat.keepalive")).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
