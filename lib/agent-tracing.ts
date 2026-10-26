import { Runner, getGlobalTraceProvider } from "@openai/agents";
import { initLangfuseTracing } from "@/lib/langfuse-tracing";
import { noteTurn } from "@/lib/timing";
import type { Agent, RunStreamEvent } from "@openai/agents";

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
  options: { maxTurns: number; context?: unknown },
) {
  initLangfuseTracing();
  const runner = new Runner(agentTraceRunConfig(workflowName, ctx));
  try {
    const result = await runner.run(agent, input, {
      maxTurns: options.maxTurns,
      ...(options.context !== undefined ? { context: options.context } : {}),
    });
    noteModelUsage(result);
    return result;
  } finally {
    await getGlobalTraceProvider()
      .forceFlush()
      .catch(() => undefined);
  }
}

/**
 * Input tokens the main model read and how many of them the provider served from
 * its prompt cache, on the turn's `[timing]` line (`inputTokens`, `cachedTokens`).
 */
function noteModelUsage(result: { rawResponses?: { usage?: { inputTokens?: number; inputTokensDetails?: unknown } }[] }) {
  for (const response of result.rawResponses ?? []) {
    noteTurn("inputTokens", response.usage?.inputTokens ?? 0);
    const details = response.usage?.inputTokensDetails;
    const cached = Array.isArray(details) ? details.reduce((sum, d) => sum + Number(d?.cached_tokens ?? 0), 0) : Number((details as Record<string, number> | undefined)?.cached_tokens ?? 0);
    noteTurn("cachedTokens", cached);
  }
}

/**
 * runTracedAgent, streamed: hands every run event to `onEvent` as it happens
 * (text deltas, tool calls) and resolves once the run has finished, with the
 * same result shape. A failed run throws, like the non-streamed call.
 */
export async function runTracedAgentStreamed(
  workflowName: string,
  ctx: AgentTraceContext,
  agent: Agent,
  input: string,
  options: { maxTurns: number; context?: unknown },
  onEvent: (event: RunStreamEvent) => void,
) {
  initLangfuseTracing();
  const runner = new Runner(agentTraceRunConfig(workflowName, ctx));
  try {
    const result = await runner.run(agent, input, {
      stream: true,
      maxTurns: options.maxTurns,
      ...(options.context !== undefined ? { context: options.context } : {}),
    });
    for await (const event of result) onEvent(event);
    await result.completed;
    if (result.error) throw result.error;
    return result;
  } finally {
    await getGlobalTraceProvider()
      .forceFlush()
      .catch(() => undefined);
  }
}
