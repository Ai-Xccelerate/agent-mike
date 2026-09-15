import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Every table below is org-scoped (`organizationId`). The default identity
 * adapter (lib/identity.ts) resolves every manager request to a single
 * "default" org, so a fresh deployment works with zero login — but the
 * schema is multi-tenant-ready from day one, per R16, without assuming any
 * particular auth vendor.
 */

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(), // slug-shaped, e.g. "default"
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workerProfiles = pgTable(
  "worker_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Identity (R14 / settings > Identity)
    name: text("name").notNull().default("Worker"),
    displayName: text("display_name").notNull().default("AI Worker"),
    avatarInitials: text("avatar_initials").notNull().default("AW"),
    slug: text("slug").notNull().default("worker"),
    status: text("status").notNull().default("active"), // active | paused
    avatarUrl: text("avatar_url"),
    accentColor: text("accent_color").notNull().default("#4F46E5"),
    bio: text("bio").notNull().default(""),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en-US"),
    email: text("email"),
    emailSignature: text("email_signature").notNull().default(""),
    tone: text("tone").notNull().default("Warm, concise, and honest about uncertainty."),

    // Role (settings > Role)
    role: text("role").notNull().default("Configure this worker's role and responsibilities."),
    jobDescription: text("job_description"),

    // Agent Configuration (settings > Agent Configuration) — R15: system prompt
    // must be exposed and editable without a code deployment.
    systemPromptTemplate: text("system_prompt_template").notNull().default(
      "You are {{displayName}}, an AI worker for {{organizationName}}.\n" +
        "Role: {{role}}\n" +
        "Tone: {{tone}}\n" +
        "Only use the supplied knowledge when making factual claims. If you are not confident, say so and escalate.",
    ),
    model: text("model").notNull().default("gpt-5.6-luna"),
    maxAgentTurns: integer("max_agent_turns").notNull().default(3),
    confidenceThreshold: real("confidence_threshold").notNull().default(0.72),

    // Guardrails (settings > Guardrails) — R10: domain/user restriction is a
    // standard, foundation-level feature, not built per-worker.
    escalationTerms: jsonb("escalation_terms").$type<string[]>().notNull().default(
      sql`'["refund","chargeback","lawyer","breach","security incident","delete my account","cancel subscription"]'::jsonb`,
    ),
    allowedDomains: jsonb("allowed_domains").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    requireUserVerification: boolean("require_user_verification").notNull().default(false),
    // Fail-closed: write tools (create/update in an external system) wait for a
    // human unless this worker is explicitly set to auto-execute.
    requireWriteApproval: boolean("require_write_approval").notNull().default(true),

    // Human manager (settings > Human Manager)
    managerName: text("manager_name").notNull().default("Manager"),
    managerEmail: text("manager_email"),
    autoReply: boolean("auto_reply").notNull().default(true),

    // Tools (settings > Tools) — toggles only; each tool is a decoupled,
    // externally-connected integration per R6, never baked into the harness.
    // Keep the live catalog keys (including scribe/artifacts). Internal AIX
    // tools also have connect state in integrations_config.
    toolsConfig: jsonb("tools_config")
      .$type<Record<string, boolean>>()
      .notNull()
      .default(sql`'{"browser_use":false,"internet_search":false,"scribe":false,"artifacts":false}'::jsonb`),

    // Skills — catalog ids from skills/*/SKILL.md the worker has turned on.
    // Empty until a later settings surface enables any; not wired into the agent yet.
    enabledSkills: jsonb("enabled_skills").$type<string[]>().notNull().default(sql`'[]'::jsonb`),

    // Integrations (settings > Integrations) — externally-connected systems per
    // R6. Each entry is per-integration state; `enabled` is the user-facing
    // toggle. Parchment is read-only, so it is default-allow and its toggle is
    // an opt-OUT. AgentDB (full SQL scope), Scribe (internal meeting talk),
    // Artifacts (writes) and Agent Wiki (can also write) are all default-off
    // opt-INs (see lib/integrations.ts).
    integrationsConfig: jsonb("integrations_config")
      .$type<Record<string, { enabled: boolean; [key: string]: unknown }>>()
      .notNull()
      .default(
        sql`'{"parchment":{"enabled":true,"workspaceId":null,"orgId":null},"agentdb":{"enabled":false,"workspaceId":null,"orgId":null},"scribe":{"enabled":false,"lookbackDays":null},"artifacts":{"enabled":false,"brandKitId":null,"allowPublish":false},"agent_wiki":{"enabled":false,"spaceId":null,"allowWrite":false}}'::jsonb`,
      ),

    // Channels (settings > Channels)
    channelsConfig: jsonb("channels_config")
      .$type<{ email: boolean; chat: boolean; voice: boolean }>()
      .notNull()
      .default(sql`'{"email":false,"chat":true,"voice":false}'::jsonb`),

    ticketPrefix: text("ticket_prefix").notNull().default("TCK"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgUnique: uniqueIndex("worker_profiles_org_unique").on(table.organizationId),
    slugUnique: uniqueIndex("worker_profiles_slug_unique").on(table.slug),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketNumber: integer("ticket_number").notNull(),
    channel: text("channel").notNull().default("chat"), // "chat" | "email" | "widget"
    customerName: text("customer_name").notNull().default("Website visitor"),
    customerEmail: text("customer_email"),
    subject: text("subject"),
    status: text("status").notNull().default("open"), // open | needs_human | resolved | closed
    priority: text("priority").notNull().default("normal"),
    assignedTo: text("assigned_to"),
    confidence: real("confidence"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("conversations_org_idx").on(table.organizationId),
    orgTicketUnique: uniqueIndex("conversations_org_ticket_unique").on(
      table.organizationId,
      table.ticketNumber,
    ),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderType: text("sender_type").notNull(), // "customer" | "agent" | "manager"
    senderName: text("sender_name").notNull(),
    body: text("body").notNull(),
    citations: jsonb("citations").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_idx").on(table.conversationId),
  }),
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conceptId: text("concept_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    body: text("body").notNull(),
    checksum: text("checksum").notNull(),
    resource: text("resource"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgConceptUnique: uniqueIndex("knowledge_documents_org_concept_unique").on(
      table.organizationId,
      table.conceptId,
    ),
  }),
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    heading: text("heading"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentIdx: index("knowledge_chunks_document_idx").on(table.documentId),
  }),
);

export const widgetSites = pgTable(
  "widget_sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteToken: text("site_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgUnique: uniqueIndex("widget_sites_org_unique").on(table.organizationId),
    tokenUnique: uniqueIndex("widget_sites_token_unique").on(table.siteToken),
  }),
);

export const workerUsers = pgTable(
  "worker_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").notNull().default("member"), // owner | admin | member
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgEmailUnique: uniqueIndex("worker_users_org_email_unique").on(
      table.organizationId,
      table.email,
    ),
  }),
);

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    integrationType: text("integration_type").notNull(), // crm | helpdesk | ticketing
    system: text("system").notNull(), // Composio toolkit slug, e.g. "zoho"
    composioAuthConfigId: text("composio_auth_config_id").notNull(),
    composioConnectedAccountId: text("composio_connected_account_id"), // null until OAuth completes
    status: text("status").notNull().default("pending"), // pending | active | failed | disabled
    connectedBy: text("connected_by"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsed: timestamp("last_used", { withTimezone: true }),
  },
  (table) => ({
    orgTypeUnique: uniqueIndex("integration_connections_org_type_unique").on(
      table.organizationId,
      table.integrationType,
    ),
  }),
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    toolId: text("tool_id").notNull(),
    calledBy: text("called_by"),
    input: jsonb("input")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    output: jsonb("output").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("success"), // success | error | escalated
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("tool_calls_org_idx").on(table.organizationId),
  }),
);

export const toolApprovals = pgTable(
  "tool_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    toolId: text("tool_id").notNull(),
    input: jsonb("input")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgStatusIdx: index("tool_approvals_org_status_idx").on(table.organizationId, table.status),
  }),
);

/**
 * Email domains the worker is allowed to share activity with.
 *
 * The list is an allow-list, not a block-list: a domain that is not approved
 * here is one the worker may not send to, so an empty table means "nowhere
 * outside the org". A row is never hard-deleted on a decision — revoking keeps
 * it with `status = 'revoked'` so the audit trail survives and re-approving is
 * one click rather than retyping the domain and its justification.
 */
export const emailDomains = pgTable(
  "email_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Normalized: lowercase, no scheme, no leading @, no trailing dot. */
    domain: text("domain").notNull(),
    /** Why the worker needs it. Free text, optional. */
    reason: text("reason"),
    // pending | approved | revoked
    status: text("status").notNull().default("pending"),
    /** Who asked: "manager" when added here, "agent" when the worker raised it. */
    requestedBy: text("requested_by").notNull().default("manager"),
    /** Who approved or revoked it, and when. Null while still pending. */
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // One row per domain per org — asking twice updates the request rather
    // than creating a second one that could be approved and revoked at once.
    orgDomainUnique: uniqueIndex("email_domains_org_domain_unique").on(
      table.organizationId,
      table.domain,
    ),
    orgStatusIdx: index("email_domains_org_status_idx").on(table.organizationId, table.status),
  }),
);

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const knowledgeDocumentsRelations = relations(knowledgeDocuments, ({ many }) => ({
  chunks: many(knowledgeChunks),
}));
