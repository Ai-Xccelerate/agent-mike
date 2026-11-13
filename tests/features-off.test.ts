import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { featureEnabled, featureFlags } from "@/lib/features";
import { cannedRepliesBlock, createCannedReply } from "@/lib/canned-replies";
import { startReplay } from "@/lib/eval-replay";
import { buildAssistantReadTools } from "@/lib/assistant-read-tools";
import { productGuide } from "@/lib/assistant-product-guide";
import { GET as getCanned, POST as postCanned } from "@/app/api/v1/canned-replies/route";
import { DELETE as deleteCanned, PATCH as patchCanned } from "@/app/api/v1/canned-replies/[id]/route";
import { GET as getCases, POST as postCases } from "@/app/api/v1/eval-cases/route";
import { DELETE as deleteCase, PATCH as patchCase } from "@/app/api/v1/eval-cases/[id]/route";
import { GET as getRuns, POST as postRuns } from "@/app/api/v1/eval-runs/route";
import { GET as getRun } from "@/app/api/v1/eval-runs/[id]/route";
import { POST as postSuggested } from "@/app/api/v1/conversations/[id]/suggested-reply/route";
import { GET as getFeatures } from "@/app/api/v1/features/route";

const previousAdapter = getIdentityAdapter();
const saved = {
  canned: process.env.FEATURE_CANNED_REPLIES,
  cases: process.env.FEATURE_TEST_CASES,
  suggested: process.env.FEATURE_SUGGESTED_REPLIES,
};
let orgId: string;

const request = (method = "GET", body?: unknown) =>
  new NextRequest("http://localhost/api/v1/x", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body), duplex: "half" as const }),
  });
const ctx = { params: { id: "00000000-0000-0000-0000-000000000000" } };
const toolNames = () => buildAssistantReadTools(orgId).map((tool) => (tool as { name: string }).name);

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Switched-off features org");
  setIdentityAdapter({ resolveManagerRequest: async () => ({ orgId, userId: "m", role: "owner", source: "test" }), resolveWidgetRequest: async () => null });
});

afterEach(async () => {
  setIdentityAdapter(previousAdapter);
  for (const [key, value] of [["FEATURE_CANNED_REPLIES", saved.canned], ["FEATURE_TEST_CASES", saved.cases], ["FEATURE_SUGGESTED_REPLIES", saved.suggested]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("canned replies and test cases are off unless the server switches them on", () => {
  it("are off when the variables are not set, and on for 1, true or on", () => {
    delete process.env.FEATURE_CANNED_REPLIES;
    delete process.env.FEATURE_TEST_CASES;
    delete process.env.FEATURE_SUGGESTED_REPLIES;
    expect(featureFlags()).toEqual({ cannedReplies: false, testCases: false, suggestedReplies: false });
    for (const value of ["1", "true", "on", " TRUE "]) {
      process.env.FEATURE_TEST_CASES = value;
      expect(featureEnabled("testCases")).toBe(true);
    }
    process.env.FEATURE_TEST_CASES = "false";
    expect(featureEnabled("testCases")).toBe(false);
  });

  it("canned replies: the API answers 404, and nothing stored reaches the worker's instructions", async () => {
    await createCannedReply(orgId, { title: "Fix date", situation: "Customer asks when a bug is fixed", reply: "I cannot give a date." });
    expect(await cannedRepliesBlock(orgId)).toContain("I cannot give a date.");

    delete process.env.FEATURE_CANNED_REPLIES;
    expect(await cannedRepliesBlock(orgId)).toBe("");
    for (const res of [
      await getCanned(request()),
      await postCanned(request("POST", { title: "a", situation: "b", reply: "c" })),
      await patchCanned(request("PATCH", { enabled: false }), ctx),
      await deleteCanned(request("DELETE"), ctx),
    ]) {
      expect(res.status).toBe(404);
    }
  });

  it("test cases: the API answers 404 and no replay starts, wherever it is asked from", async () => {
    delete process.env.FEATURE_TEST_CASES;
    for (const res of [
      await getCases(request()),
      await postCases(request("POST", { question: "How do I reset my password?" })),
      await patchCase(request("PATCH", { enabled: false }), ctx),
      await deleteCase(request("DELETE"), ctx),
      await getRuns(request()),
      await postRuns(request("POST")),
      await getRun(request(), ctx),
    ]) {
      expect(res.status).toBe(404);
    }
    expect(await startReplay({ organizationId: orgId, triggeredBy: "assistant" })).toMatchObject({ ok: false, status: 404 });
  });

  it("the admin Assistant has neither tool, and its product guide says both are off", () => {
    expect(toolNames()).toEqual(expect.arrayContaining(["list_canned_replies", "get_test_cases"]));
    delete process.env.FEATURE_CANNED_REPLIES;
    delete process.env.FEATURE_TEST_CASES;
    expect(toolNames()).not.toContain("list_canned_replies");
    expect(toolNames()).not.toContain("get_test_cases");
    expect(productGuide("canned_replies")).toMatch(/switched off/);
    expect(productGuide("test_cases")).toMatch(/switched off/);
    expect(productGuide("overview")).not.toMatch(/Canned replies|Test cases/);
  });

  it("suggested replies: the API answers 404 when off", async () => {
    delete process.env.FEATURE_SUGGESTED_REPLIES;
    expect((await postSuggested(request("POST"), ctx)).status).toBe(404);
  });

  it("tells the manager's screens which to hide", async () => {
    delete process.env.FEATURE_CANNED_REPLIES;
    process.env.FEATURE_TEST_CASES = "true";
    expect(await (await getFeatures(request())).json()).toEqual({ cannedReplies: false, testCases: true, suggestedReplies: true });
  });
});
