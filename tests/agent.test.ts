import { describe, expect, it } from "vitest";
import { Agent } from "@openai/agents";
import { buildAgentTools } from "@/lib/agent";

function isWebSearchTool(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") return false;
  const candidate = tool as { type?: string; name?: string; providerData?: { type?: string } };
  return candidate.type === "hosted_tool" && candidate.name === "web_search" && candidate.providerData?.type === "web_search";
}

describe("agent internet_search tool wiring", () => {
  it("passes a web_search hosted tool into Agent when internet_search is enabled", () => {
    const tools = buildAgentTools({ toolsConfig: { internet_search: true } });
    const agent = new Agent({
      name: "Worker",
      instructions: "Help the user.",
      tools,
    });

    expect(tools).toHaveLength(1);
    expect(tools.some(isWebSearchTool)).toBe(true);
    expect(agent.tools).toHaveLength(1);
    expect(agent.tools.some(isWebSearchTool)).toBe(true);
  });

  it("does not pass web_search into Agent when internet_search is disabled", () => {
    const tools = buildAgentTools({ toolsConfig: { internet_search: false, browser_use: true } });
    const agent = new Agent({
      name: "Worker",
      instructions: "Help the user.",
      tools,
    });

    expect(tools).toEqual([]);
    expect(agent.tools).toEqual([]);
  });
});
