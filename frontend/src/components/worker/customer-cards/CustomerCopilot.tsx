"use client";

import { HttpAgent } from "@ag-ui/client";
import { CopilotKitProvider, type ReactToolCallRenderer } from "@copilotkit/react-core/v2";
import { CardSkeleton, ChoicesView, HelpdeskTicketView } from "@/components/worker/customer-cards/CustomerCards";
import { customerCardToolName, type CustomerCardData } from "@/lib/customer-cards";
import { getManagerToken } from "@/lib/manager-auth";
import { useState, type ReactNode } from "react";

export const CUSTOMER_CHAT_AGENT_ID = "customer-chat";

/**
 * The same auth as apiFetch: a public widget sends its organization's site
 * token; the Playground sends the manager's Clerk token, retried once with a
 * fresh one on a 401.
 */
function chatFetch(siteToken: string | undefined) {
  return async (url: string, init: RequestInit): Promise<Response> => {
    const attempt = async (fresh: boolean) => {
      const headers = new Headers(init.headers);
      if (siteToken) {
        headers.set("x-worker-site-token", siteToken);
      } else {
        const token = await getManagerToken(fresh);
        if (token) headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(url, { ...init, headers });
    };
    const response = await attempt(false);
    return response.status === 401 && !siteToken ? attempt(true) : response;
  };
}

// Module-level: CopilotKit requires a stable renderer list.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the provider's own element type
const CARD_RENDERERS: ReactToolCallRenderer<any>[] = [
  {
    name: customerCardToolName("choices"),
    agentId: CUSTOMER_CHAT_AGENT_ID,
    render: ({ args, status }) => (status === "inProgress" ? null : <ChoicesView data={args as CustomerCardData["choices"]} />),
  },
  {
    name: customerCardToolName("helpdesk_ticket"),
    agentId: CUSTOMER_CHAT_AGENT_ID,
    render: ({ args, status }) =>
      status === "inProgress" ? <CardSkeleton /> : <HelpdeskTicketView data={args as CustomerCardData["helpdesk_ticket"]} />,
  },
];

/**
 * CopilotKit for the customer chat (website widget and Playground). The agent
 * is the API's AG-UI endpoint (/api/v1/chat/agui), reached through the same
 * /api/v1 proxy as every other request; there is no separate CopilotKit
 * runtime, as with the admin Assistant (AssistantCopilot).
 */
export default function CustomerCopilot({ siteToken, children }: { siteToken?: string; children: ReactNode }) {
  const [agents] = useState(() => ({
    [CUSTOMER_CHAT_AGENT_ID]: new HttpAgent({
      agentId: CUSTOMER_CHAT_AGENT_ID,
      url: "/api/v1/chat/agui",
      fetch: chatFetch(siteToken?.trim() || undefined),
    }),
  }));
  return (
    <CopilotKitProvider
      agentId={CUSTOMER_CHAT_AGENT_ID}
      selfManagedAgents={agents}
      renderToolCalls={CARD_RENDERERS}
      showDevConsole={false}
      enableInspector={false}
    >
      {children}
    </CopilotKitProvider>
  );
}
