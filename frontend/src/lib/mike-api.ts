import { getManagerToken } from "@/lib/mike-auth";

export type Citation = {
  document_id?: string;
  concept_id: string;
  title: string;
  heading?: string | null;
  resource?: string | null;
};

export type Message = {
  id: string;
  sender_type: "customer" | "agent" | "human";
  sender_name: string;
  body: string;
  citations: Citation[];
  created_at: string;
};

export type Conversation = {
  id: string;
  ticket_number?: number | null;
  channel: "email" | "chat";
  customer_name: string;
  customer_email?: string | null;
  subject: string;
  status: "open" | "resolved" | "needs_human" | "human_active" | "closed";
  priority: string;
  assigned_to: string;
  confidence?: number | null;
  summary?: string | null;
  created_at: string;
  updated_at: string;
  messages: Message[];
};

export type AgentProfile = {
  id: string;
  name: string;
  display_name: string;
  email: string;
  role: string;
  tone: string;
  manager_name: string;
  manager_email: string;
  auto_reply: boolean;
  confidence_threshold: number;
  max_agent_turns: number;
  guardrails: string[];
  escalation_terms: string[];
  updated_at: string;
};

export type NylasMailbox = {
  id: string;
  organization_id: string;
  email: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type KnowledgeDocument = {
  id: string;
  concept_id: string;
  type: string;
  title: string;
  description?: string | null;
  resource?: string | null;
  tags: string[];
  status: string;
  source_timestamp?: string | null;
  ingested_at: string;
  chunk_count: number;
};

export type ApiFetchOptions = RequestInit & { widget?: boolean };

export async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (init?.widget) {
    const siteToken = process.env.NEXT_PUBLIC_MIKE_WIDGET_SITE_TOKEN;
    if (siteToken) headers.set("x-mike-site-token", siteToken);
  } else {
    const token = await getManagerToken();
    if (!token) {
      throw new Error("Not signed in");
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Let the browser set multipart boundaries for FormData uploads.
  if (init?.body instanceof FormData) {
    headers.delete("Content-Type");
  }

  const requestInit: RequestInit = { ...(init ?? {}) };
  delete (requestInit as ApiFetchOptions).widget;
  const response = await fetch(`/api/v1${path}`, {
    ...requestInit,
    headers,
    credentials: "omit",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
