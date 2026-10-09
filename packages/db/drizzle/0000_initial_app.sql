CREATE TYPE "public"."ai_invocation_state" AS ENUM('reserved', 'running', 'completed', 'failed', 'cancelled', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."conversation_mode" AS ENUM('ai', 'human', 'closed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_type" AS ENUM('faq', 'text', 'url');--> statement-breakpoint
CREATE TYPE "public"."message_sender" AS ENUM('visitor', 'owner', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_state" AS ENUM('committed', 'pending', 'failed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_revision_state" AS ENUM('draft', 'processing', 'approved', 'published', 'failed', 'revoked');--> statement-breakpoint
CREATE TABLE "ai_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"price_version" text NOT NULL,
	"state" "ai_invocation_state" NOT NULL,
	"reserved_cost_micros" bigint NOT NULL,
	"settled_cost_micros" bigint,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "assistants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"greeting" text NOT NULL,
	"tone" text DEFAULT 'helpful' NOT NULL,
	"configuration_version" integer DEFAULT 1 NOT NULL,
	"published_version" integer,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"actor_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"outcome" text NOT NULL,
	"request_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"display_title" text NOT NULL,
	"permitted_url" text,
	"reviewed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"visitor_session_id" uuid NOT NULL,
	"mode" "conversation_mode" DEFAULT 'ai' NOT NULL,
	"state_version" integer DEFAULT 1 NOT NULL,
	"handoff_requested_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "deletion_journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"resource_id" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restore_replay_completed_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "global_monthly_ai_usage" (
	"period" text PRIMARY KEY NOT NULL,
	"settled_cost_micros" bigint DEFAULT 0 NOT NULL,
	"reserved_cost_micros" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dimensions" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"state" "knowledge_revision_state" DEFAULT 'draft' NOT NULL,
	"ordinal" integer NOT NULL,
	"question" text,
	"raw_text" text,
	"reviewed_text" text,
	"content_hash" text NOT NULL,
	"fetched_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_owner_id" text,
	"published_at" timestamp with time zone,
	"safe_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "knowledge_source_type" NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"current_published_revision_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"sender" "message_sender" NOT NULL,
	"owner_sender_id" text,
	"body" text NOT NULL,
	"state" "message_state" DEFAULT 'committed' NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "monthly_usage" (
	"workspace_id" uuid NOT NULL,
	"period" text NOT NULL,
	"completed_replies" integer DEFAULT 0 NOT NULL,
	"reserved_replies" integer DEFAULT 0 NOT NULL,
	"settled_cost_micros" bigint DEFAULT 0 NOT NULL,
	"reserved_cost_micros" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_usage_workspace_id_period_pk" PRIMARY KEY("workspace_id","period")
);--> statement-breakpoint
CREATE TABLE "visitor_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"credential_hash" text NOT NULL,
	"privacy_notice_version" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "widget_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"allowed_origin" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"website_origin" text NOT NULL,
	"country" text DEFAULT 'MW' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'Africa/Blantyre' NOT NULL,
	"currency" text DEFAULT 'MWK' NOT NULL,
	"support_email" text,
	"support_phone" text,
	"support_available" boolean DEFAULT false NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "ai_request_id_uq" ON "ai_invocations" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ai_workspace_created_idx" ON "ai_invocations" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assistants_workspace_uq" ON "assistants" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_workspace_created_idx" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "citation_workspace_message_idx" ON "citations" USING btree ("workspace_id","message_id");--> statement-breakpoint
CREATE INDEX "conversation_workspace_activity_idx" ON "conversations" USING btree ("workspace_id","last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_workspace_id_id_uq" ON "conversations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "deletion_resource_idx" ON "deletion_journal" USING btree ("scope","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_revision_ordinal_uq" ON "knowledge_chunks" USING btree ("revision_id","ordinal");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_workspace_revision_idx" ON "knowledge_chunks" USING btree ("workspace_id","revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_revision_source_ordinal_uq" ON "knowledge_revisions" USING btree ("source_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_revisions_workspace_id_id_uq" ON "knowledge_revisions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_workspace_id_id_uq" ON "knowledge_sources" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_workspace_created_idx" ON "knowledge_sources" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_conversation_sequence_uq" ON "messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "message_conversation_request_uq" ON "messages" USING btree ("conversation_id","client_request_id");--> statement-breakpoint
CREATE INDEX "message_workspace_conversation_idx" ON "messages" USING btree ("workspace_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_credential_hash_uq" ON "visitor_sessions" USING btree ("credential_hash");--> statement-breakpoint
CREATE INDEX "visitor_workspace_expiry_idx" ON "visitor_sessions" USING btree ("workspace_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_install_workspace_uq" ON "widget_installations" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_install_public_id_uq" ON "widget_installations" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_created_idx" ON "workspaces" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_owner_origin_uq" ON "workspaces" USING btree ("owner_id","website_origin");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_workspace_id_owner_id_uq" ON "workspaces" USING btree ("id","owner_id");--> statement-breakpoint
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunk_revision_workspace_fk" FOREIGN KEY ("workspace_id","revision_id") REFERENCES "public"."knowledge_revisions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_revisions" ADD CONSTRAINT "knowledge_revision_source_workspace_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."knowledge_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "message_conversation_workspace_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_installations" ADD CONSTRAINT "widget_install_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
