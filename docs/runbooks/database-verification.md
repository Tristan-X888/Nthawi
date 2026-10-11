# Local PostgreSQL verification and quality checks

Run these commands in PowerShell from the repository root. The local Compose
service is `postgres`, its container is `nthawi-postgres`, and its application
database is `nthawi`. The bootstrap administrator is `nthawi_dev`. The password
shown below is the existing local development default, not a production secret.

Verification has distinct layers: service health, a successful SQL connection,
required extensions, applied application migrations, role privileges, and actual
tenant isolation. A successful `SELECT version()` verifies only the SQL connection
and server identity. It does not prove that migrations or RLS are installed.

## 1. Verify tools and start a healthy service

```powershell
pnpm.cmd --version
pnpm.cmd exec node --version
docker compose version
docker info --format '{{.ServerVersion}}'
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
docker compose --env-file .env -f infra/compose.dev.yml config --quiet
pnpm.cmd db:up
docker compose -f infra/compose.dev.yml ps
docker compose -f infra/compose.dev.yml port postgres 5432
```

Use pnpm `10.16.1` and the workspace-managed Node `24.21.0`. The Docker daemon must
be running. `config --quiet` validates the Compose model without printing its
environment values. `db:up` now waits for health and fails if the service does not
become ready within 60 seconds. It preserves the existing named data volume.
It explicitly loads the root `.env` with `--env-file .env`, so the port override
works in fresh shells even though the Compose project file lives under `infra`.
The conditional copy above creates the file from the safe template only when it
does not already exist; it preserves existing private credentials.

Expected: `postgres` is running and healthy; the published host port is `5433`.
The container uses port `5432`. Host applications and tests therefore connect
to `localhost:5433`, while commands executed inside the container use its local
socket or port `5432`.

If a native PostgreSQL service owns host port 5433, select a free port such as
55433 without changing the container port or deleting its volume:

```powershell
Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue
$env:POSTGRES_HOST_PORT = '55433'
pnpm.cmd db:up
docker compose -f infra/compose.dev.yml port postgres 5432
```

Persist `POSTGRES_HOST_PORT=55433` in the private root `.env` for later Compose
invocations. Update the port in `AUTH_DATABASE_URL`, `DATABASE_URL` and `DATABASE_MIGRATION_URL`.
Write the actual port explicitly in each URL; Node's environment loader does not
expand a Compose variable inside a URL. The commands below discover the actual published port from the running Compose
service. This also works in a new PowerShell session because `db:up` explicitly
loads the root `.env`; PowerShell itself does not automatically load that file.

If startup fails, inspect the service before proceeding:

```powershell
docker compose -f infra/compose.dev.yml logs --tail 100 postgres
docker compose -f infra/compose.dev.yml exec -T postgres pg_isready -U nthawi_dev -d nthawi
```

`pg_isready` reports whether the server accepts connections. SQL checks verify the
database and effective role; step 4 also checks host password authentication.
Avoid deleting the volume as a routine
repair: initialization scripts run only when PostgreSQL initializes a new data
directory. Changing Compose bootstrap credentials does not change an existing
database role's password.

## 2. Run the requested version command

```powershell
docker compose -f infra/compose.dev.yml exec postgres psql -U nthawi_dev -d nthawi -c "SELECT version();"
```

This targets the Compose service `postgres`, connects as `nthawi_dev` to `nthawi`,
and prints the server build. Expect PostgreSQL major version 18 for the existing
`pgvector/pgvector:pg18` image. The exact minor version depends on the installed
image and is not pinned by that tag.

For scripts, use the following equivalent with predictable failure handling:

```powershell
docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT version();"
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL version verification failed.' }
```

`-T` disables Compose's pseudo-terminal. `-X` prevents a personal `psqlrc` from
altering behavior. `ON_ERROR_STOP=1` stops SQL execution on an error and returns a
failure status. Check native-command exit codes in PowerShell; a nonzero exit
does not automatically terminate every script.

## 3. Confirm the database, role, and extensions

```powershell
docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT current_database() AS database, current_user AS effective_role, session_user AS login_role, current_setting('server_version_num') AS server_version_num;"

docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user;"

docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('vector', 'pgcrypto') ORDER BY name;"

docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'pgcrypto') ORDER BY extname;"
```

Expected: database `nthawi`, effective/login role `nthawi_dev`, version number
`180000` or greater and below `190000`, and installed rows for both extensions.
The administrator must have `rolsuper = true` for the current integration suites.
That privilege is appropriate for disposable test setup, not application tenant
queries. `pg_available_extensions` proves server-side availability;
`pg_extension` proves installation in the database being queried. Tests install
the extensions separately in their own generated databases.

If an extension is available but missing from this development database, the
following administrator command installs it. This is a database change; run it
only after confirming the target is your local development database:

```powershell
docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

If `vector` is unavailable, check that the running container actually uses the
pgvector image. Do not regenerate migrations to compensate for a missing server
extension.

## 4. Verify connectivity from the host process

Container-side `psql` does not exercise the published host port or host-side
password authentication. Use the same PostgreSQL driver as the application:

```powershell
$dbPort = (docker compose -f infra/compose.dev.yml port postgres 5432 | Select-Object -First 1).Split(':')[-1]
$env:RLS_TEST_ADMIN_URL = "postgresql://nthawi_dev:dev-only-change-me@127.0.0.1:${dbPort}/postgres"
$env:AUTH_TEST_ADMIN_URL = $env:RLS_TEST_ADMIN_URL

@'
import { Client } from "pg"
const client = new Client({ connectionString: process.env.RLS_TEST_ADMIN_URL })
try {
  await client.connect()
  const result = await client.query(
    "SELECT current_database() AS database, current_user AS role, current_setting('server_version_num') AS server_version_num"
  )
  console.table(result.rows)
} finally {
  await client.end()
}
'@ | pnpm.cmd --filter @nthawi/db exec node --input-type=module
if ($LASTEXITCODE -ne 0) { throw 'Host PostgreSQL connection verification failed.' }
```

Expected: database `postgres`, role `nthawi_dev`, and PostgreSQL major version 18.
The maintenance database `postgres` is intentional: integration setup creates a
separate random database instead of modifying `nthawi`.

Both suites read their URLs directly from `process.env`. A value placed only in
the root `.env` is not automatically loaded by these test entry points. Set the
variables in the same PowerShell session that invokes the tests. Substitute your
actual local administrator credentials if the volume was initialized differently.

If host authentication fails, confirm that the port reaches the intended server.
On Windows, a native PostgreSQL listener can receive host connections while
Docker reports its own forwarding configuration:

```powershell
Get-NetTCPConnection -LocalPort $dbPort -State Listen -ErrorAction SilentlyContinue
docker compose -f infra/compose.dev.yml port postgres 5432
docker compose -f infra/compose.dev.yml logs --since 5m --tail 30 postgres
```

For a confirmed local Compose administrator password mismatch, reset the
credential only when intended. Connect through the container socket:

```powershell
docker compose -f infra/compose.dev.yml exec postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d postgres
```

Inside psql, use its password prompt instead of putting a private password in
shell history:

```text
\password nthawi_dev
\q
```

Enter the selected development password twice. Update private migration/test
connection settings and repeat the host driver check. This changes the
administrator credential without rotating other roles or deleting data.
Container-local socket access alone does not verify host password authentication.

## 5. Inspect application migration state before changing it

```powershell
pnpm.cmd --filter @nthawi/db db:check

docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_history;"

docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
```

`db:check` checks migration metadata consistency; it does not connect to the
database or apply migrations. A NULL migration-history relation and no public
tables indicate an uninitialized application schema. SQL connectivity can be
healthy while application schema verification is incomplete.

If the history relation exists, inspect it:

```powershell
docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;"
```

The current journal contains `0000_initial_app`, `0001_tenant_rls`, and
`0002_better_auth`. Its `when` values correspond to migration-history `created_at`
values; the database does not store those migration tags as a name column. Check
the journal and SQL files alongside history rather than treating a row count alone
as proof that the intended schema is installed.

## 6. Apply migrations only when preparing the application database

This is an operator action that changes `nthawi`. Integration verification does
not require it. Follow the [Step4 provisioning instructions](step-4-verification.md)
for separate migrator/auth/business/jobs LOGIN roles and the checked migration and
runtime-grant commands. This supersedes the earlier bootstrap-superuser migration
and manual business-role setup, including for local development.

The migration runner requires `DATABASE_MIGRATION_URL` directly in its process
environment, authenticating as the named restricted migrator that owns the target
database. The API requires separate `AUTH_DATABASE_URL` for identity access and
`DATABASE_URL` for business access. Test administrator URLs do not replace these
connections; the Compose `nthawi_dev` account is for administrative bootstrap.

After applying, repeat the history and table queries from step 5 and the RLS
queries from step 7. Do not edit previously applied migration SQL, reorder journal
entries, regenerate historical snapshots, or use `drizzle-kit push` as a substitute
for this migration chain. The manual helper functions and FORCE RLS clauses are
installed by the checked-in SQL migrations.

## 7. Inspect RLS structure and runtime-role privileges

These checks require an application schema installed by step 6. First inspect all
public tables and their policy definitions:

```powershell
docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname;"

docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;"

docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT to_regprocedure('app_private.current_owner_id()') AS owner_context_helper, to_regprocedure('app_private.current_workspace_id()') AS workspace_context_helper;"
```

Expected RLS-enabled and RLS-forced tables: `workspaces`, `assistants`,
`knowledge_sources`, `knowledge_revisions`, `knowledge_chunks`,
`widget_installations`, `visitor_sessions`, `conversations`, `messages`,
`citations`, `ai_invocations`, and `monthly_usage`. Both helpers must exist.
The eleven business tables have workspace policies; `workspaces` has its separate
owner SELECT/UPDATE policies. Better Auth's `user`, `session`, `account`,
`verification`, and `rate_limit` tables remain outside this tenant policy scope.
The privileged operational tables also remain outside it; lack of RLS there does
not authorize granting a tenant role access to them.

Inspect the provisioned business login, if present; substitute its actual role
name if it differs from the Step4 example:

```powershell
docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'nthawi_business';"

docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT granted.rolname AS reachable_role, granted.rolsuper, granted.rolbypassrls, granted.rolcreatedb, granted.rolcreaterole FROM pg_roles AS runtime CROSS JOIN pg_roles AS granted WHERE runtime.rolname = 'nthawi_business' AND pg_has_role(runtime.oid, granted.oid, 'MEMBER') ORDER BY granted.rolname;"

docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT schemaname, tablename, tableowner FROM pg_tables WHERE tableowner = 'nthawi_business' ORDER BY schemaname, tablename;"
```

The membership query returns no rows when the runtime role is absent.
Expected for the runtime login: LOGIN enabled, SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE
disabled, no table ownership, and no membership path into a privileged role.
Zero rows in the first query means runtime-role provisioning is incomplete; it
does not mean that role verification passed.

To inspect effective privileges after the role exists:

```powershell
docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c "SELECT tablename, has_table_privilege('nthawi_business', format('%I.%I', schemaname, tablename), 'SELECT') AS can_select, has_table_privilege('nthawi_business', format('%I.%I', schemaname, tablename), 'INSERT') AS can_insert, has_table_privilege('nthawi_business', format('%I.%I', schemaname, tablename), 'UPDATE') AS can_update, has_table_privilege('nthawi_business', format('%I.%I', schemaname, tablename), 'DELETE') AS can_delete, has_table_privilege('nthawi_business', format('%I.%I', schemaname, tablename), 'TRUNCATE') AS can_truncate FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
```

Expected for the business-only role contract: SELECT/UPDATE on `workspaces`, CRUD
on the eleven business tables, no TRUNCATE, and no access to identity or privileged
operational tables. An authentication service needing identity access requires
separately reviewed identity grants; do not solve that with grants on all tables.

For missing or existing runtime roles, use the
[Step4 provisioning instructions](step-4-verification.md). The provisioning CLI
validates profiles and reconciles table, column and schema privileges, including
migration-journal SELECT needed for readiness. The former manual business grants
are not a complete runtime provisioning procedure.

An administrator must resolve unsafe role flags, memberships or ownership
rejected by provisioning. Inspect existing roles instead of assuming additional
GRANT statements constrain their access.

Verify actual application credentials after provisioning and configuring the
private root `.env`:

```powershell
@'
import { loadEnvFile } from "node:process"
import { Client } from "pg"
loadEnvFile("../../.env")
const client = new Client({ connectionString: process.env.DATABASE_URL })
try {
  await client.connect()
  const { rows } = await client.query(
    "SELECT current_database() AS database, current_user AS effective_role, session_user AS login_role, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user"
  )
  console.table(rows)
} finally {
  await client.end()
}
'@ | pnpm.cmd --filter @nthawi/db exec node --input-type=module
if ($LASTEXITCODE -ne 0) { throw 'Application runtime database verification failed.' }
```

Expected: database `nthawi`, the intended restricted runtime role, and all four
privileged-role flags false. This diagnostic explicitly loads `.env`; the
integration entry points do not. Administrator catalog queries alone do not
verify the application login, password, database selection, or startup.

## 8. Prove tenant isolation in disposable databases

```powershell
$dbPort = (docker compose -f infra/compose.dev.yml port postgres 5432 | Select-Object -First 1).Split(':')[-1]
$env:RLS_TEST_ADMIN_URL = "postgresql://nthawi_dev:dev-only-change-me@127.0.0.1:${dbPort}/postgres"
$env:AUTH_TEST_ADMIN_URL = $env:RLS_TEST_ADMIN_URL
pnpm.cmd test:integration
if ($LASTEXITCODE -ne 0) { throw 'Database integration verification failed.' }
```

The root Turbo task passes both administrator URL variables through strict
environment filtering. `cache: false` ensures a live database run every time.
The configured upstream builds prepare the shared packages used by the API.

For diagnosis, run the suites individually after building those packages:

```powershell
pnpm.cmd --filter @nthawi/tooling build
pnpm.cmd --filter @nthawi/db build
pnpm.cmd --filter @nthawi/db test:integration
pnpm.cmd --filter @nthawi/api test:integration
```

The suites create uniquely named `step4_...` databases and real restricted
migrator/auth/business/jobs LOGIN roles, plus explicit privileged negative
controls. Database coverage includes clean/upgrade/repeat migrations, effective
privileges, schema compatibility, all eleven tenant tables, owner policies,
missing/malformed context, commit/rollback cleanup and single-connection reuse.

API coverage uses the same production application factory and captured emails.
It verifies authenticated owner responses, session revocation, origins, health,
workspace authorization, vector dimensions/ordering/isolation and restricted
queue claiming/retries/completion. It does not send real emails or redeem a real
Google OAuth code. No suite installs schema or fixture rows into `nthawi`.

After a successful run, inspect any remaining generated resources:

```powershell
docker compose -f infra/compose.dev.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d postgres -c "SELECT datname FROM pg_database WHERE starts_with(datname, 'step4_') OR starts_with(datname, 'rls_test_') OR starts_with(datname, 'auth_test_') ORDER BY datname; SELECT rolname FROM pg_roles WHERE starts_with(rolname, 'step4_') OR starts_with(rolname, 'rls_test_') OR starts_with(rolname, 'auth_test_') ORDER BY rolname;"
```

Compare with the same query before testing. Successful suites clean up their own
resources; pre-existing leftovers may belong to earlier interrupted runs. Inspect
each leftover explicitly before considering cleanup. The Node test runner's
file-level failure on a missing URL is setup failure, not a failed RLS assertion.

## 9. Run the repository quality checks and coverage separately

```powershell
pnpm.cmd format:check
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
```

Or run the existing sequential aggregate:

```powershell
pnpm.cmd check
```

`check` does not include integration tests or coverage. Run those explicitly:

```powershell
pnpm.cmd test:integration
pnpm.cmd test:cov
```

Normal tests declare `outputs: []`; they do not promise coverage artifacts. The
new root `test:cov` task invokes the API's existing `vitest run --coverage` script
and caches `coverage/**` only for that coverage-producing task. The tooling suite
does not have a coverage script, so this command currently covers API tests only.

Formatting was applied to the eight reported files with the existing resolved
Prettier configurations. Journal/snapshot JSON values are preserved; TypeScript
formatting changes do not alter the tenant transaction or policy behavior. The
Fastify bridge now annotates the returned instance instead of supplying a generic
argument to the non-generic `HttpServer.getInstance()` interface. The unused Geist
import is removed; Inter and Geist Mono remain the selected fonts.

Unit tests allow ten seconds per test because first-time Nest/Fastify startup
exceeded the previous five-second default on Windows. Application request
behavior and test assertions are unchanged.

## 10. Interpret failures and stop at the failing layer

| Failure                                 | Next check or action                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Docker pipe/daemon connection error     | Start Docker Desktop and verify the selected Docker context and `docker info`.                                          |
| Service unhealthy                       | Inspect PostgreSQL logs and its health check before running SQL or tests.                                               |
| Host connection refused                 | Check published port 5433, service health, and host firewall/network access.                                            |
| Password authentication failed          | Confirm the credentials used when the volume was initialized; changing Compose environment values does not rotate them. |
| Missing `vector` extension              | Verify the running pgvector image and extension availability in each target database.                                   |
| NULL migration-history relation         | Apply the real migration chain if preparing the application database, or run isolated tests for migration verification. |
| Missing test administrator URL          | Set both process variables in the calling shell; root Turbo passthrough is now configured.                              |
| Administrator privilege assertion fails | Use a local disposable superuser for suite setup; keep application runtime connections restricted.                      |
| TS2558 at `getInstance`                 | Confirm the corrected non-generic call is present and run the API type checker.                                         |
| Missing coverage outputs                | Use `test:cov` to generate coverage; ordinary `test` now declares no output files.                                      |
| Another Turbo task is cancelled         | Fix the first failing task, then rerun the interrupted task to obtain a result.                                         |

Official references: [Compose exec](https://docs.docker.com/reference/cli/docker/compose/exec/),
[Compose startup and health waiting](https://docs.docker.com/reference/cli/docker/compose/up/),
[psql error handling](https://www.postgresql.org/docs/18/app-psql.html),
[PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html),
and [Turbo environment filtering](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables).
