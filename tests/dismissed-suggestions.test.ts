import { beforeEach, describe, expect, it } from "vitest";
import { clearDismissed, isDismissed, markDismissed, resetDismissedMemory, type DismissedStorage } from "../frontend/src/lib/dismissed-suggestions";

function fakeStorage(initial: Record<string, string> = {}): DismissedStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

beforeEach(() => resetDismissedMemory());

describe("dismissed suggested replies", () => {
  it("stays dismissed after leaving and coming back, even with a fresh page (nothing in memory)", () => {
    const storage = fakeStorage();
    markDismissed("conv-1:msg-9", storage);
    resetDismissedMemory(); // a reload
    expect(isDismissed("conv-1:msg-9", storage)).toBe(true);
  });

  it("is only for that conversation and its newest message: a newer message is a new draft", () => {
    const storage = fakeStorage();
    markDismissed("conv-1:msg-9", storage);
    expect(isDismissed("conv-1:msg-10", storage)).toBe(false);
    expect(isDismissed("conv-2:msg-9", storage)).toBe(false);
  });

  it("is lifted when the manager asks for a draft again", () => {
    const storage = fakeStorage();
    markDismissed("conv-1:msg-9", storage);
    clearDismissed("conv-1:msg-9", storage);
    expect(isDismissed("conv-1:msg-9", storage)).toBe(false);
  });

  it("still works for this visit when storage is blocked", () => {
    markDismissed("conv-1:msg-9", null);
    expect(isDismissed("conv-1:msg-9", null)).toBe(true);
  });

  it("copes with damaged stored data, and keeps only the most recent few hundred", () => {
    expect(isDismissed("a", fakeStorage({ "worker.suggestedReply.dismissed.v1": "{not json" }))).toBe(false);
    const storage = fakeStorage();
    for (let i = 0; i < 350; i += 1) markDismissed(`c:${i}`, storage);
    expect(JSON.parse(storage.data["worker.suggestedReply.dismissed.v1"])).toHaveLength(300);
    resetDismissedMemory();
    expect(isDismissed("c:349", storage)).toBe(true);
    expect(isDismissed("c:0", storage)).toBe(false);
  });
});
