import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
  },
  (table) => ({
    orgUserUnique: uniqueIndex("uq_org_membership_org_user").on(
      table.organizationId,
      table.userId,
    ),
    orgIdx: index("organization_memberships_org_id_idx").on(table.organizationId),
    userIdx: index("organization_memberships_user_id_idx").on(table.userId),
  }),
);

export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull().default("Mike"),
    displayName: text("display_name").notNull().default("Agent Mike"),
    email: text("email").notNull().default("agent.mike@wkr.email"),
    role: text("role")
      .notNull()
      .default("Level 1 product support specialist for trained products and solutions."),
    tone: text("tone")
      .notNull()
      .default("Warm, concise, practical, and honest about uncertainty."),
    managerName: text("manager_name").notNull().default("Support Manager"),
    managerEmail: text("manager_email").notNull().default("manager@example.com"),
    autoReply: boolean("auto_reply").notNull().default(true),
    confidenceThreshold: doublePrecision("confidence_threshold").notNull().default(0.72),
    maxAgentTurns: integer("max_agent_turns").notNull().default(3),
    guardrails: jsonb("guardrails")
      .$type<string[]>()
      .notNull()
      .default([
        "Never invent product behavior or policies.",
        "Never request passwords, secrets, or full payment card details.",
        "Escalate billing disputes, security incidents, legal threats, and account deletion.",
        "Use only the supplied knowledge when making product-specific claims.",
      ]),
    escalationTerms: jsonb("escalation_terms")
      .$type<string[]>()
      .notNull()
      .default([
        "refund",
        "chargeback",
        "lawyer",
        "breach",
        "security incident",
        "delete my account",
        "cancel subscription",
      ]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgUnique: uniqueIndex("uq_agent_profiles_org").on(table.organizationId),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    ticketNumber: integer("ticket_number"),
    channel: text("channel").notNull().default("chat"),
    customerName: text("customer_name").notNull().default("Website visitor"),
    customerEmail: text("customer_email"),
    subject: text("subject").notNull().default("Support conversation"),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    assignedTo: text("assigned_to").notNull().default("Mike"),
    confidence: doublePrecision("confidence"),
    summary: text("summary"),
    externalThreadId: text("external_thread_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("conversations_org_id_idx").on(table.organizationId),
    orgThread: uniqueIndex("uq_conversations_org_thread").on(
      table.organizationId,
      table.externalThreadId,
    ),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderType: text("sender_type").notNull(),
    senderName: text("sender_name").notNull(),
    body: text("body").notNull(),
    citations: jsonb("citations").$type<Record<string, unknown>[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_id_idx").on(table.conversationId),
  }),
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    conceptId: text("concept_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    resource: text("resource"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    sourcePath: text("source_path"),
    body: text("body").notNull(),
    status: text("status").notNull().default("ready"),
    checksum: text("checksum").notNull(),
    sourceTimestamp: text("source_timestamp"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgConcept: uniqueIndex("uq_knowledge_org_concept").on(
      table.organizationId,
      table.conceptId,
    ),
    orgIdx: index("knowledge_documents_org_id_idx").on(table.organizationId),
  }),
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    heading: text("heading"),
    content: text("content").notNull(),
  },
  (table) => ({
    documentIdx: index("knowledge_chunks_document_id_idx").on(table.documentId),
  }),
);

/**
 * Nylas grant ↔ Clerk organization mapping.
 * One active mailbox per org (v1). Webhooks resolve org from grant_id;
 * outbound send/reply resolves grant from organization_id.
 * Staging can bootstrap the first row from NYLAS_GRANT_ID + NYLAS_ORG_ID.
 */
export const nylasMailboxes = pgTable(
  "nylas_mailboxes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    grantId: text("grant_id").notNull(),
    email: text("email").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    grantUnique: uniqueIndex("uq_nylas_mailboxes_grant").on(table.grantId),
    orgUnique: uniqueIndex("uq_nylas_mailboxes_org").on(table.organizationId),
    orgIdx: index("nylas_mailboxes_org_id_idx").on(table.organizationId),
  }),
);
