import { Runner, getGlobalTraceProvider } from "@openai/agents";
import type { Agent } from "@openai/agents";

export const CUSTOMER_CHAT_WORKFLOW = "Customer chat";
export const ASSISTANT_CHAT_WORKFLOW = "Assistant chat";

export type AgentTraceContext = {
  organizationId: string;
  conversationId?: string;
};

/** Runner options that name the workflow and tag a support thread. */
export function agentTraceRunConfig(workflowName: string, ctx: AgentTraceContext) {
  return {
    workflowName,
    groupId: ctx.conversationId,
    traceMetadata: {
      organizationId: ctx.organizationId,
      ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
    },
  };
}

/**
 * Run an agent inside a named OpenAI trace so the dashboard can filter by
 * workflow and conversation. Flush so a Railway request doesn't leave the
 * last batch sitting in memory until the next interval.
 */
export async function runTracedAgent(
  workflowName: string,
  ctx: AgentTraceContext,
  agent: Agent,
  input: string,
  options: { maxTurns: number },
) {
  const runner = new Runner(agentTraceRunConfig(workflowName, ctx));
  try {
    return await runner.run(agent, input, { maxTurns: options.maxTurns });
  } finally {
    await getGlobalTraceProvider()
      .forceFlush()
      .catch(() => undefined);
  }
}
