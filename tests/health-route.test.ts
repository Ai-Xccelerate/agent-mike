import { describe, expect, it, vi } from "vitest";

const prewarm = vi.hoisted(() => vi.fn(async () => 1));
vi.mock("@/lib/tools-integrations/atlassian", () => ({ prewarmRequestTypeCatalogs: prewarm }));

import { GET } from "@/app/api/health/route";

describe("the health check Railway calls on every deploy", () => {
  it("answers ok at once and starts warming the Jira request types in the background", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "ai-worker-api" });
    expect(prewarm).toHaveBeenCalledTimes(1);
  });

  it("still answers ok when warming fails", async () => {
    prewarm.mockRejectedValueOnce(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
