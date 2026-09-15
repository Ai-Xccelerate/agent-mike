import { describe, expect, it } from "vitest";
import { MultiAgentIdentityAdapter } from "@/lib/identity";

/**
 * An agent is an org. These assert the only new thing that idea introduces:
 * turning whatever a request claims into an org id that is safe to query with.
 */
function request(options: { header?: string; query?: string }) {
  const url = new URL("https://api.example.com/api/v1/worker");
  if (options.query !== undefined) url.searchParams.set("agent", options.query);
  return {
    headers: { get: (name: string) => (name === "x-aix-agent" ? (options.header ?? null) : null) },
    nextUrl: url,
  } as unknown as Parameters<MultiAgentIdentityAdapter["resolveManagerRequest"]>[0];
}

describe("agent id normalization", () => {
  it("accepts the slug shapes an agent is actually named with", () => {
    expect(MultiAgentIdentityAdapter.normalize("george")).toBe("george");
    expect(MultiAgentIdentityAdapter.normalize("AGENT-George")).toBe("agent-george");
    expect(MultiAgentIdentityAdapter.normalize("  jules  ")).toBe("jules");
  });

  it("strips anything that could change the meaning of a query", () => {
    // The org id reaches a WHERE clause, so it may only ever be a slug.
    expect(MultiAgentIdentityAdapter.normalize("george'; drop table--")).toBe("georgedroptable--");
    expect(MultiAgentIdentityAdapter.normalize("../../etc")).toBe("etc");
    expect(MultiAgentIdentityAdapter.normalize("a b/c")).toBe("abc");
  });

  it("treats empty and junk-only input as absent, not as an org named ''", () => {
    for (const value of ["", "   ", "!!!", "///", null, undefined]) {
      expect(MultiAgentIdentityAdapter.normalize(value)).toBeNull();
    }
  });

  it("bounds the length, so a header cannot be used to write an essay", () => {
    expect(MultiAgentIdentityAdapter.normalize("g".repeat(500))).toHaveLength(64);
  });
});

describe("resolving which agent a request is for", () => {
  it("reads the header", async () => {
    const tenant = await new MultiAgentIdentityAdapter().resolveManagerRequest(
      request({ header: "george" }),
    );
    expect(tenant.orgId).toBe("george");
    expect(tenant.source).toBe("multi-agent");
  });

  it("falls back to the query for a browser that cannot set a header", async () => {
    const tenant = await new MultiAgentIdentityAdapter().resolveManagerRequest(
      request({ query: "jules" }),
    );
    expect(tenant.orgId).toBe("jules");
  });

  it("prefers the header when both are present", async () => {
    const tenant = await new MultiAgentIdentityAdapter().resolveManagerRequest(
      request({ header: "george", query: "jules" }),
    );
    expect(tenant.orgId).toBe("george");
  });

  it("falls back to the configured default when nothing names an agent", async () => {
    const tenant = await new MultiAgentIdentityAdapter("default").resolveManagerRequest(request({}));
    expect(tenant.orgId).toBe("default");
  });

  it("never yields an empty org from a junk header", async () => {
    const tenant = await new MultiAgentIdentityAdapter("default").resolveManagerRequest(
      request({ header: "!!!" }),
    );
    expect(tenant.orgId).toBe("default");
  });
});
