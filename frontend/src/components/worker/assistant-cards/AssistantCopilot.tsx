"use client";

import { HttpAgent } from "@ag-ui/client";
import { CopilotKitProvider, type ReactToolCallRenderer } from "@copilotkit/react-core/v2";
import {
  CardSkeleton,
  ConfigAuditView,
  ConfigView,
  DraftView,
  KnowledgeListView,
  KnowledgeResultsView,
  PanelView,
  TicketListView,
  TicketView,
} from "@/components/worker/assistant-cards/AssistantCards";
import { cardToolName, type AssistantCardData, type AssistantCardKind } from "@/lib/assistant-cards";
import { getManagerToken } from "@/lib/manager-auth";
import { useState, type ComponentType, type ReactNode } from "react";

export const ASSISTANT_AGENT_ID = "assistant";

/**
 * Same auth as apiFetch: a Clerk bearer token, retried once with a fresh one
 * on a 401 (a cached token can expire between the browser and the API).
 */
async function authedFetch(url: string, init: RequestInit): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    const headers = new Headers(init.headers);
    const token = await getManagerToken(fresh);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  const response = await attempt(false);
  return response.status === 401 ? attempt(true) : response;
}

type CardProps<K extends AssistantCardKind> = { data: AssistantCardData[K] };

/**
 * One CopilotKit tool-call renderer per card kind. Cards arrive as
 * `render_<kind>` tool calls whose arguments are the card's data, in one
 * piece, so "in progress" only lasts a moment; a draft renders while it's
 * still arriving.
 */
function cardRenderer<K extends AssistantCardKind>(kind: K, View: ComponentType<CardProps<K>>): ReactToolCallRenderer<AssistantCardData[K]> {
  return {
    name: cardToolName(kind),
    agentId: ASSISTANT_AGENT_ID,
    render: ({ args, status }) =>
      status === "inProgress" ? <CardSkeleton /> : <View data={args as AssistantCardData[K]} />,
  };
}

// Module-level: CopilotKit requires a stable renderer list.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the provider's own element type
const CARD_RENDERERS: ReactToolCallRenderer<any>[] = [
  cardRenderer("ticket_list", TicketListView),
  cardRenderer("ticket", TicketView),
  cardRenderer("knowledge_results", KnowledgeResultsView),
  cardRenderer("knowledge_list", KnowledgeListView),
  cardRenderer("config", ConfigView),
  cardRenderer("config_audit", ConfigAuditView),
  cardRenderer("panel", PanelView),
  {
    name: cardToolName("draft"),
    agentId: ASSISTANT_AGENT_ID,
    render: ({ args, status }) => <DraftView data={args} streaming={status === "inProgress"} />,
  } satisfies ReactToolCallRenderer<AssistantCardData["draft"]>,
];

/**
 * CopilotKit for the admin Assistant. The agent is the API's own AG-UI
 * endpoint (/api/v1/assistant/agui), reached through the same /api/v1
 * proxy and Clerk token as every other request; there is no separate
 * CopilotKit runtime. To move behind a CopilotRuntime instead (CopilotKit
 * reserves selfManagedAgents for its licensed tier), swap
 * selfManagedAgents for runtimeUrl here; nothing else changes.
 */
export default function AssistantCopilot({ children }: { children: ReactNode }) {
  const [agents] = useState(() => ({
    [ASSISTANT_AGENT_ID]: new HttpAgent({
      agentId: ASSISTANT_AGENT_ID,
      url: "/api/v1/assistant/agui",
      fetch: authedFetch,
    }),
  }));
  return (
    <CopilotKitProvider
      agentId={ASSISTANT_AGENT_ID}
      selfManagedAgents={agents}
      renderToolCalls={CARD_RENDERERS}
      showDevConsole={false}
      enableInspector={false}
    >
      {children}
    </CopilotKitProvider>
  );
}
