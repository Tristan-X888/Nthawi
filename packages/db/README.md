# Database migrations and tenant isolation

`drizzle/0001_tenant_rls.sql` adds tenant RLS after the initial application
schema. The SQL contains the context functions and `FORCE ROW LEVEL SECURITY`;
`src/schema/app.ts` tracks the policies so future Drizzle generation preserves
them. Review both the generated SQL and snapshot on subsequent changes. Use
migrations, not `drizzle-kit push`: schema push cannot install the manual helpers
or FORCE clauses.

## Apply

Install `vector` and `pgcrypto` first (local Compose already does this). Set
`DATABASE_MIGRATION_URL` to the dedicated migration connection, then run:

```sh
pnpm --filter @nthawi/db db:check
pnpm --filter @nthawi/db db:migrate
```

The runner applies pending migrations transactionally and records them in
Drizzle's journal. Do not edit an already applied migration. Enabling RLS takes
table locks; schedule the rollout accordingly and deploy context-aware callers
before enabling the boundary. No application database is migrated by tests.

## Access contract

- `workspaces`: SELECT and UPDATE require `owner_id = app.owner_id`. UPDATE
  cannot transfer ownership. INSERT and DELETE are deliberately denied; creation
  and deletion need a separately reviewed privileged service path or policy.
- The eleven tenant business tables use `workspace_id = app.workspace_id` for
  both existing rows and inserted/updated rows, including DELETE visibility.
- Missing/empty settings return NULL and deny access. Invalid workspace UUIDs
  raise an error. Both settings are transaction-local in `withTenantTransaction`;
  an owner-only call explicitly clears the workspace within its transaction.
- Better Auth identity tables are not part of this migration. Authentication and
  session rules remain independent of business tenant RLS.
- `global_monthly_ai_usage`, `audit_events` (including nullable-workspace events),
  and `deletion_journal` require separate privileged access rules. They receive
  neither workspace policies nor grants from this migration. Do not grant the
  tenant runtime role access to them by granting all tables in the schema.

Use the transaction passed to the callback for every tenant query. Set owner IDs
from a verified identity and resolve/authorize workspace IDs on the server before
calling the helper. Workspace RLS is deliberately independent of owner identity
so trusted visitor and worker paths can supply their authorized workspace. These
settings are assertions by trusted server code, not authentication: a role able
to execute arbitrary SQL can change its own settings. Never expose database
credentials or accept a client-supplied workspace as authorization.

## Runtime role provisioning

Provision login credentials outside migrations. Runtime connections must use a
non-owner `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` role with no membership
in an owner, migration, or bypass role. FORCE subjects an ordinary table owner to
RLS, but an owner can still alter policies. Superusers and BYPASSRLS roles always
bypass RLS, even with FORCE. The Compose `nthawi_dev` bootstrap account is a
superuser and is suitable for local migrations, not tenant runtime connections.

For an already provisioned role named `nthawi_runtime`, grant only the following
business privileges, using the migration administrator:

```sql
GRANT USAGE ON SCHEMA public TO nthawi_runtime;
GRANT SELECT, UPDATE ON public.workspaces TO nthawi_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.assistants, public.knowledge_sources, public.knowledge_revisions,
  public.knowledge_chunks, public.widget_installations, public.visitor_sessions,
  public.conversations, public.messages, public.citations, public.ai_invocations,
  public.monthly_usage
TO nthawi_runtime;
```

The migration grants PUBLIC only USAGE on `app_private` and EXECUTE on its two
invoker functions (which read the caller's settings). It revokes PUBLIC CREATE
there and grants no table privileges. Do not grant TRUNCATE, schema CREATE,
privileged function execution, or broad default table privileges to runtime.
RLS does not govern TRUNCATE or referential-integrity checks; foreign keys and
application authorization must still enforce valid relationships.

Verify the actual runtime login and role memberships in each deployment:

```sql
SELECT current_user, session_user, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname = current_user;

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
```

## Integration verification

For the complete PowerShell procedure, expected results, migration checks, and
runtime-role inspection, see the [database verification runbook](../../docs/runbooks/database-verification.md).

Start local PostgreSQL with `pnpm db:up`. In PowerShell:

```powershell
$dbPort = (docker compose -f infra/compose.dev.yml port postgres 5432 | Select-Object -First 1).Split(':')[-1]
$env:RLS_TEST_ADMIN_URL = "postgresql://nthawi_dev:dev-only-change-me@localhost:${dbPort}/postgres"
pnpm.cmd --filter @nthawi/db test:integration
```

To run both integration suites through Turbo, also set `AUTH_TEST_ADMIN_URL`:

```powershell
$env:AUTH_TEST_ADMIN_URL = $env:RLS_TEST_ADMIN_URL
pnpm.cmd test:integration
```

The root integration task passes these two variables through strict environment
filtering and never caches the database test result. The suites read process
variables directly; storing the values in a root `.env` alone does not load them.
Compose defaults to host port 5433; set `POSTGRES_HOST_PORT` in the private root
`.env` to use a free port when a native PostgreSQL service already occupies it.
Update application and migration URLs to match. The command above discovers the
running service's published port, including overrides.

Use only a local test server with `vector` available. The suite requires a
superuser to create an isolated randomly named database and test roles, then
removes only those resources. It applies the real migration chain twice, seeds
two tenants, and verifies all eleven tables' read/write isolation, workspace
owner rules, missing/empty/malformed context, commit/rollback cleanup, and stale
session context. It also checks FORCE with a non-bypass table owner, explicitly
demonstrates superuser/BYPASSRLS behavior, and verifies that generated Better Auth identity tables
and operational tables stay outside the tenant policy scope.

The pooled-connection regression uses a real pool with `max: 1` and asserts
identical `pg_backend_pid()` values across A's committed write, a context-free
borrow, B's unfiltered read, and A's subsequent read. B sees no sources while A
can still read its committed secret. Context-free borrows must have neither
owner nor workspace settings and see no tenant rows, catching session-global
settings even when the next tenant transaction would overwrite them.

References: [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html),
[transaction-local settings](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET),
and [Drizzle policies](https://orm.drizzle.team/docs/rls). Use the installed
Drizzle version's APIs when updating the schema.
