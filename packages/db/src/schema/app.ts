import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

// Track policies in schema snapshots; helpers and FORCE RLS live in reviewed SQL.
function tenantPolicy(tableName: string, workspaceId: AnyPgColumn) {
  const matchesWorkspace = sql`${workspaceId} = app_private.current_workspace_id()`
  return pgPolicy(`${tableName}_tenant_policy`, {
    for: "all",
    using: matchesWorkspace,
    withCheck: matchesWorkspace,
  })
}

export const knowledgeSourceType = pgEnum("knowledge_source_type", [
  "faq",
  "text",
  "url",
])

export const revisionState = pgEnum("knowledge_revision_state", [
  "draft",
  "processing",
  "approved",
  "published",
  "failed",
  "revoked",
])

export const conversationMode = pgEnum("conversation_mode", [
  "ai",
  "human",
  "closed",
])

export const messageSender = pgEnum("message_sender", [
  "visitor",
  "owner",
  "assistant",
  "system",
])

export const messageState = pgEnum("message_state", [
  "committed",
  "pending",
  "failed",
])

export const aiInvocationState = pgEnum("ai_invocation_state", [
  "reserved",
  "running",
  "completed",
  "failed",
  "cancelled",
  "uncertain",
])

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),

    name: text("name").notNull(),
    websiteOrigin: text("website_origin").notNull(),

    country: text("country").notNull().default("MW"),
    language: text("language").notNull().default("en"),
    timezone: text("timezone").notNull().default("Africa/Blantyre"),
    currency: text("currency").notNull().default("MWK"),

    supportEmail: text("support_email"),
    supportPhone: text("support_phone"),
    supportAvailable: boolean("support_available").notNull().default(false),

    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    pgPolicy("workspace_owner_select", {
      for: "select",
      using: sql`${table.ownerId} = app_private.current_owner_id()`,
    }),
    pgPolicy("workspace_owner_update", {
      for: "update",
      using: sql`${table.ownerId} = app_private.current_owner_id()`,
      withCheck: sql`${table.ownerId} = app_private.current_owner_id()`,
    }),
    index("workspaces_owner_created_idx").on(table.ownerId, table.createdAt),
    uniqueIndex("workspaces_owner_origin_uq").on(
      table.ownerId,
      table.websiteOrigin
    ),
    uniqueIndex("workspaces_workspace_id_owner_id_uq").on(
      table.id,
      table.ownerId
    ),
  ]
).enableRLS()

export const assistants = pgTable(
  "assistants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),

    name: text("name").notNull(),
    greeting: text("greeting").notNull(),
    tone: text("tone").notNull().default("helpful"),

    configurationVersion: integer("configuration_version").notNull().default(1),

    publishedVersion: integer("published_version"),
    enabled: boolean("enabled").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("assistants", table.workspaceId),
    uniqueIndex("assistants_workspace_uq").on(table.workspaceId),
    foreignKey({
      name: "assistants_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
  ]
).enableRLS()

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),

    type: knowledgeSourceType("type").notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),

    currentPublishedRevisionId: uuid("current_published_revision_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("knowledge_sources", table.workspaceId),
    uniqueIndex("knowledge_sources_workspace_id_id_uq").on(
      table.workspaceId,
      table.id
    ),
    index("knowledge_sources_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    foreignKey({
      name: "knowledge_sources_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
  ]
).enableRLS()

export const knowledgeRevisions = pgTable(
  "knowledge_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    sourceId: uuid("source_id").notNull(),

    state: revisionState("state").notNull().default("draft"),
    ordinal: integer("ordinal").notNull(),

    question: text("question"),
    rawText: text("raw_text"),
    reviewedText: text("reviewed_text"),
    contentHash: text("content_hash").notNull(),

    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByOwnerId: text("reviewed_by_owner_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    safeErrorCode: text("safe_error_code"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("knowledge_revisions", table.workspaceId),
    uniqueIndex("knowledge_revision_source_ordinal_uq").on(
      table.sourceId,
      table.ordinal
    ),
    uniqueIndex("knowledge_revisions_workspace_id_id_uq").on(
      table.workspaceId,
      table.id
    ),
    foreignKey({
      name: "knowledge_revision_source_workspace_fk",
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [knowledgeSources.workspaceId, knowledgeSources.id],
    }).onDelete("cascade"),
  ]
).enableRLS()

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    revisionId: uuid("revision_id").notNull(),

    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull(),

    embeddingModel: text("embedding_model").notNull(),
    embeddingDimensions: integer("embedding_dimensions").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("knowledge_chunks", table.workspaceId),
    uniqueIndex("knowledge_chunks_revision_ordinal_uq").on(
      table.revisionId,
      table.ordinal
    ),
    index("knowledge_chunks_workspace_revision_idx").on(
      table.workspaceId,
      table.revisionId
    ),
    foreignKey({
      name: "knowledge_chunk_revision_workspace_fk",
      columns: [table.workspaceId, table.revisionId],
      foreignColumns: [knowledgeRevisions.workspaceId, knowledgeRevisions.id],
    }).onDelete("cascade"),
  ]
).enableRLS()

export const widgetInstallations = pgTable(
  "widget_installations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),

    publicId: text("public_id").notNull(),
    allowedOrigin: text("allowed_origin").notNull(),
    enabled: boolean("enabled").notNull().default(false),

    lastCheckedAt: timestamp("last_checked_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("widget_installations", table.workspaceId),
    uniqueIndex("widget_install_workspace_uq").on(table.workspaceId),
    uniqueIndex("widget_install_public_id_uq").on(table.publicId),
    foreignKey({
      name: "widget_install_workspace_fk",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
  ]
).enableRLS()

export const visitorSessions = pgTable(
  "visitor_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),

    credentialHash: text("credential_hash").notNull(),
    privacyNoticeVersion: text("privacy_notice_version").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("visitor_sessions", table.workspaceId),
    uniqueIndex("visitor_credential_hash_uq").on(table.credentialHash),
    index("visitor_workspace_expiry_idx").on(
      table.workspaceId,
      table.expiresAt
    ),
  ]
).enableRLS()

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    visitorSessionId: uuid("visitor_session_id").notNull(),

    mode: conversationMode("mode").notNull().default("ai"),
    stateVersion: integer("state_version").notNull().default(1),

    handoffRequestedAt: timestamp("handoff_requested_at", {
      withTimezone: true,
    }),

    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("conversations", table.workspaceId),
    index("conversation_workspace_activity_idx").on(
      table.workspaceId,
      table.lastActivityAt
    ),
    uniqueIndex("conversation_workspace_id_id_uq").on(
      table.workspaceId,
      table.id
    ),
  ]
).enableRLS()

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),

    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    sender: messageSender("sender").notNull(),
    ownerSenderId: text("owner_sender_id"),

    body: text("body").notNull(),
    state: messageState("state").notNull().default("committed"),

    clientRequestId: text("client_request_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("messages", table.workspaceId),
    uniqueIndex("message_conversation_sequence_uq").on(
      table.conversationId,
      table.sequence
    ),
    uniqueIndex("message_conversation_request_uq").on(
      table.conversationId,
      table.clientRequestId
    ),
    index("message_workspace_conversation_idx").on(
      table.workspaceId,
      table.conversationId
    ),
    foreignKey({
      name: "message_conversation_workspace_fk",
      columns: [table.workspaceId, table.conversationId],
      foreignColumns: [conversations.workspaceId, conversations.id],
    }).onDelete("cascade"),
  ]
).enableRLS()

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    messageId: uuid("message_id").notNull(),

    sourceId: uuid("source_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
    chunkId: uuid("chunk_id").notNull(),

    displayTitle: text("display_title").notNull(),
    permittedUrl: text("permitted_url"),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
    }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("citations", table.workspaceId),
    index("citation_workspace_message_idx").on(
      table.workspaceId,
      table.messageId
    ),
  ]
).enableRLS()

export const aiInvocations = pgTable(
  "ai_invocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    conversationId: uuid("conversation_id"),

    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    priceVersion: text("price_version").notNull(),

    state: aiInvocationState("state").notNull(),

    reservedCostMicros: bigint("reserved_cost_micros", {
      mode: "bigint",
    }).notNull(),

    settledCostMicros: bigint("settled_cost_micros", {
      mode: "bigint",
    }),

    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),

    requestId: text("request_id").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    tenantPolicy("ai_invocations", table.workspaceId),
    uniqueIndex("ai_request_id_uq").on(table.requestId),
    index("ai_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ]
).enableRLS()

export const monthlyUsage = pgTable(
  "monthly_usage",
  {
    workspaceId: uuid("workspace_id").notNull(),
    period: text("period").notNull(),

    completedReplies: integer("completed_replies").notNull().default(0),
    reservedReplies: integer("reserved_replies").notNull().default(0),

    settledCostMicros: bigint("settled_cost_micros", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),

    reservedCostMicros: bigint("reserved_cost_micros", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    tenantPolicy("monthly_usage", table.workspaceId),
    primaryKey({
      columns: [table.workspaceId, table.period],
    }),
  ]
).enableRLS()

export const globalMonthlyAiUsage = pgTable("global_monthly_ai_usage", {
  period: text("period").primaryKey(),

  settledCostMicros: bigint("settled_cost_micros", {
    mode: "bigint",
  })
    .notNull()
    .default(sql`0`),

  reservedCostMicros: bigint("reserved_cost_micros", {
    mode: "bigint",
  })
    .notNull()
    .default(sql`0`),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id"),
    actorId: text("actor_id"),

    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    outcome: text("outcome").notNull(),

    requestId: text("request_id").notNull(),
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ]
)

export const deletionJournal = pgTable(
  "deletion_journal",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    scope: text("scope").notNull(),
    resourceId: text("resource_id").notNull(),

    deletedAt: timestamp("deleted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    restoreReplayCompletedAt: timestamp("restore_replay_completed_at", {
      withTimezone: true,
    }),
  },
  (table) => [index("deletion_resource_idx").on(table.scope, table.resourceId)]
)
