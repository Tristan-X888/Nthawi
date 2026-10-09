-- Reviewed tenant boundary. Apply with the migration role in one transaction.
-- FORCE covers ordinary table owners, never superusers or BYPASSRLS roles.
-- Identity and privileged operational tables deliberately have no policies here.
CREATE SCHEMA IF NOT EXISTS app_private;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA app_private FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.current_owner_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(pg_catalog.current_setting('app.owner_id', true), '');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(pg_catalog.current_setting('app.workspace_id', true), '')::uuid;
$$;
--> statement-breakpoint
-- These getters expose only the caller's context. This grants no table access.
GRANT USAGE ON SCHEMA app_private TO PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.current_owner_id() TO PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.current_workspace_id() TO PUBLIC;
--> statement-breakpoint
ALTER TABLE public."ai_invocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."assistants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."citations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_revisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."monthly_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."visitor_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."widget_installations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ai_invocations_tenant_policy"
ON public."ai_invocations"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("ai_invocations"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("ai_invocations"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "assistants_tenant_policy"
ON public."assistants"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("assistants"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("assistants"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "citations_tenant_policy"
ON public."citations"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("citations"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("citations"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "conversations_tenant_policy"
ON public."conversations"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("conversations"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("conversations"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "knowledge_chunks_tenant_policy"
ON public."knowledge_chunks"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("knowledge_chunks"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("knowledge_chunks"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "knowledge_revisions_tenant_policy"
ON public."knowledge_revisions"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("knowledge_revisions"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("knowledge_revisions"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "knowledge_sources_tenant_policy"
ON public."knowledge_sources"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("knowledge_sources"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("knowledge_sources"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "messages_tenant_policy"
ON public."messages"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("messages"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("messages"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "monthly_usage_tenant_policy"
ON public."monthly_usage"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("monthly_usage"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("monthly_usage"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "visitor_sessions_tenant_policy"
ON public."visitor_sessions"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("visitor_sessions"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("visitor_sessions"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "widget_installations_tenant_policy"
ON public."widget_installations"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("widget_installations"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("widget_installations"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "workspace_owner_select"
ON public."workspaces"
AS PERMISSIVE
FOR SELECT
TO PUBLIC
USING ("workspaces"."owner_id" = app_private.current_owner_id());
--> statement-breakpoint
CREATE POLICY "workspace_owner_update"
ON public."workspaces"
AS PERMISSIVE
FOR UPDATE
TO PUBLIC
USING ("workspaces"."owner_id" = app_private.current_owner_id())
WITH CHECK ("workspaces"."owner_id" = app_private.current_owner_id());
--> statement-breakpoint
ALTER TABLE public."workspaces" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."assistants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_sources" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_revisions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_chunks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."widget_installations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."visitor_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."conversations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."citations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."ai_invocations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."monthly_usage" FORCE ROW LEVEL SECURITY;
