import { beforeEach, describe, expect, it, vi } from "vitest";
import { topicsForSearch, validTopics, worthSplitting } from "@/lib/query-topics";

const said = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@openai/agents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@openai/agents")>()),
  run: vi.fn(async () => {
    if (said.value === null) throw new Error("model failed");
    return { finalOutput: said.value };
  }),
}));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), modelUnavailabilityReason: () => null }));

beforeEach(() => {
  said.value = null;
});

const FIVE = "I have a few questions. How do I record a critical incident, where do I record session notes, how do I customize the layout of a form, how do I monitor authorizations, and how do I search for a provider?";

describe("which messages are worth asking the model about", () => {
  it("leaves short questions and a long single ask alone", () => {
    expect(worthSplitting("How do I add a new provider?")).toBe(false);
    expect(worthSplitting("How do I add and remove specializations for a provider?")).toBe(false);
    expect(worthSplitting("Hello team and thanks for the help last week with our office move. How do I add a checkbox to one of our forms?")).toBe(false);
  });

  it("picks up a list of questions, with or without a question word for each", () => {
    expect(worthSplitting(FIVE)).toBe(true);
    expect(worthSplitting("How do I add a new provider, change a provider's email address, set up appointment reminders and export account data to our accounting system?")).toBe(true);
  });
});

describe("keeping only what can be a search question", () => {
  it("trims, drops duplicates and junk, caps at six, and returns nothing under three", () => {
    expect(validTopics(["- add a new provider", "1. change a provider's email", "Set up appointment reminders", "add a new provider", "x"])).toEqual([
      "add a new provider",
      "change a provider's email",
      "Set up appointment reminders",
    ]);
    expect(validTopics(["add a new provider", "change an email"])).toEqual([]);
    expect(validTopics(Array.from({ length: 9 }, (_, i) => `do the task number ${i}`))).toHaveLength(6);
  });
});

describe("splitting a message", () => {
  it("returns the topics the model lists, when there are three or more", async () => {
    said.value = { topics: ["record a critical incident", "record session notes", "customize a form layout", "monitor authorizations", "search for a provider"] };
    expect(await topicsForSearch(`${FIVE} (a)`)).toHaveLength(5);
  });

  it("returns nothing for a message that is not worth asking about, without calling the model", async () => {
    said.value = { topics: ["a b c", "d e f", "g h i"] };
    expect(await topicsForSearch("How do I add a new provider?")).toEqual([]);
  });

  it("returns nothing when the model lists fewer than three, or fails, or answers badly", async () => {
    said.value = { topics: ["add a provider", "remove a provider"] };
    expect(await topicsForSearch(`${FIVE} (b)`)).toEqual([]);
    said.value = null;
    expect(await topicsForSearch(`${FIVE} (c)`)).toEqual([]);
    said.value = "not an object";
    expect(await topicsForSearch(`${FIVE} (d)`)).toEqual([]);
  });
});
