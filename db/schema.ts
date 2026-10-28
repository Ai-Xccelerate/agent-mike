import { relations, sql } from "drizzle-orm";
import type { AssistantCard } from "@/lib/assistant-cards";
import type { CustomerCard } from "@/lib/customer-cards";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
    // Brand orange (#F47920) — matches the app's own icon.svg default and
    // CLAUDE.md's "never blue/indigo" rule, so an org with no chosen color
    // yet doesn't get a favicon/avatar mismatch out of the box.
    accentColor: text("accent_color").notNull().default("#F47920"),
    title: text("title").notNull().default(""),
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
    //
    // Holds only the *additional* instructions beyond identity/role/tone —
    // those three are built deterministically in lib/agent.ts's
    // buildInstructions from the Identity/Role columns above, not from this
    // field, so they can never be silently lost by editing this text. This
    // field used to hold the whole scaffold including a "{{role}}"-style
    // placeholder block; see migration 0019 for the one-time cleanup of rows
    // saved under that older shape.
    systemPromptTemplate: text("system_prompt_template").notNull().default(
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
    // Customer identity in the widget: off | email_match | email_code (lib/customer-identity.ts).
    identityMode: text("identity_mode").notNull().default("off"),
    // What the website widget opens with (Settings > Channels > Chat). Null = the built-in
    // greeting / quick actions. "{name}" in the message becomes the worker's customer-facing name.
    welcomeMessage: text("welcome_message"),
    quickActions: jsonb("quick_actions").$type<string[] | null>(),
    // Fail-closed: write tools (create/update in an external system) wait for a
    // human unless this worker is explicitly set to auto-execute.
    requireWriteApproval: boolean("require_write_approval").notNull().default(true),
    // Off by default - gates the admin Assistant's Tier 4 "Act" tools
    // (send a reply, resolve a ticket, publish a knowledge article) entirely.
    // Distinct from requireWriteApproval above (that one is about the
    // customer-facing agent's own external-system writes); the Assistant
    // always requires an explicit confirm-then-yes turn regardless of this
    // flag - this just controls whether those tools are offered at all.
    assistantActionsEnabled: boolean("assistant_actions_enabled").notNull().default(false),

    // Human manager (settings > Human Manager)
    managerName: text("manager_name").notNull().default("Manager"),
    managerEmail: text("manager_email"),
    autoReply: boolean("auto_reply").notNull().default(true),
    // Email the manager when the worker hands a conversation over (any channel).
    emailManagerOnHandoff: boolean("email_manager_on_handoff").notNull().default(true),
    /** Visitors may attach files in the website chat (passed to the team; the worker never reads them). */
    chatAttachments: boolean("chat_attachments").notNull().default(false),
    // The team's first-reply target in hours, shown on the Overview. Null = none.
    firstReplyTargetHours: integer("first_reply_target_hours"),
    // The request types, tiers and labels this worker classifies tickets with
    // (lib/ticket-schema.ts). Null = the built-in defaults.
    ticketSchema: jsonb("ticket_schema").$type<{ requestTypes: string[]; tiers: string[]; labels: string[] }>(),
    // Settings > Email domains: on = the worker may only email approved
    // domains; off (default) = any domain.
    restrictEmailDomains: boolean("restrict_email_domains").notNull().default(false),

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
        sql`'{"parchment":{"enabled":true,"workspaceId":null,"orgId":null},"agentdb":{"enabled":false,"workspaceId":null,"orgId":null},"scribe":{"enabled":false,"lookbackDays":null},"artifacts":{"enabled":false,"brandKitId":null,"allowPublish":false},"agent_wiki":{"enabled":false,"spaceId":null,"allowWrite":false},"agent_skills":{"enabled":false,"category":null,"maxResults":5}}'::jsonb`,
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
    // Per org, not global. Two agents may each call their worker "support";
    // what must not collide is two workers inside one org.
    orgSlugUnique: uniqueIndex("worker_profiles_org_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
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
    // Set once a code sent to customerEmail was typed back. Until then the
    // email is only what the visitor said (lib/customer-identity.ts).
    customerEmailVerifiedAt: timestamp("customer_email_verified_at", { withTimezone: true }),
    // How the identity was learned: widget_card | email_code.
    identitySource: text("identity_source"),
    subject: text("subject"),
    status: text("status").notNull().default("open"), // open | needs_human | resolved | closed
    priority: text("priority").notNull().default("normal"),
    assignedTo: text("assigned_to"),
    // A manager has taken direct control (Inbox "Take over" button) — the
    // agent stops replying on this conversation until it's handed back.
    humanControlled: boolean("human_controlled").notNull().default(false),
    confidence: real("confidence"),
    summary: text("summary"),
    // Two sentences on what the ticket is about, for whoever picks it up (lib/ticket-classifier.ts).
    ticketSummary: text("ticket_summary"),
    // How many of this conversation's messages (oldest-first) are already
    // folded into `summary` — the watermark a rolling summarization pass
    // advances so it never re-summarizes the same messages twice.
    summarizedMessageCount: integer("summarized_message_count").notNull().default(0),
    // Soft-delete: archived conversations are hidden by default and
    // restorable, instead of the row being gone for good.
    archived: boolean("archived").notNull().default(false),
    // Email channel: the provider's thread id (Nylas thread_id), so a reply
    // in the same email thread lands on the same conversation.
    externalThreadId: text("external_thread_id"),
    // The helpdesk ticket raised when this conversation was handed to a
    // person (e.g. Jira "SUP-12"). Also what the customer agent may look up:
    // a customer sees only tickets recorded on their own conversations.
    externalTicketKey: text("external_ticket_key"),
    // The person from Settings > Human manager the worker routed this conversation to when it was handed over.
    routedManagerId: uuid("routed_manager_id"),
    // What the ticket went in as, for the Overview's breakdowns.
    externalTicketType: text("external_ticket_type"),
    externalTicketPriority: text("external_ticket_priority"),
    // Why the helpdesk refused the last ticket for this conversation (e.g. an
    // issue type the project doesn't have). Cleared once a ticket goes through.
    externalTicketError: text("external_ticket_error"),
    // The worker's own classification, for the Tickets page. Independent of
    // any helpdesk, so queues work for customers with none.
    requestType: text("request_type"),
    tier: text("tier"),
    labels: jsonb("labels").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // "worker" = set by the classifier (which may redo it); "manual" = a person
    // edited it, so the classifier leaves it alone.
    classificationSource: text("classification_source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("conversations_org_idx").on(table.organizationId),
    orgExternalThreadIdx: index("conversations_org_external_thread_idx").on(
      table.organizationId,
      table.externalThreadId,
    ),
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
    // Files the manager attached to this message in the admin Assistant
    // (lightweight refs only - the extracted text lives in
    // assistant_attachments). Always empty for customer/agent messages.
    attachments: jsonb("attachments")
      .$type<{ id: string; filename: string; intent: AssistantAttachmentIntent }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Interactive panels (skills, knowledge, integrations, ...) an admin
    // Assistant reply showed. Only the kinds are stored; the panel reads live
    // data when rendered, so it never shows stale state after a change.
    panels: jsonb("panels").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // Rich cards an admin Assistant reply showed (lib/assistant-cards.ts).
    // Unlike panels these are a snapshot of what the reply was about.
    // Always empty for customer/agent messages.
    // Customer replies keep theirs here too (lib/customer-cards.ts).
    cards: jsonb("cards").$type<(AssistantCard | CustomerCard)[]>().notNull().default(sql`'[]'::jsonb`),
    // Email channel: the provider's message id (Nylas message id). Unique, so
    // a retried webhook delivery can't store (or answer) the same email twice;
    // it is also what a reply threads under.
    externalMessageId: text("external_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_idx").on(table.conversationId),
    externalMessageUnique: uniqueIndex("messages_external_message_id_unique")
      .on(table.externalMessageId)
      .where(sql`${table.externalMessageId} IS NOT NULL`),
  }),
);

/**
 * What the manager wants done with a file dropped into the admin Assistant:
 * read it as context for this chat only, or turn it into knowledge-base
 * content or a custom skill (both of which go through the Assistant's usual
 * propose -> confirm approval before anything is written).
 */
export type AssistantAttachmentIntent = "context" | "knowledge" | "skill";

/**
 * Files uploaded into the admin Assistant. Only the extracted text is kept -
 * never the original bytes - since every use (chat context, knowledge
 * ingest, skill drafting) works from text. conversationId is null between
 * upload and the message that sends it (a brand-new chat has no
 * conversation yet); the chat route links it on send.
 */
export const assistantAttachments = pgTable(
  "assistant_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes").notNull(),
    intent: text("intent").$type<AssistantAttachmentIntent>().notNull().default("context"),
    extractedText: text("extracted_text").notNull(),
    // Set when the extracted text was cut at the storage cap, so the
    // Assistant can say it only read part of the file.
    truncated: boolean("truncated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("assistant_attachments_org_idx").on(table.organizationId),
    conversationIdx: index("assistant_attachments_conversation_idx").on(table.conversationId),
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
    // Set only for users provisioned through the Clerk identity adapter
    // (lib/identity-clerk.ts); most existing rows leave this null.
    clerkUserId: text("clerk_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgEmailUnique: uniqueIndex("worker_users_org_email_unique").on(
      table.organizationId,
      table.email,
    ),
    orgClerkUserUnique: uniqueIndex("worker_users_org_clerk_user_unique").on(
      table.organizationId,
      table.clerkUserId,
    ),
  }),
);

/**
 * A connection's own settings (Jira project and issue type, Confluence space),
 * kept apart from the connection row so they survive a disconnect and
 * reconnect: disconnecting deletes the row, and with it its metadata.
 */
export const integrationSettings = pgTable(
  "integration_settings",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    integrationType: text("integration_type").notNull(),
    system: text("system").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.integrationType] }),
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

/**
 * One row per verification code emailed to a widget visitor (lib/customer-identity.ts).
 * Only a hash of the code is stored; the rows are also what the rate limits count.
 */
export const emailVerificationCodes = pgTable(
  "email_verification_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    ip: text("ip"),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index("email_verification_codes_email_idx").on(table.email, table.createdAt),
    ipIdx: index("email_verification_codes_ip_idx").on(table.ip, table.createdAt),
    conversationIdx: index("email_verification_codes_conversation_idx").on(table.conversationId, table.createdAt),
    orgIdx: index("email_verification_codes_org_idx").on(table.organizationId, table.createdAt),
  }),
);

/**
 * A manager's rating of one of the worker's replies (lib/answer-feedback.ts). Feeds the Overview's answer quality and,
 * later, the test set: a bad rating with a correction is a test case waiting to be written.
 */
export const answerFeedback = pgTable(
  "answer_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(), // good | bad
    reasons: jsonb("reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    correction: text("correction"),
    ratedBy: text("rated_by").notNull(),
    // What the worker was running when it wrote the reply: model, release, guardrail settings.
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    messageRaterUnique: uniqueIndex("answer_feedback_message_rater_unique").on(table.messageId, table.ratedBy),
    orgIdx: index("answer_feedback_org_idx").on(table.organizationId, table.createdAt),
    conversationIdx: index("answer_feedback_conversation_idx").on(table.conversationId),
  }),
);

export const toolApprovals = pgTable(
  "tool_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Which assistant thread proposed this - so confirm/cancel only ever act
    // on that same thread's own pending item, never an unrelated thread's
    // abandoned proposal. Nullable because a pre-existing row (or a future
    // non-conversational caller) may not have one.
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
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
    conversationIdx: index("tool_approvals_conversation_idx").on(table.conversationId),
  }),
);

/**
 * The people a handover can be routed to. Each covers some areas, has an optional backup, and may also be told about
 * every Critical handover. The single manager on the worker profile stays as the fallback when this list is empty or
 * nobody matches.
 */
export const workerManagers = pgTable(
  "worker_managers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** When to route to this person, in a manager's words: "EAP Expert V3, MyAPP, utilization reports". */
    areas: text("areas").notNull().default(""),
    /** Who is told instead while this person is switched off. */
    backupId: uuid("backup_id"),
    notifyOnCritical: boolean("notify_on_critical").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("worker_managers_org_idx").on(table.organizationId),
  }),
);

/**
 * A saved question with what a good answer looks like, made from something that went wrong or was answered by the team
 * (a review item). Replayed through the worker to score it before and after a change. Customer details are removed
 * before it is saved; it belongs to one organization and is never shared.
 */
export const evalCases = pgTable(
  "eval_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The customer's question, with personal details removed. */
    question: text("question").notNull(),
    /** What a good answer says (a correction, or what the team said), with personal details removed. */
    reference: text("reference"),
    /** true: she should hand over; false: she should answer; null: not part of the test. */
    expectHandover: boolean("expect_handover"),
    /** The review item it came from, and its kind, for the manager's own trail. */
    sourceItem: text("source_item"),
    sourceKind: text("source_kind").notNull().default("manual"),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("eval_cases_org_idx").on(table.organizationId),
  }),
);

/** One replay of an organization's test cases: the score, and each case's reply and verdict. */
/**
 * What the Assistant changed after a manager confirmed it: the profile fields, knowledge articles and custom skills
 * that differ, with their text before and after, so a change can be undone and its effect on the test score read.
 */
export const changeLog = pgTable(
  "change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    toolId: text("tool_id").notNull(),
    summary: text("summary").notNull(),
    appliedBy: text("applied_by").notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>().notNull(),
    /** Set once the change has been undone. */
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    revertedBy: text("reverted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("change_log_org_idx").on(table.organizationId, table.createdAt),
  }),
);

export const evalRuns = pgTable(
  "eval_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"), // running | done | failed
    total: integer("total").notNull().default(0),
    passed: integer("passed").notNull().default(0),
    /** passed / total, 0 to 1. */
    score: real("score"),
    /** What the worker was running: model and the like, so two scores can be compared fairly. */
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    results: jsonb("results").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    /** A change that was applied just before this run, when the run was made to measure it. */
    changeId: uuid("change_id"),
    error: text("error"),
    triggeredBy: text("triggered_by").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index("eval_runs_org_idx").on(table.organizationId, table.startedAt),
  }),
);

export const cannedReplies = pgTable(
  "canned_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** When it applies, in a manager's words: "A customer asks whether a bug will be fixed by a date". */
    situation: text("situation").notNull(),
    /** What to say, in chat style. */
    reply: text("reply").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("canned_replies_org_idx").on(table.organizationId),
  }),
);

export const customSkills = pgTable(
  "custom_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    requires: jsonb("requires").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("custom_skills_org_idx").on(table.organizationId),
  }),
);

/**
 * A remote MCP server an org admin plugged in themselves (Settings >
 * Connectors). Unlike the integrations above, nothing about it is known in
 * advance: the tool list is discovered from the server and stored here, so
 * the agent never needs a network round trip just to know what it can call.
 *
 * `secret` is the auth header's value, AES-256-GCM ciphertext (lib/crypto.ts),
 * and is never serialized back out of a route. `toolPermissions` maps a tool
 * name to `auto | approval | off`; a tool missing from it is treated as
 * `approval`, so a tool the server adds later can never run unreviewed.
 */
export type McpConnectorTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** From the server's own annotations; a hint, not a guarantee. */
  readOnly: boolean;
  destructive: boolean;
};

export type McpToolPermission = "auto" | "approval" | "off";

export const mcpConnectors = pgTable(
  "mcp_connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    authType: text("auth_type").notNull().default("none"), // none | bearer | header
    authHeaderName: text("auth_header_name"),
    secret: text("secret"),
    enabled: boolean("enabled").notNull().default(true),
    status: text("status").notNull().default("connected"), // connected | failed
    lastError: text("last_error"),
    serverName: text("server_name"),
    tools: jsonb("tools").$type<McpConnectorTool[]>().notNull().default(sql`'[]'::jsonb`),
    toolPermissions: jsonb("tool_permissions")
      .$type<Record<string, McpToolPermission>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: text("created_by"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("mcp_connectors_org_idx").on(table.organizationId),
  }),
);

/**
 * Per-agent credentials for a provider that has no broker in front of it.
 *
 * Composio-backed integrations do not appear here — Composio holds those
 * tokens, which is why 3ebbb40 deleted this app's encryption layer. Nylas has
 * no such broker: an agent given its own Nylas application has to keep the
 * application's own client id and API key somewhere, and env cannot express
 * "per agent".
 *
 * `secrets` is a single encrypted blob rather than a column per field, so a
 * second provider with a different credential shape needs no migration. It is
 * ciphertext at rest (AES-256-GCM, lib/crypto.ts) and is never serialized back
 * out of an API route — the settings screen only ever learns *that* a value is
 * set, never what it is.
 *
 * A missing row is not an error: the agent falls back to the fleet-wide
 * credentials in env, which is what most deployments will use.
 */
export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** "nylas" today; the table is deliberately not Nylas-shaped. */
    provider: text("provider").notNull(),
    /** Encrypted JSON. Shape is the provider's business, not this table's. */
    secrets: text("secrets").notNull(),
    /** Non-secret settings worth showing back, e.g. the region. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgProviderUnique: uniqueIndex("provider_credentials_org_provider_unique").on(
      table.organizationId,
      table.provider,
    ),
  }),
);

/**
 * The worker's own mailbox and calendar, connected through Nylas.
 *
 * This is identity, not a delegated business-system connection — the address
 * the agent sends *from*, not an account it borrows. One worker per org
 * (`worker_profiles_org_unique`) means one identity, hence one row per org.
 *
 * Only the grant id is stored. Hosted OAuth with `access_type=online` leaves
 * the refresh token with Nylas, so there is no access token here to rotate or
 * leak — just a handle that can be revoked.
 */
export const nylasMailboxes = pgTable(
  "nylas_mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The Nylas grant. The only credential-shaped thing we keep. */
    grantId: text("grant_id").notNull(),
    /** The address this mailbox actually speaks as, per Nylas. */
    email: text("email").notNull(),
    /** google | microsoft | imap | … — reported by Nylas, never guessed. */
    provider: text("provider"),
    // connected | invalid | disconnected. `invalid` means the grant was
    // revoked upstream: the row is kept so the screen can say "reconnect"
    // rather than silently forgetting a mailbox somebody set up.
    status: text("status").notNull().default("connected"),
    connectedBy: text("connected_by"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgUnique: uniqueIndex("nylas_mailboxes_org_unique").on(table.organizationId),
    grantUnique: uniqueIndex("nylas_mailboxes_grant_unique").on(table.grantId),
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

/**
 * A searchable copy of an organization's external knowledge, cut into sections (lib/knowledge-index.ts). The `search`
 * keyword column is generated by the database and is only read through SQL.
 */
export const knowledgeIndexPages = pgTable(
  "knowledge_index_pages",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    pageId: text("page_id").notNull(),
    title: text("title").notNull(),
    link: text("link"),
    version: integer("version"),
    contentHash: text("content_hash").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.source, table.pageId] }),
  }),
);

export const knowledgeSections = pgTable(
  "knowledge_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    pageId: text("page_id").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    heading: text("heading"),
    content: text("content").notNull(),
    embedding: real("embedding").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pageIdx: index("knowledge_sections_page_idx").on(table.organizationId, table.source, table.pageId, table.position),
  }),
);

export const knowledgeIndexState = pgTable(
  "knowledge_index_state",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    runningUntil: timestamp("running_until", { withTimezone: true }),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
    lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
    lastError: text("last_error"),
    pages: integer("pages").notNull().default(0),
    chunks: integer("chunks").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.source] }),
  }),
);

/**
 * Why the worker replied the way it did (lib/reply-trace.ts). Its own table, not a column on messages, so it can never
 * be sent to a customer with the message. Managers read it through GET /api/v1/messages/:id/trace.
 */
export const replyTraces = pgTable(
  "reply_traces",
  {
    messageId: uuid("message_id")
      .primaryKey()
      .references(() => messages.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    trace: jsonb("trace").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("reply_traces_org_idx").on(table.organizationId, table.createdAt),
    conversationIdx: index("reply_traces_conversation_idx").on(table.conversationId),
  }),
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * A file a visitor attached in the website chat. The worker never reads it: it is passed to the team, who open it in
 * the Inbox. Unlinked (no conversation or message) and expiring within the hour until the message that carries it is
 * sent, then kept for 30 days. Never served from a public address.
 */
export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgIdx: index("message_attachments_org_idx").on(table.organizationId, table.createdAt),
    conversationIdx: index("message_attachments_conversation_idx").on(table.conversationId),
    expiresIdx: index("message_attachments_expires_idx").on(table.expiresAt),
  }),
);
