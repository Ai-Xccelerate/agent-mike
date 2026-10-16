import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieveMock = vi.hoisted(() => vi.fn());
const confluenceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/knowledge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/knowledge")>();
  return { ...actual, retrieve: retrieveMock };
});
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>();
  return { ...actual, searchConfluenceKnowledge: confluenceMock };
});

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { ingestOkf } from "@/lib/knowledge";
import { retrieveKnowledge } from "@/lib/retrieval";
import { clearRetrievalCache, normalizeQuery } from "@/lib/retrieval-cache";

const profile = { organizationId: "org-a", slug: "mike", integrationsConfig: null };
const match = (title: string) => ({ documentId: "d", title, heading: null, content: "Steps.", rank: 1 });
const savedTtl = process.env.RETRIEVAL_CACHE_TTL_MS;

beforeEach(() => {
  retrieveMock.mockReset();
  confluenceMock.mockReset();
  retrieveMock.mockResolvedValue([match("Reset your password")]);
  confluenceMock.mockResolvedValue(null);
  clearRetrievalCache();
  delete process.env.RETRIEVAL_CACHE_TTL_MS;
});

afterEach(() => {
  if (savedTtl === undefined) delete process.env.RETRIEVAL_CACHE_TTL_MS;
  else process.env.RETRIEVAL_CACHE_TTL_MS = savedTtl;
  vi.restoreAllMocks();
});

describe("normalizeQuery", () => {
  it("treats capitals, punctuation and spacing as the same question", () => {
    expect(normalizeQuery("How do I reset my  password?")).toBe(normalizeQuery("how do i reset my password"));
    expect(normalizeQuery("How do I reset my password?")).not.toBe(normalizeQuery("How do I reset my username?"));
  });
});

describe("retrieval memory", () => {
  it("answers the same question again without searching", async () => {
    const first = await retrieveKnowledge(profile, "How do I reset my password?");
    const second = await retrieveKnowledge(profile, "how do i reset my  password");
    expect(second).toBe(first);
    expect(retrieveMock).toHaveBeenCalledTimes(1);
    expect(confluenceMock).toHaveBeenCalledTimes(1);
  });

  it("keeps each org's results to itself, and each question's", async () => {
    await retrieveKnowledge(profile, "reset password");
    await retrieveKnowledge({ ...profile, organizationId: "org-b" }, "reset password");
    await retrieveKnowledge(profile, "add a user");
    expect(retrieveMock).toHaveBeenCalledTimes(3);
  });

  it("searches again when a source is switched on or off", async () => {
    await retrieveKnowledge(profile, "reset password");
    await retrieveKnowledge({ ...profile, integrationsConfig: { agent_wiki: { enabled: true } } }, "reset password");
    expect(retrieveMock).toHaveBeenCalledTimes(2);
  });

  it("does not remember a search where a source failed", async () => {
    confluenceMock.mockRejectedValueOnce(new Error("timeout"));
    const failed = await retrieveKnowledge(profile, "reset password");
    expect(failed.sources.some((source) => source.error)).toBe(true);
    const retried = await retrieveKnowledge(profile, "reset password");
    expect(retried.sources.every((source) => source.error === null)).toBe(true);
    expect(retrieveMock).toHaveBeenCalledTimes(2);
  });

  it("forgets after the time is up", async () => {
    const realNow = Date.now();
    await retrieveKnowledge(profile, "reset password");
    vi.spyOn(Date, "now").mockReturnValue(realNow + 4 * 60 * 1000);
    await retrieveKnowledge(profile, "reset password");
    expect(retrieveMock).toHaveBeenCalledTimes(2);
  });

  it("forgets an org's questions when its knowledge changes", async () => {
    await retrieveKnowledge(profile, "reset password");
    await retrieveKnowledge({ ...profile, organizationId: "org-b" }, "reset password");
    clearRetrievalCache("org-a");
    await retrieveKnowledge(profile, "reset password");
    await retrieveKnowledge({ ...profile, organizationId: "org-b" }, "reset password");
    expect(retrieveMock).toHaveBeenCalledTimes(3);
  });

  it("can be turned off", async () => {
    process.env.RETRIEVAL_CACHE_TTL_MS = "0";
    await retrieveKnowledge(profile, "reset password");
    await retrieveKnowledge(profile, "reset password");
    expect(retrieveMock).toHaveBeenCalledTimes(2);
  });

  it("forgets the org's questions the moment a knowledge article is added or changed", async () => {
    const organizationId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(organizationId, "Retrieval cache test org");
    try {
      const own = { ...profile, organizationId };
      await retrieveKnowledge(own, "reset password");
      await retrieveKnowledge(own, "reset password");
      expect(retrieveMock).toHaveBeenCalledTimes(1);

      await ingestOkf(organizationId, "reset-password", "---\ntype: reference\ntitle: Reset\n---\n\n# Reset\n\nSteps.");
      await retrieveKnowledge(own, "reset password");
      expect(retrieveMock).toHaveBeenCalledTimes(2);
    } finally {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }
  });
});
