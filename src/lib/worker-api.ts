export type Message = {
  id: string;
  conversationId: string;
  senderType: "customer" | "agent" | "manager";
  senderName: string;
  body: string;
  citations: string[];
  createdAt: string;
};

export type Conversation = {
  id: string;
  organizationId: string;
  ticketNumber: number;
  channel: "chat" | "email" | "widget";
  customerName: string;
  customerEmail: string | null;
  subject: string | null;
  status: "open" | "needs_human" | "resolved" | "closed";
  priority: string;
  assignedTo: string | null;
  confidence: number | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
};

export type ToolsConfig = {
  browser_use: boolean;
  internet: boolean;
  scribe: boolean;
  artifacts: boolean;
};

export type ChannelsConfig = {
  email: boolean;
  chat: boolean;
  voice: boolean;
};

export type WorkerProfile = {
  id: string;
  organizationId: string;
  name: string;
  displayName: string;
  avatarInitials: string;
  email: string | null;
  tone: string;
  role: string;
  jobDescription: string | null;
  systemPromptTemplate: string;
  model: string;
  maxAgentTurns: number;
  confidenceThreshold: number;
  escalationTerms: string[];
  allowedDomains: string[];
  requireUserVerification: boolean;
  managerName: string;
  managerEmail: string | null;
  autoReply: boolean;
  toolsConfig: ToolsConfig;
  channelsConfig: ChannelsConfig;
  ticketPrefix: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDocument = {
  id: string;
  organizationId: string;
  conceptId: string;
  title: string;
  description: string | null;
  tags: string[];
  body: string;
  checksum: string;
  resource: string | null;
  createdAt: string;
};

export type WidgetSite = {
  id: string;
  organizationId: string;
  siteToken: string;
  createdAt: string;
};

export type ChatResponse = {
  conversation_id: string;
  message: Message;
  status: Conversation["status"];
  confidence: number;
  escalated: boolean;
};

export type ApiFetchOptions = RequestInit & { widgetSiteToken?: string };

/**
 * No auth header, no login redirect — the backend's default identity adapter
 * resolves every manager request to one org with no session required. A
 * widget request instead carries the org-scoped site token.
 */
export async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init?.widgetSiteToken) {
    headers.set("x-worker-site-token", init.widgetSiteToken);
  }
  if (init?.body instanceof FormData) {
    headers.delete("Content-Type");
  }

  const requestInit: RequestInit = { ...(init ?? {}) };
  delete (requestInit as ApiFetchOptions).widgetSiteToken;

  const response = await fetch(`/api/v1${path}`, { ...requestInit, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
