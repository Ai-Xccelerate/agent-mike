import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";

// An admin's "Sync now" writes the page questions too, as the automatic refresh does. Before 26 Nov it only re-synced
// the pages, so after page questions shipped EAP's prod copy had none until a customer chat started a refresh.

const sync = vi.hoisted(() => vi.fn());
const questions = vi.hoisted(() => vi.fn(async () => ({ pages: 1, written: 8, removed: 0, failed: 0 })));
vi.mock("@/lib/knowledge-index", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/knowledge-index")>()), syncKnowledgeIndex: sync }));
vi.mock("@/lib/knowledge-page-questions", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/knowledge-page-questions")>()), syncPageQuestions: questions }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()), confluenceIndexSource: vi.fn(async () => ({ source: "confluence" })) }));

const { POST } = await import("@/app/api/v1/worker/knowledge-index/route");

const original = getIdentityAdapter();
let orgId: string;
beforeEach(async () => {
  orgId = `org-sync-now-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  setIdentityAdapter({ resolveManagerRequest: async () => ({ orgId, userId: "m", role: "admin", source: "test" }), resolveWidgetRequest: async () => null });
  sync.mockReset();
  questions.mockClear();
});
afterEach(() => setIdentityAdapter(original));

const press = () => POST(new NextRequest("http://localhost/api/v1/worker/knowledge-index", { method: "POST" }));

describe("Sync now", () => {
  it("writes the page questions after the pages are synced", async () => {
    sync.mockResolvedValue({ pages: 3, sections: 9 });
    expect((await press()).status).toBe(202);
    await vi.waitFor(() => expect(questions).toHaveBeenCalledWith(orgId));
  });

  it("does not write them when the sync did nothing or stopped with an error", async () => {
    sync.mockResolvedValueOnce({ skipped: "another sync is already running" });
    await press();
    sync.mockResolvedValueOnce({ error: "Confluence refused" });
    await press();
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(questions).not.toHaveBeenCalled();
  });
});
