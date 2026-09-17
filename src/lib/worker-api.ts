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
  channel: "chat" | "email" | "widget" | "assistant";
  customerName: string;
  customerEmail: string | null;
  subject: string | null;
  status: "open" | "needs_human" | "resolved" | "closed";
  priority: string;
  assignedTo: string | null;
  humanControlled: boolean;
  archived: boolean;
  confidence: number | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
};

/**
 * General-purpose capability toggles stored on the profile.
 * Keep the live catalog keys (scribe/artifacts) so we do not drop Adarsh's
 * toolsConfig shape. Internal AIX tools also have connect cards on Tools.
 */
export type ToolsConfig = {
  browser_use: boolean;
  internet_search: boolean;
  scribe: boolean;
  artifacts: boolean;
};

export type ChannelsConfig = {
  email: boolean;
  chat: boolean;
  voice: boolean;
};

export type WorkerStatus = "active" | "paused";

export type WorkerProfile = {
  id: string;
  organizationId: string;
  /** The org's real display name (e.g. "Default Workspace") — read-only here, set outside this profile. */
  organizationName: string;
  name: string;
  displayName: string;
  avatarInitials: string;
  slug: string;
  status: WorkerStatus;
  avatarUrl: string | null;
  accentColor: string;
  bio: string;
  timezone: string;
  locale: string;
  email: string | null;
  emailSignature: string;
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
  enabledSkills: string[];
  createdAt: string;
  updatedAt: string;
};

export type SkillCatalogEntry = {
  id: string;
  name: string;
  description: string;
  requires: string[];
  requirementsMet: boolean;
  enabled: boolean;
  source: "catalog" | "custom";
};

export function getSkillsCatalog(): Promise<SkillCatalogEntry[]> {
  return apiFetch<SkillCatalogEntry[]>("/skills");
}

/** A skill's full instructions — never included in the list response above. */
export type SkillDetail = {
  id: string;
  name: string;
  description: string;
  requires: string[];
  body: string;
};

export function getSkillDetail(id: string): Promise<SkillDetail> {
  return apiFetch<SkillDetail>(`/skills/${id}`);
}

export type CustomSkillInput = {
  name: string;
  description: string;
  requires: string[];
  body: string;
};

export function createCustomSkill(input: CustomSkillInput): Promise<SkillCatalogEntry> {
  return apiFetch<SkillCatalogEntry>("/skills/custom", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCustomSkill(
  id: string,
  input: Partial<CustomSkillInput>,
): Promise<SkillCatalogEntry> {
  return apiFetch<SkillCatalogEntry>(`/skills/custom/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteCustomSkill(id: string): Promise<void> {
  await apiFetch<unknown>(`/skills/custom/${id}`, { method: "DELETE" });
}

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

/**
 * Settings > Integrations. Two separate things decide whether an integration
 * runs: `available` (the server holds its credentials — not user-editable) and
 * `enabled` (this worker's own toggle). `active` is both, and is the only one
 * that means "it is actually running".
 */
export type IntegrationStatus = {
  key: string;
  name: string;
  description: string;
  available: boolean;
  enabled: boolean;
  active: boolean;
  unavailableReason: string | null;
  settings: Record<string, unknown>;
};

export type ParchmentSettings = {
  workspace_id: string | null;
  org_id: string;
  org_id_override: string | null;
  api_url: string | null;
};

export type ParchmentWorkspace = {
  id: string;
  name: string;
  visibility: string;
};

/**
 * `GET /integrations/parchment` — the status, plus a live workspace lookup
 * against Parchment when the integration is active. `error` is that lookup
 * failing: the integration is configured and on, but Parchment did not answer.
 */
export type ParchmentIntegration = IntegrationStatus & {
  settings: ParchmentSettings;
  workspaces: ParchmentWorkspace[];
  default_workspace_id: string | null;
  error: string | null;
};

/** PATCH bodies send only the keys they change. */
export type ParchmentPatch = {
  enabled?: boolean;
  workspaceId?: string | null;
  orgId?: string | null;
};

export type AgentDbSettings = {
  workspace_id: string | null;
  org_id: string;
  org_id_override: string | null;
  api_url: string | null;
  /**
   * Whether this server can run AgentDB's one-time enable call at all. AgentDB
   * requires a user's Clerk JWT there and this build has no Clerk, so the card
   * has to be able to explain why switching on may not stick.
   */
  can_enable_org: boolean;
};

/**
 * `GET /integrations/agentdb` — the stored status, plus a live workspace lookup
 * when the integration is active.
 *
 * `has_access: false` is not an error: AgentDB answered 200 to say the org is
 * not entitled to it in AIX Core. `error` is everything else — unreachable,
 * never enabled, or a rejected credential.
 */
export type AgentDbIntegration = IntegrationStatus & {
  settings: AgentDbSettings;
  workspaces: ParchmentWorkspace[];
  default_workspace_id: string | null;
  has_access: boolean | null;
  error: string | null;
};

/** `POST /integrations/agentdb/test` — the MCP handshake plus get_agents_md. */
export type AgentDbConnectionTest = {
  ok: boolean;
  mcpReachable: boolean;
  agentsMdBytes: number;
  workspaceId: string | null;
  error: string | null;
  errorKind: string | null;
};

export type AgentDbPatch = {
  enabled?: boolean;
  workspaceId?: string | null;
  orgId?: string | null;
};

export type ScribeSettings = {
  /** Evidence window in days, or null for the whole meeting corpus. */
  lookback_days: number | null;
  api_url: string | null;
};

export type ScribeMeeting = {
  id: string;
  title: string;
  startTime: string | null;
  status: string | null;
  hasTranscript: boolean;
};

/**
 * `GET /integrations/scribe` — the stored status, plus a live peek at the
 * meeting corpus when the integration is active, so the screen can show the
 * token reaches real data rather than merely being well-formed.
 */
export type ScribeIntegration = IntegrationStatus & {
  settings: ScribeSettings;
  meeting_count: number | null;
  recent_meetings: ScribeMeeting[];
  error: string | null;
};

/** `POST /integrations/scribe/test`. */
export type ScribeConnectionTest = {
  ok: boolean;
  meetingCount: number;
  recentMeetings: ScribeMeeting[];
  error: string | null;
  errorKind: string | null;
};

export type ScribePatch = {
  enabled?: boolean;
  lookbackDays?: number | null;
};

export type ChatResponse = {
  conversation_id: string;
  // null when a manager has taken over the conversation — the agent didn't reply.
  message: Message | null;
  status: Conversation["status"];
  confidence: number;
  escalated: boolean;
};

/** The admin assistant's own chat endpoint (see /api/v1/assistant/chat) — no guardrail/escalation concepts, it's the manager asking their own assistant a question. */
export type AssistantChatResponse = {
  conversation_id: string;
  message: Message;
};

export type ApiFetchOptions = RequestInit & { widgetSiteToken?: string };

export class WorkerApiError extends Error {
  status: number;
  errors?: Record<string, string>;

  constructor(message: string, status: number, errors?: Record<string, string>) {
    super(message);
    this.name = "WorkerApiError";
    this.status = status;
    this.errors = errors;
  }
}

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
    let errors: Record<string, string> | undefined;
    let message = `Request failed with ${response.status}`;
    if (response.headers.get("content-type")?.includes("application/json")) {
      try {
        const parsed = JSON.parse(detail) as { error?: string; errors?: Record<string, string> };
        if (parsed?.errors && typeof parsed.errors === "object") errors = parsed.errors;
        if (typeof parsed?.error === "string") message = parsed.error;
      } catch {
        /* keep the generic status message */
      }
    }
    throw new WorkerApiError(message, response.status, errors);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type IntegrationConnection = {
  id: string;
  organizationId: string;
  integrationType: string;
  system: string;
  status: "pending" | "active" | "failed" | "disabled";
  composioConnectedAccountId: string | null;
  connectedBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsed: string | null;
} | null;

export function getIntegrationConnection(type: string): Promise<IntegrationConnection> {
  return apiFetch<IntegrationConnection>(`/integrations/${type}`);
}

export function connectIntegration(type: string, system: string): Promise<{ redirectUrl: string }> {
  return apiFetch<{ redirectUrl: string }>(`/integrations/${type}/connect`, {
    method: "POST",
    body: JSON.stringify({ system }),
  });
}

export async function disconnectIntegration(type: string): Promise<void> {
  await apiFetch<unknown>(`/integrations/${type}`, { method: "DELETE" });
}

export type ArtifactsSettings = {
  brand_kit_id: string | null;
  allow_publish: boolean;
  /** The workspace tokens act as, for display. Null unless configured. */
  workspace: string | null;
  api_url: string | null;
};

export type ArtifactsTool = {
  name: string;
  description: string;
  /** True when the tool changes state rather than only reading it. */
  writes: boolean;
};

export type ArtifactsBrandKit = {
  id: string;
  name: string;
  isDefault: boolean;
  usable: boolean;
};

/**
 * `GET /integrations/artifacts` — the stored status, plus the live tool surface
 * and brand kits when active, so the screen shows what the worker can actually
 * do rather than a hardcoded promise.
 */
export type ArtifactsIntegration = IntegrationStatus & {
  settings: ArtifactsSettings;
  tools: ArtifactsTool[];
  brand_kits: ArtifactsBrandKit[];
  error: string | null;
};

/** `POST /integrations/artifacts/test`. */
export type ArtifactsConnectionTest = {
  ok: boolean;
  toolCount: number;
  tools: ArtifactsTool[];
  brandKits: ArtifactsBrandKit[];
  error: string | null;
  errorKind: string | null;
};

export type ArtifactsPatch = {
  enabled?: boolean;
  brandKitId?: string | null;
  allowPublish?: boolean;
};

export type AgentWikiSettings = {
  /** One space, or null for every space the key reaches. */
  space_id: string | null;
  allow_write: boolean;
  /** What the key was created for, for display. Null unless configured. */
  key_label: string | null;
  api_url: string | null;
};

export type AgentWikiTool = {
  name: string;
  description: string;
  /** True when the tool changes a page rather than only reading it. */
  writes: boolean;
};

export type AgentWikiSpace = {
  id: string;
  name: string;
  /** The role the key holds in the space, when the server reports one. */
  role: string | null;
  pageCount: number | null;
};

/**
 * `GET /integrations/agent-wiki` — the stored status, plus the live tool
 * surface and reachable spaces when active.
 *
 * `key_can_write` is the key's own permission, which is separate from
 * `settings.allow_write` and outranks it: Agent Wiki refuses a write the key
 * was not granted, whatever this worker is set to. Null when not looked up.
 */
export type AgentWikiIntegration = IntegrationStatus & {
  settings: AgentWikiSettings;
  tools: AgentWikiTool[];
  spaces: AgentWikiSpace[];
  key_can_write: boolean | null;
  search_tool: string | null;
  error: string | null;
};

/** `POST /integrations/agent-wiki/test`. */
export type AgentWikiConnectionTest = {
  ok: boolean;
  toolCount: number;
  tools: AgentWikiTool[];
  spaces: AgentWikiSpace[];
  canWrite: boolean;
  searchTool: string | null;
  error: string | null;
  errorKind: string | null;
};

export type AgentWikiPatch = {
  enabled?: boolean;
  spaceId?: string | null;
  allowWrite?: boolean;
};

/**
 * Settings > Email domains — the allow-list of domains this worker may share
 * activity with.
 *
 * An allow-list, not a block-list: a domain with no approved row here is one
 * the worker may not reach, so an empty list means nobody outside the org. A
 * decision never deletes the row — revoking keeps it so the record of what was
 * allowed survives and re-approving is one click.
 */
export type EmailDomainStatus = "pending" | "approved" | "revoked";

export type EmailDomain = {
  id: string;
  organizationId: string;
  domain: string;
  reason: string | null;
  status: EmailDomainStatus;
  /** "manager" when added in Settings, "agent" when the worker asked for it. */
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** `GET /email-domains`. */
export type EmailDomainList = {
  domains: EmailDomain[];
  counts: Record<EmailDomainStatus, number>;
};

/** `PATCH /email-domains/:id` — the action, not the target state. */
export type EmailDomainDecision = "approve" | "revoke";

/**
 * Settings > Identity > Mailbox — the worker's own address and calendar,
 * connected through Nylas.
 *
 * Identity, not a delegated connection: this is what the agent sends *from*.
 * `available` means the server holds the Nylas application credentials;
 * `connected` means this org has a live grant. Both must be true before the
 * worker can send anything.
 */
export type MailboxRecord = {
  id: string;
  email: string;
  provider: string | null;
  /** connected | invalid | disconnected. `invalid` means reconnect. */
  status: string;
  connectedBy: string | null;
  connectedAt: string;
  lastCheckedAt: string | null;
};

/** `GET /mailbox`. */
export type MailboxStatus = {
  available: boolean;
  connected: boolean;
  mailbox: MailboxRecord | null;
  /** us | eu | custom — data residency, fixed once a grant exists. */
  region: string;
  api_url: string | null;
  /** What must be registered as a callback URI on the Nylas application. */
  callback_uri: string;
  /** Whether this agent is on its own Nylas application or the fleet's. */
  credentials: CredentialSummary;
  unavailableReason: string | null;
  /** Nylas was unreachable, as distinct from the mailbox being gone. */
  error: string | null;
};

export type MailboxMessage = {
  id: string;
  subject: string;
  from: string;
  date: string | null;
  unread: boolean;
};

export type MailboxEvent = {
  id: string;
  title: string;
  when: string | null;
};

/** `POST /mailbox/test`. */
export type MailboxConnectionTest = {
  ok: boolean;
  email: string | null;
  provider: string | null;
  messageCount: number;
  recentMessages: MailboxMessage[];
  upcomingEvents: MailboxEvent[];
  error: string | null;
  errorKind: string | null;
};

/**
 * Whether this agent has its own Nylas application, or uses the fleet's.
 *
 * Never carries a secret — not even masked, since a mask still leaks length
 * and re-entering is the recovery path. It says which fields are set and
 * where they came from, and nothing else.
 */
export type CredentialSummary = {
  /** "org" = this agent's own, "env" = the fleet's, "none" = unconfigured. */
  source: "org" | "env" | "none";
  present: string[];
  missing: string[];
  updatedAt: string | null;
  updatedBy: string | null;
  metadata: Record<string, unknown>;
};

/** `PUT /mailbox/credentials`. */
export type NylasCredentialsInput = {
  clientId: string;
  apiKey: string;
  apiUri?: string;
};

/**
 * Settings > Skills > skill repository — the organization's published skills,
 * reached over MCP.
 *
 * A third source alongside the catalog and custom skills, and the only one not
 * enabled skill by skill: the worker finds a skill by describing its task, so
 * the settings are a scope, not a list.
 */
export type AgentSkillsSettings = {
  /** One category, or null for the whole repository. */
  category: string | null;
  max_results: number;
  api_url: string | null;
};

export type SkillRepositoryCategory = {
  name: string;
  count: number | null;
};

export type SkillRepositoryTool = {
  name: string;
  description: string;
};

export type RepositorySkillResult = {
  slug: string;
  name: string;
  description: string;
  category: string | null;
};

/** `GET /integrations/agent-skills`. */
export type AgentSkillsIntegration = IntegrationStatus & {
  settings: AgentSkillsSettings;
  credentials: CredentialSummary;
  categories: SkillRepositoryCategory[];
  error: string | null;
};

/** `POST /integrations/agent-skills/test`. */
export type AgentSkillsConnectionTest = {
  ok: boolean;
  toolCount: number;
  tools: SkillRepositoryTool[];
  categories: SkillRepositoryCategory[];
  error: string | null;
  errorKind: string | null;
};

export type AgentSkillsPatch = {
  enabled?: boolean;
  category?: string | null;
  maxResults?: number;
};

/** `PUT /integrations/agent-skills/credentials`. */
export type SkillsCredentialsInput = {
  apiKey: string;
  apiUrl?: string;
};
