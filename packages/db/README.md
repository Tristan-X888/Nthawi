# Database migrations and tenant isolation

`drizzle/0001_tenant_rls.sql` adds tenant RLS after the initial application
schema. The SQL contains the context functions and `FORCE ROW LEVEL SECURITY`;
`src/schema/app.ts` tracks the policies so future Drizzle generation preserves
them. Review both the generated SQL and snapshot on subsequent changes. Use
migrations, not `drizzle-kit push`: schema push cannot install the manual helpers
or FORCE clauses.

## Apply

Install `vector` first (`gen_random_uuid` is built into PostgreSQL 18). Set
`DATABASE_MIGRATION_URL` to the dedicated migration connection, then run:

```sh
pnpm --filter @nthawi/db db:check
pnpm --filter @nthawi/db db:manifest:check
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

Keep four separate LOGIN profiles: a migrator owning the database/schema,
an auth role, a business role, and a jobs role. All use
`NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`;
none are members of another profile. Provision passwords through your secret
manager, outside SQL history and API configuration. Only the auth/business URLs
enter the API environment. Revoke PUBLIC database TEMPORARY and schema CREATE.

The migration URL must authenticate directly as `DATABASE_MIGRATOR_ROLE`, which
owns the current database and the application objects it migrates. Create new
application schemas/tables through that role. If earlier local migrations ran
as the bootstrap administrator, arrange a reviewed transfer of the existing
application objects before changing the migration login. Changing database
ownership alone does not transfer its tables, functions, types or migration
journal; the provisioning CLI deliberately does not perform that transfer.

For provisioned LOGIN roles, set `DATABASE_MIGRATION_URL` and
`DATABASE_MIGRATOR_ROLE`, `DATABASE_AUTH_ROLE`, `DATABASE_BUSINESS_ROLE`,
`DATABASE_JOBS_ROLE` in the operator shell, then run:

```sh
pnpm --filter @nthawi/db db:migrate
pnpm --filter @nthawi/db db:provision-runtime
# After pg-boss queue objects have been created as migrator:
pnpm --filter @nthawi/db db:provision-runtime --jobs
```

The provisioning command reports only completion or a sanitized error, and
does not load a private environment file. Role creation/password provisioning
remains an administrator operation, separate from migration and runtime grants.
Before granting access it verifies distinct LOGIN profiles, safe role flags,
absence of memberships/runtime ownership, and that the named migrator owns the
current database. It removes residual column privileges and runtime schema
CREATE grants before reporting success.
It reconciles table and column grants in `drizzle` for all three runtime roles,
then grants only journal SELECT to auth/business. Existing API table/column
access to `pgboss` is removed. Readiness rejects column-only migration writes,
extra migration metadata access and API queue access.

After applying migrations, run the reviewed grants in
`scripts/role-profiles.mjs` as the migrator by importing
`provisionRuntimeRoles(pool, { migrator, auth, business, jobs })` with your
already provisioned role names. Auth receives CRUD on exactly the five identity
tables; business receives SELECT/UPDATE on workspaces and CRUD on eleven tenant
tables. Both can read the migration hashes used by readiness. Operational
tables receive no runtime grants. Create pg-boss queue objects as migrator,
then call `provisionJobsSchema(pool, jobsRole)` for the fixed `pgboss` schema.
Create queues before granting access; rerun the grant helper after queue DDL.
Jobs receives DML only on job tables/partitions and job dependencies, SELECT on
queue/version metadata, and EXECUTE only on the `job_now()` invoker clock helper.
It has no bam command access, version writes, sequence grants or DDL-function
execution. Existing table/column/function grants are revoked before this
allowlist is applied. Scheduling and supervision remain disabled on workers;
queue creation and maintenance use the migrator.
Disable pg-boss migrations/schema creation on the jobs runtime connection.

`createDatabase(url, options?)` creates a lazy pool with bounded connect, query
and server statement timeouts. Idle errors are handled and optionally reported
as `{ code: "database_idle_error" }`. `probeDatabase(handle, "auth" | "business")`
has a three-second total deadline and checks the authenticated role, memberships,
ownership, table/column grants, schema/column types, RLS/FORCE and policies,
migration hashes and vector(1536). Failures expose a stable sanitized error.
It also rejects TEMPORARY database grants and verifies primary keys, unique
constraints/indexes, enum labels, composite foreign keys, and the exact reviewed
context-helper bodies/signatures plus runtime EXECUTE permissions. Helper
verification reads catalogs and changes no connection context.
The generated `src/schema-manifest.ts` ships in the package: runtime reads no
migration files. After reviewed schema/migration changes, run
`db:manifest:update`; build/typecheck verify the manifest remains current.

Provision login credentials outside migrations. Runtime connections must use a
non-owner `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` role with no membership
in an owner, migration, or bypass role. FORCE subjects an ordinary table owner to
RLS, but an owner can still alter policies. Superusers and BYPASSRLS roles always
bypass RLS, even with FORCE. The Compose `nthawi_dev` bootstrap account is a
superuser for administrative bootstrap only. It is not an API credential or the
restricted migrator profile required by runtime provisioning.

The following illustrates business-table privileges for a role named
`nthawi_runtime`. It is not a complete provisioning procedure: use
`db:provision-runtime` above to reconcile existing grants, metadata access and
role restrictions.

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
$env:RLS_TEST_ADMIN_URL = "postgresql://nthawi_dev:dev-only-change-me@127.0.0.1:${dbPort}/postgres"
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

Step 4's isolated Compose test server uses loopback port 5434 and synthetic
administrator credentials. The test-only
`test/helpers/database-fixture.mjs` rejects nonliteral-loopback hosts and
connection options, creates random database/LOGIN passwords, and cleans only
its generated resources. API integration tests share this fixture. Tests use
actual LOGIN connections rather than switching an administrator connection's
role. Integration tests also verify initial-schema upgrades preserve data,
same-owner workspace isolation, composite foreign keys, migration repetition
and incompatible/overprivileged catalog mutations.

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
