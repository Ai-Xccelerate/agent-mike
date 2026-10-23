import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureOrganization } from "@/lib/bootstrap";
import { retrieveKnowledge } from "@/lib/retrieval";
import { clearRetrievalCache } from "@/lib/retrieval-cache";
import { confluenceSettingsDefaults, readConfluenceSettings } from "@/lib/tools-integrations/atlassian";

const searchesIndex = vi.hoisted(() => vi.fn());
const liveSearch = vi.hoisted(() => vi.fn());
const indexSearch = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  confluenceSearchesIndex: searchesIndex,
  searchConfluenceKnowledge: liveSearch,
}));
vi.mock("@/lib/knowledge-search", () => ({ searchKnowledgeIndex: indexSearch, DEFAULT_TUNING: { limit: 8 } }));
vi.mock("@/lib/knowledge-index", () => ({ refreshKnowledgeIndexIfStale: refresh }));

const match = (title: string) => ({ documentId: `confluence:${title}`, title, heading: null, content: `${title} text`, rank: 1 });
let orgId: string;
const profile = () => ({ organizationId: orgId, slug: "eva", integrationsConfig: {} });

beforeEach(async () => {
  orgId = `org-retr-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  clearRetrievalCache?.();
  searchesIndex.mockReset();
  liveSearch.mockReset().mockResolvedValue([match("Live page")]);
  indexSearch.mockReset().mockResolvedValue({ matches: [match("Saved copy page")], timings: {}, details: [] });
  refresh.mockClear();
});

describe("which Confluence search answers", () => {
  it("is the live search when the saved copy is switched off", async () => {
    searchesIndex.mockResolvedValue(false);
    const { matches } = await retrieveKnowledge(profile(), "how do I register");
    expect(matches.map((m) => m.title)).toEqual(["Live page"]);
    expect(indexSearch).not.toHaveBeenCalled();
  });

  it("is the saved copy when it is switched on, and starts a refresh if it is old", async () => {
    searchesIndex.mockResolvedValue(true);
    const { matches, sources } = await retrieveKnowledge(profile(), "how do I register");
    expect(matches.map((m) => m.title)).toEqual(["Saved copy page"]);
    expect(liveSearch).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledWith(orgId);
    expect(sources.find((s) => s.source === "confluence")).toMatchObject({ count: 1, error: null });
  });

  it("hands over all eight sections from the saved copy, not just five", async () => {
    searchesIndex.mockResolvedValue(true);
    indexSearch.mockResolvedValue({ matches: Array.from({ length: 8 }, (_, i) => match(`Section ${i + 1}`)), timings: {}, details: [] });
    const { matches } = await retrieveKnowledge(profile(), "how do I register");
    expect(matches).toHaveLength(8);
  });

  it("keeps the live search to five", async () => {
    searchesIndex.mockResolvedValue(false);
    liveSearch.mockResolvedValue(Array.from({ length: 8 }, (_, i) => match(`Live ${i + 1}`)));
    const { matches } = await retrieveKnowledge(profile(), "how do I register");
    expect(matches).toHaveLength(5);
  });

  it("falls back to the live search when the saved copy has nothing", async () => {
    searchesIndex.mockResolvedValue(true);
    indexSearch.mockResolvedValue({ matches: [], timings: {}, details: [] });
    const { matches } = await retrieveKnowledge(profile(), "something only live knows");
    expect(matches.map((m) => m.title)).toEqual(["Live page"]);
  });

  it("falls back to the live search when the saved copy fails", async () => {
    searchesIndex.mockResolvedValue(true);
    indexSearch.mockRejectedValue(new Error("database unavailable"));
    const { matches, sources } = await retrieveKnowledge(profile(), "how do I register");
    expect(matches.map((m) => m.title)).toEqual(["Live page"]);
    expect(sources.find((s) => s.source === "confluence")?.error).toBeNull();
  });

  it("is the live search when working out the switch itself fails", async () => {
    searchesIndex.mockRejectedValue(new Error("connection lookup failed"));
    const { matches } = await retrieveKnowledge(profile(), "how do I register");
    expect(matches.map((m) => m.title)).toEqual(["Live page"]);
  });
});

describe("the saved-copy setting", () => {
  it("is off by default, and off for settings saved before it existed", () => {
    expect(confluenceSettingsDefaults().searchIndex).toBe(false);
    expect(readConfluenceSettings({ settings: { spaceKeys: ["SK"], searchBeforeAnswering: true } }).searchIndex).toBe(false);
    expect(readConfluenceSettings({ settings: { spaceKeys: ["SK"], searchBeforeAnswering: true, searchIndex: true } }).searchIndex).toBe(true);
  });
});
