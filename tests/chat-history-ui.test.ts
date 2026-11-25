import { describe, expect, it } from "vitest";
import {
  chatMeta,
  chatsFromResponse,
  newChatConfirmationText,
  newChatNeedsConfirmation,
  openingMode,
  whenLabel,
  type HistoryChat,
} from "../frontend/src/lib/chat-history";

// The choices behind the website chat's history drawer. The server side is in widget-conversations-route.test.ts.

const NOW = new Date(2026, 10, 24, 15, 0, 0); // 24 Nov 2026, local time
const at = (daysAgo: number, hour = 9) => new Date(2026, 10, 24 - daysAgo, hour, 0, 0).toISOString();
const chat = (overrides: Partial<HistoryChat> = {}): HistoryChat => ({
  id: "c1",
  title: "Parallels login fails",
  resolved: false,
  waitingForTeam: false,
  ticketKey: null,
  lastMessageAt: at(0),
  ...overrides,
});

describe("the list the server sends", () => {
  it("becomes chats the drawer can show", () => {
    expect(
      chatsFromResponse({
        available: true,
        conversations: [{ id: "a", title: "Password reset", resolved: true, waiting_for_team: false, ticket_key: "SDS-12", last_message_at: at(4) }],
      }),
    ).toEqual([{ id: "a", title: "Password reset", resolved: true, waitingForTeam: false, ticketKey: "SDS-12", lastMessageAt: at(4) }]);
  });

  it("is empty when history is not available, or the answer is missing", () => {
    expect(chatsFromResponse({ available: false, conversations: [] })).toEqual([]);
    expect(chatsFromResponse(null)).toEqual([]);
    expect(chatsFromResponse(undefined)).toEqual([]);
  });
});

describe("opening a chat from the drawer", () => {
  it("carries on a chat that is still open, and only reads a finished one", () => {
    expect(openingMode(chat({ resolved: false }))).toBe("continue");
    expect(openingMode(chat({ resolved: true }))).toBe("read");
  });
});

describe("starting a new chat", () => {
  it("asks first only while the current chat is with the team", () => {
    expect(newChatNeedsConfirmation({ waitingForTeam: true, reading: false })).toBe(true);
    expect(newChatNeedsConfirmation({ waitingForTeam: false, reading: false })).toBe(false);
  });

  it("does not ask when the customer is only reading a finished chat", () => {
    expect(newChatNeedsConfirmation({ waitingForTeam: true, reading: true })).toBe(false);
  });

  it("names the ticket in the question, and says the chat stays in the history", () => {
    expect(newChatConfirmationText("SDS-31")).toBe("You have an open ticket, SDS-31. Start a new chat anyway? This chat stays in your history.");
    expect(newChatConfirmationText(null)).toBe("You have an open ticket. Start a new chat anyway? This chat stays in your history.");
  });
});

describe("how a chat is described", () => {
  it("says Today, Yesterday, or the date", () => {
    expect(whenLabel(at(0), NOW)).toBe("Today");
    expect(whenLabel(at(0, 0), NOW)).toBe("Today");
    expect(whenLabel(at(1, 23), NOW)).toBe("Yesterday");
    expect(whenLabel(at(4), NOW)).toBe("20 Nov");
    expect(whenLabel("not a date", NOW)).toBe("");
  });

  it("puts the ticket and the state after the time", () => {
    expect(chatMeta(chat({ ticketKey: "SDS-31", waitingForTeam: true }), NOW)).toBe("Today · Ticket SDS-31 · With our team");
    expect(chatMeta(chat({ resolved: true, lastMessageAt: at(4) }), NOW)).toBe("20 Nov · Resolved");
    expect(chatMeta(chat({ lastMessageAt: at(1) }), NOW)).toBe("Yesterday");
  });
});
