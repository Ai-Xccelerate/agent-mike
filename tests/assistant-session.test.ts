/// <reference lib="dom" />
import { beforeEach, describe, expect, it } from "vitest";
import { RESUME_WINDOW_MS, readLastConversation, rememberLastConversation } from "../frontend/src/lib/assistant-session";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  Object.assign(globalThis, { window: { localStorage: storage, sessionStorage: storage, addEventListener() {}, removeEventListener() {} } });
});

describe("reopening the last Assistant chat", () => {
  const key = "k";
  it("reopens a chat that was active within 30 minutes", () => {
    rememberLastConversation(key, "c1", 1_000);
    expect(readLastConversation(key, 1_000 + RESUME_WINDOW_MS)).toBe("c1");
  });
  it("opens a fresh chat after the window, and keeps it going while the chat is in use", () => {
    rememberLastConversation(key, "c1", 1_000);
    expect(readLastConversation(key, 1_000 + RESUME_WINDOW_MS + 1)).toBeNull();
    rememberLastConversation(key, "c1", 1_000 + RESUME_WINDOW_MS - 5);
    expect(readLastConversation(key, 1_000 + RESUME_WINDOW_MS + 60_000)).toBe("c1");
  });
  it("forgets the chat after New chat, and ignores the older stored format", () => {
    rememberLastConversation(key, "c1", 1_000);
    rememberLastConversation(key, null);
    expect(readLastConversation(key, 2_000)).toBeNull();
    store.set(key, "old-id-without-time");
    expect(readLastConversation(key, 2_000)).toBeNull();
  });
});
