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

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
