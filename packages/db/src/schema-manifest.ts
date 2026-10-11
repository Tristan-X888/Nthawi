// Generated from reviewed migrations and schema. Runtime never reads source files.
export const schemaManifest = {
  sources: {
    "drizzle/meta/_journal.json":
      "618cd4440281a3f183ae85d568025e0df318238b7f99d241f7acaaaa4984dcac",
    "drizzle/0000_initial_app.sql":
      "3b30c4ca8435b07bb398966fee9d59025266aceb9e99d3c8dfe467232bc685a6",
    "drizzle/meta/0000_snapshot.json":
      "1ce868f112a46b1168e3d5c79abc874280f184a34b3b04f4b33deff619e26211",
    "drizzle/0001_tenant_rls.sql":
      "a2e4676bc188244ae64d015693e798564c463f8eddc936be79ede90445559a71",
    "drizzle/meta/0001_snapshot.json":
      "314a7729e0ca2529bdfb554aca4517d1c93dc7f677a4b542c8b8f936b0e75736",
    "drizzle/0002_better_auth.sql":
      "4e0c7459fe4391600bc30e9eba470c32963ff354315fbec61aee536826ab0216",
    "drizzle/meta/0002_snapshot.json":
      "01634e7e1291fb93879788f60fa9279cd91ca707b67c1a9bfdcaad0d7e4037b4",
    "src/schema/app.ts":
      "25fc1f53ec5cd196927dcb8baa283cf4019224d6125053e927ca75273eb16818",
    "src/schema/auth.ts":
      "f09e208a9534ade0ddf683137bdee01b0bf336f9e3ae3a5cfaed8a35f0e5b25c",
    "src/schema/index.ts":
      "a6d1b45c45ef99bf0dfae63a308b767896a49ca531c934136e12108e7c12bfd8",
  },
  migrations: [
    {
      hash: "3b30c4ca8435b07bb398966fee9d59025266aceb9e99d3c8dfe467232bc685a6",
      createdAt: 1790604466879,
    },
    {
      hash: "a2e4676bc188244ae64d015693e798564c463f8eddc936be79ede90445559a71",
      createdAt: 1790631123946,
    },
    {
      hash: "4e0c7459fe4391600bc30e9eba470c32963ff354315fbec61aee536826ab0216",
      createdAt: 1790818975369,
    },
  ],
  tables: [
    {
      name: "ai_invocations",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "ai_request_id_uq",
          columns: ["request_id"],
          unique: true,
          method: "btree",
        },
        {
          name: "ai_workspace_created_idx",
          columns: ["workspace_id", "created_at"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [],
      policies: [
        {
          name: "ai_invocations_tenant_policy",
          command: "ALL",
          using:
            '"ai_invocations"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"ai_invocations"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "conversation_id",
          type: "uuid",
          notNull: false,
        },
        {
          name: "provider",
          type: "text",
          notNull: true,
        },
        {
          name: "model",
          type: "text",
          notNull: true,
        },
        {
          name: "prompt_version",
          type: "text",
          notNull: true,
        },
        {
          name: "price_version",
          type: "text",
          notNull: true,
        },
        {
          name: "state",
          type: "ai_invocation_state",
          notNull: true,
        },
        {
          name: "reserved_cost_micros",
          type: "bigint",
          notNull: true,
        },
        {
          name: "settled_cost_micros",
          type: "bigint",
          notNull: false,
        },
        {
          name: "input_tokens",
          type: "integer",
          notNull: false,
        },
        {
          name: "output_tokens",
          type: "integer",
          notNull: false,
        },
        {
          name: "latency_ms",
          type: "integer",
          notNull: false,
        },
        {
          name: "request_id",
          type: "text",
          notNull: true,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
        {
          name: "settled_at",
          type: "timestamp with time zone",
          notNull: false,
        },
      ],
    },
    {
      name: "assistants",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "assistants_workspace_uq",
          columns: ["workspace_id"],
          unique: true,
          method: "btree",
        },
      ],
      foreignKeys: [
        {
          name: "assistants_workspace_fk",
          table: "workspaces",
          columns: ["workspace_id"],
          foreignColumns: ["id"],
          onDelete: "cascade",
          onUpdate: "no action",
        },
      ],
      policies: [
        {
          name: "assistants_tenant_policy",
          command: "ALL",
          using:
            '"assistants"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"assistants"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "name",
          type: "text",
          notNull: true,
        },
        {
          name: "greeting",
          type: "text",
          notNull: true,
        },
        {
          name: "tone",
          type: "text",
          notNull: true,
        },
        {
          name: "configuration_version",
          type: "integer",
          notNull: true,
        },
        {
          name: "published_version",
          type: "integer",
          notNull: false,
        },
        {
          name: "enabled",
          type: "boolean",
          notNull: true,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
        {
          name: "updated_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "audit_events",
      rls: false,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "audit_workspace_created_idx",
          columns: ["workspace_id", "created_at"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [],
      policies: [],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: false,
        },
        {
          name: "actor_id",
          type: "text",
          notNull: false,
        },
        {
          name: "action",
          type: "text",
          notNull: true,
        },
        {
          name: "resource_type",
          type: "text",
          notNull: true,
        },
        {
          name: "resource_id",
          type: "text",
          notNull: false,
        },
        {
          name: "outcome",
          type: "text",
          notNull: true,
        },
        {
          name: "request_id",
          type: "text",
          notNull: true,
        },
        {
          name: "metadata",
          type: "jsonb",
          notNull: false,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "citations",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "citation_workspace_message_idx",
          columns: ["workspace_id", "message_id"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [],
      policies: [
        {
          name: "citations_tenant_policy",
          command: "ALL",
          using:
            '"citations"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"citations"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "message_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "source_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "revision_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "chunk_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "display_title",
          type: "text",
          notNull: true,
        },
        {
          name: "permitted_url",
          type: "text",
          notNull: false,
        },
        {
          name: "reviewed_at",
          type: "timestamp with time zone",
          notNull: true,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "conversations",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "conversation_workspace_activity_idx",
          columns: ["workspace_id", "last_activity_at"],
          unique: false,
          method: "btree",
        },
        {
          name: "conversation_workspace_id_id_uq",
          columns: ["workspace_id", "id"],
          unique: true,
          method: "btree",
        },
      ],
      foreignKeys: [],
      policies: [
        {
          name: "conversations_tenant_policy",
          command: "ALL",
          using:
            '"conversations"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"conversations"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "visitor_session_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "mode",
          type: "conversation_mode",
          notNull: true,
        },
        {
          name: "state_version",
          type: "integer",
          notNull: true,
        },
        {
          name: "handoff_requested_at",
          type: "timestamp with time zone",
          notNull: false,
        },
        {
          name: "resolved_at",
          type: "timestamp with time zone",
          notNull: false,
        },
        {
          name: "last_activity_at",
          type: "timestamp with time zone",
          notNull: true,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "deletion_journal",
      rls: false,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "deletion_resource_idx",
          columns: ["scope", "resource_id"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [],
      policies: [],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "scope",
          type: "text",
          notNull: true,
        },
        {
          name: "resource_id",
          type: "text",
          notNull: true,
        },
        {
          name: "deleted_at",
          type: "timestamp with time zone",
          notNull: true,
        },
        {
          name: "restore_replay_completed_at",
          type: "timestamp with time zone",
          notNull: false,
        },
      ],
    },
    {
      name: "global_monthly_ai_usage",
      rls: false,
      primaryKey: ["period"],
      uniqueConstraints: [],
      indexes: [],
      foreignKeys: [],
      policies: [],
      columns: [
        {
          name: "period",
          type: "text",
          notNull: true,
        },
        {
          name: "settled_cost_micros",
          type: "bigint",
          notNull: true,
        },
        {
          name: "reserved_cost_micros",
          type: "bigint",
          notNull: true,
        },
        {
          name: "updated_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "knowledge_chunks",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "knowledge_chunks_revision_ordinal_uq",
          columns: ["revision_id", "ordinal"],
          unique: true,
          method: "btree",
        },
        {
          name: "knowledge_chunks_workspace_revision_idx",
          columns: ["workspace_id", "revision_id"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [
        {
          name: "knowledge_chunk_revision_workspace_fk",
          table: "knowledge_revisions",
          columns: ["workspace_id", "revision_id"],
          foreignColumns: ["workspace_id", "id"],
          onDelete: "cascade",
          onUpdate: "no action",
        },
      ],
      policies: [
        {
          name: "knowledge_chunks_tenant_policy",
          command: "ALL",
          using:
            '"knowledge_chunks"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"knowledge_chunks"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "revision_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "ordinal",
          type: "integer",
          notNull: true,
        },
        {
          name: "content",
          type: "text",
          notNull: true,
        },
        {
          name: "token_count",
          type: "integer",
          notNull: true,
        },
        {
          name: "embedding_model",
          type: "text",
          notNull: true,
        },
        {
          name: "embedding_dimensions",
          type: "integer",
          notNull: true,
        },
        {
          name: "embedding",
          type: "vector(1536)",
          notNull: true,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "knowledge_revisions",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "knowledge_revision_source_ordinal_uq",
          columns: ["source_id", "ordinal"],
          unique: true,
          method: "btree",
        },
        {
          name: "knowledge_revisions_workspace_id_id_uq",
          columns: ["workspace_id", "id"],
          unique: true,
          method: "btree",
        },
      ],
      foreignKeys: [
        {
          name: "knowledge_revision_source_workspace_fk",
          table: "knowledge_sources",
          columns: ["workspace_id", "source_id"],
          foreignColumns: ["workspace_id", "id"],
          onDelete: "cascade",
          onUpdate: "no action",
        },
      ],
      policies: [
        {
          name: "knowledge_revisions_tenant_policy",
          command: "ALL",
          using:
            '"knowledge_revisions"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"knowledge_revisions"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "source_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "state",
          type: "knowledge_revision_state",
          notNull: true,
        },
        {
          name: "ordinal",
          type: "integer",
          notNull: true,
        },
        {
          name: "question",
          type: "text",
          notNull: false,
        },
        {
          name: "raw_text",
          type: "text",
          notNull: false,
        },
        {
          name: "reviewed_text",
          type: "text",
          notNull: false,
        },
        {
          name: "content_hash",
          type: "text",
          notNull: true,
        },
        {
          name: "fetched_at",
          type: "timestamp with time zone",
          notNull: false,
        },
        {
          name: "reviewed_at",
          type: "timestamp with time zone",
          notNull: false,
        },
        {
          name: "reviewed_by_owner_id",
          type: "text",
          notNull: false,
        },
        {
          name: "published_at",
          type: "timestamp with time zone",
          notNull: false,
        },
        {
          name: "safe_error_code",
          type: "text",
          notNull: false,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "knowledge_sources",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "knowledge_sources_workspace_id_id_uq",
          columns: ["workspace_id", "id"],
          unique: true,
          method: "btree",
        },
        {
          name: "knowledge_sources_workspace_created_idx",
          columns: ["workspace_id", "created_at"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [
        {
          name: "knowledge_sources_workspace_fk",
          table: "workspaces",
          columns: ["workspace_id"],
          foreignColumns: ["id"],
          onDelete: "cascade",
          onUpdate: "no action",
        },
      ],
      policies: [
        {
          name: "knowledge_sources_tenant_policy",
          command: "ALL",
          using:
            '"knowledge_sources"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"knowledge_sources"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "type",
          type: "knowledge_source_type",
          notNull: true,
        },
        {
          name: "title",
          type: "text",
          notNull: true,
        },
        {
          name: "source_url",
          type: "text",
          notNull: false,
        },
        {
          name: "current_published_revision_id",
          type: "uuid",
          notNull: false,
        },
        {
          name: "deleted_at",
          type: "timestamp with time zone",
          notNull: false,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
        {
          name: "updated_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "messages",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "message_conversation_sequence_uq",
          columns: ["conversation_id", "sequence"],
          unique: true,
          method: "btree",
        },
        {
          name: "message_conversation_request_uq",
          columns: ["conversation_id", "client_request_id"],
          unique: true,
          method: "btree",
        },
        {
          name: "message_workspace_conversation_idx",
          columns: ["workspace_id", "conversation_id"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [
        {
          name: "message_conversation_workspace_fk",
          table: "conversations",
          columns: ["workspace_id", "conversation_id"],
          foreignColumns: ["workspace_id", "id"],
          onDelete: "cascade",
          onUpdate: "no action",
        },
      ],
      policies: [
        {
          name: "messages_tenant_policy",
          command: "ALL",
          using:
            '"messages"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"messages"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "conversation_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "sequence",
          type: "bigint",
          notNull: true,
        },
        {
          name: "sender",
          type: "message_sender",
          notNull: true,
        },
        {
          name: "owner_sender_id",
          type: "text",
          notNull: false,
        },
        {
          name: "body",
          type: "text",
          notNull: true,
        },
        {
          name: "state",
          type: "message_state",
          notNull: true,
        },
        {
          name: "client_request_id",
          type: "text",
          notNull: false,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "monthly_usage",
      rls: true,
      primaryKey: ["workspace_id", "period"],
      uniqueConstraints: [],
      indexes: [],
      foreignKeys: [],
      policies: [
        {
          name: "monthly_usage_tenant_policy",
          command: "ALL",
          using:
            '"monthly_usage"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"monthly_usage"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "period",
          type: "text",
          notNull: true,
        },
        {
          name: "completed_replies",
          type: "integer",
          notNull: true,
        },
        {
          name: "reserved_replies",
          type: "integer",
          notNull: true,
        },
        {
          name: "settled_cost_micros",
          type: "bigint",
          notNull: true,
        },
        {
          name: "reserved_cost_micros",
          type: "bigint",
          notNull: true,
        },
        {
          name: "updated_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "visitor_sessions",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "visitor_credential_hash_uq",
          columns: ["credential_hash"],
          unique: true,
          method: "btree",
        },
        {
          name: "visitor_workspace_expiry_idx",
          columns: ["workspace_id", "expires_at"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [],
      policies: [
        {
          name: "visitor_sessions_tenant_policy",
          command: "ALL",
          using:
            '"visitor_sessions"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"visitor_sessions"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "credential_hash",
          type: "text",
          notNull: true,
        },
        {
          name: "privacy_notice_version",
          type: "text",
          notNull: true,
        },
        {
          name: "expires_at",
          type: "timestamp with time zone",
          notNull: true,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "widget_installations",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "widget_install_workspace_uq",
          columns: ["workspace_id"],
          unique: true,
          method: "btree",
        },
        {
          name: "widget_install_public_id_uq",
          columns: ["public_id"],
          unique: true,
          method: "btree",
        },
      ],
      foreignKeys: [
        {
          name: "widget_install_workspace_fk",
          table: "workspaces",
          columns: ["workspace_id"],
          foreignColumns: ["id"],
          onDelete: "cascade",
          onUpdate: "no action",
        },
      ],
      policies: [
        {
          name: "widget_installations_tenant_policy",
          command: "ALL",
          using:
            '"widget_installations"."workspace_id" = app_private.current_workspace_id()',
          check:
            '"widget_installations"."workspace_id" = app_private.current_workspace_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "workspace_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "public_id",
          type: "text",
          notNull: true,
        },
        {
          name: "allowed_origin",
          type: "text",
          notNull: true,
        },
        {
          name: "enabled",
          type: "boolean",
          notNull: true,
        },
        {
          name: "last_checked_at",
          type: "timestamp with time zone",
          notNull: false,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "workspaces",
      rls: true,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "workspaces_owner_created_idx",
          columns: ["owner_id", "created_at"],
          unique: false,
          method: "btree",
        },
        {
          name: "workspaces_owner_origin_uq",
          columns: ["owner_id", "website_origin"],
          unique: true,
          method: "btree",
        },
        {
          name: "workspaces_workspace_id_owner_id_uq",
          columns: ["id", "owner_id"],
          unique: true,
          method: "btree",
        },
      ],
      foreignKeys: [],
      policies: [
        {
          name: "workspace_owner_select",
          command: "SELECT",
          using: '"workspaces"."owner_id" = app_private.current_owner_id()',
          check: null,
        },
        {
          name: "workspace_owner_update",
          command: "UPDATE",
          using: '"workspaces"."owner_id" = app_private.current_owner_id()',
          check: '"workspaces"."owner_id" = app_private.current_owner_id()',
        },
      ],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "owner_id",
          type: "text",
          notNull: true,
        },
        {
          name: "name",
          type: "text",
          notNull: true,
        },
        {
          name: "website_origin",
          type: "text",
          notNull: true,
        },
        {
          name: "country",
          type: "text",
          notNull: true,
        },
        {
          name: "language",
          type: "text",
          notNull: true,
        },
        {
          name: "timezone",
          type: "text",
          notNull: true,
        },
        {
          name: "currency",
          type: "text",
          notNull: true,
        },
        {
          name: "support_email",
          type: "text",
          notNull: false,
        },
        {
          name: "support_phone",
          type: "text",
          notNull: false,
        },
        {
          name: "support_available",
          type: "boolean",
          notNull: true,
        },
        {
          name: "onboarding_completed_at",
          type: "timestamp with time zone",
          notNull: false,
        },
        {
          name: "created_at",
          type: "timestamp with time zone",
          notNull: true,
        },
        {
          name: "updated_at",
          type: "timestamp with time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "account",
      rls: false,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "account_userId_idx",
          columns: ["user_id"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [
        {
          name: "account_user_id_user_id_fk",
          table: "user",
          columns: ["user_id"],
          foreignColumns: ["id"],
          onDelete: "cascade",
          onUpdate: "no action",
        },
      ],
      policies: [],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "account_id",
          type: "text",
          notNull: true,
        },
        {
          name: "provider_id",
          type: "text",
          notNull: true,
        },
        {
          name: "user_id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "access_token",
          type: "text",
          notNull: false,
        },
        {
          name: "refresh_token",
          type: "text",
          notNull: false,
        },
        {
          name: "id_token",
          type: "text",
          notNull: false,
        },
        {
          name: "access_token_expires_at",
          type: "timestamp without time zone",
          notNull: false,
        },
        {
          name: "refresh_token_expires_at",
          type: "timestamp without time zone",
          notNull: false,
        },
        {
          name: "scope",
          type: "text",
          notNull: false,
        },
        {
          name: "password",
          type: "text",
          notNull: false,
        },
        {
          name: "created_at",
          type: "timestamp without time zone",
          notNull: true,
        },
        {
          name: "updated_at",
          type: "timestamp without time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "rate_limit",
      rls: false,
      primaryKey: ["id"],
      uniqueConstraints: [
        {
          name: "rate_limit_key_unique",
          columns: ["key"],
          nullsNotDistinct: false,
        },
      ],
      indexes: [],
      foreignKeys: [],
      policies: [],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "key",
          type: "text",
          notNull: true,
        },
        {
          name: "count",
          type: "integer",
          notNull: true,
        },
        {
          name: "last_request",
          type: "bigint",
          notNull: true,
        },
      ],
    },
    {
      name: "session",
      rls: false,
      primaryKey: ["id"],
      uniqueConstraints: [
        {
          name: "session_token_unique",
          columns: ["token"],
          nullsNotDistinct: false,
        },
      ],
      indexes: [
        {
          name: "session_userId_idx",
          columns: ["user_id"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [
        {
          name: "session_user_id_user_id_fk",
          table: "user",
          columns: ["user_id"],
          foreignColumns: ["id"],
          onDelete: "cascade",
          onUpdate: "no action",
        },
      ],
      policies: [],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "expires_at",
          type: "timestamp without time zone",
          notNull: true,
        },
        {
          name: "token",
          type: "text",
          notNull: true,
        },
        {
          name: "created_at",
          type: "timestamp without time zone",
          notNull: true,
        },
        {
          name: "updated_at",
          type: "timestamp without time zone",
          notNull: true,
        },
        {
          name: "ip_address",
          type: "text",
          notNull: false,
        },
        {
          name: "user_agent",
          type: "text",
          notNull: false,
        },
        {
          name: "user_id",
          type: "uuid",
          notNull: true,
        },
      ],
    },
    {
      name: "user",
      rls: false,
      primaryKey: ["id"],
      uniqueConstraints: [
        {
          name: "user_email_unique",
          columns: ["email"],
          nullsNotDistinct: false,
        },
      ],
      indexes: [],
      foreignKeys: [],
      policies: [],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "name",
          type: "text",
          notNull: true,
        },
        {
          name: "email",
          type: "text",
          notNull: true,
        },
        {
          name: "email_verified",
          type: "boolean",
          notNull: true,
        },
        {
          name: "image",
          type: "text",
          notNull: false,
        },
        {
          name: "created_at",
          type: "timestamp without time zone",
          notNull: true,
        },
        {
          name: "updated_at",
          type: "timestamp without time zone",
          notNull: true,
        },
      ],
    },
    {
      name: "verification",
      rls: false,
      primaryKey: ["id"],
      uniqueConstraints: [],
      indexes: [
        {
          name: "verification_identifier_idx",
          columns: ["identifier"],
          unique: false,
          method: "btree",
        },
      ],
      foreignKeys: [],
      policies: [],
      columns: [
        {
          name: "id",
          type: "uuid",
          notNull: true,
        },
        {
          name: "identifier",
          type: "text",
          notNull: true,
        },
        {
          name: "value",
          type: "text",
          notNull: true,
        },
        {
          name: "expires_at",
          type: "timestamp without time zone",
          notNull: true,
        },
        {
          name: "created_at",
          type: "timestamp without time zone",
          notNull: true,
        },
        {
          name: "updated_at",
          type: "timestamp without time zone",
          notNull: true,
        },
      ],
    },
  ],
  enums: [
    {
      name: "ai_invocation_state",
      values: [
        "reserved",
        "running",
        "completed",
        "failed",
        "cancelled",
        "uncertain",
      ],
    },
    {
      name: "conversation_mode",
      values: ["ai", "human", "closed"],
    },
    {
      name: "knowledge_source_type",
      values: ["faq", "text", "url"],
    },
    {
      name: "message_sender",
      values: ["visitor", "owner", "assistant", "system"],
    },
    {
      name: "message_state",
      values: ["committed", "pending", "failed"],
    },
    {
      name: "knowledge_revision_state",
      values: [
        "draft",
        "processing",
        "approved",
        "published",
        "failed",
        "revoked",
      ],
    },
  ],
  helpers: [
    {
      name: "current_owner_id",
      returns: "text",
      source:
        "SELECT NULLIF(pg_catalog.current_setting('app.owner_id', true), '');",
    },
    {
      name: "current_workspace_id",
      returns: "uuid",
      source:
        "SELECT NULLIF(pg_catalog.current_setting('app.workspace_id', true), '')::uuid;",
    },
  ],
} as const
