# Neon prototype database

Use the [completion runbook](../../docs/runbooks/neon-completion.md) for baseline
evidence, API startup, PR review, and production promotion. The Neon gate remains
open until reviewed production promotion is complete. Passing isolated acceptance
does not authorize Render deployment.

## Approved isolated target

The runner accepts only `-Target test` and the target registered in
[`scripts/neon-targets.mjs`](../../scripts/neon-targets.mjs):

| Field             | Approved test value                                   |
| ----------------- | ----------------------------------------------------- |
| Project           | `delicate-feather-83629956`                           |
| Branch            | `br-rapid-brook-zao6uwya`                             |
| Direct endpoint   | `ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech` |
| Database          | `neondb`                                              |
| PostgreSQL / port | 18 / 5432                                             |
| TLS option        | Exactly `sslmode=verify-full`                         |

Production, pooled endpoints, unexpected branches, URL connection overrides, and
unexpected role names are refused before SQL. Local Docker migration commands
remain supported with ordinary loopback PostgreSQL URLs.

[`bootstrap.psql`](bootstrap.psql) prepares four restricted LOGIN roles and
`vector` on a fresh PostgreSQL 18 database. It refuses existing application roles,
schemas, and public objects. The isolated branch has already been bootstrapped;
do not rerun bootstrap or reset passwords to repeat acceptance. Stale local
credentials were refreshed privately through the authenticated Neon CLI without
resetting server passwords.

## Private test configuration

The runner reads exactly these Git-ignored files from the repository root:

| File                            | Required keys                                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.neon.test.runtime.local`  | `AUTH_DATABASE_URL`, `DATABASE_URL`                                                                                                                                                     |
| `.env.neon.test.operator.local` | `DATABASE_MIGRATION_URL`, `JOBS_DATABASE_URL`, `DATABASE_MIGRATOR_ROLE`, `DATABASE_AUTH_ROLE`, `DATABASE_BUSINESS_ROLE`, `DATABASE_JOBS_ROLE`, `NEON_TARGET`, `NEON_EXPECTED_BRANCH_ID` |

Replace password placeholders locally with the corresponding existing role
passwords, percent-encoded as URL components. The runtime file has this shape:

```dotenv
AUTH_DATABASE_URL=postgresql://nthawi_auth:REPLACE_WITH_ENCODED_EXISTING_PASSWORD@ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech:5432/neondb?sslmode=verify-full
DATABASE_URL=postgresql://nthawi_business:REPLACE_WITH_ENCODED_EXISTING_PASSWORD@ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech:5432/neondb?sslmode=verify-full
```

The operator file has this shape:

```dotenv
DATABASE_MIGRATION_URL=postgresql://nthawi_migrator:REPLACE_WITH_ENCODED_EXISTING_PASSWORD@ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech:5432/neondb?sslmode=verify-full
JOBS_DATABASE_URL=postgresql://nthawi_jobs:REPLACE_WITH_ENCODED_EXISTING_PASSWORD@ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech:5432/neondb?sslmode=verify-full
DATABASE_MIGRATOR_ROLE=nthawi_migrator
DATABASE_AUTH_ROLE=nthawi_auth
DATABASE_BUSINESS_ROLE=nthawi_business
DATABASE_JOBS_ROLE=nthawi_jobs
NEON_TARGET=test
NEON_EXPECTED_BRANCH_ID=br-rapid-brook-zao6uwya
```

The reader accepts literal single-line assignments, optional `export`, whole-value
quotes, and comments. It rejects unknown, duplicate, missing, or empty keys. It
does not evaluate expressions or expand variables. Additional URL options are
refused. Saving a password locally does not create a role or change its password.

Keep both files private. The original `.env.neon.runtime.local`,
`.env.neon.operator.local`, and legacy environment writer are not test-runner
inputs. Never deploy migrator, jobs, or administrator credentials to the API.

## Commands in order

Use Windows PowerShell at the repository root. The runner selects managed Node
24.21.0 through pnpm 10.16.1; bare `node` may select another machine installation.

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
pnpm.cmd exec node --version
if ($LASTEXITCODE -ne 0) { throw 'Managed Node lookup failed.' }
pnpm.cmd --version
if ($LASTEXITCODE -ne 0) { throw 'pnpm lookup failed.' }

# Validates configuration without connecting or executing SQL.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\run-neon-database.ps1 -Target test -Mode check-config
if ($LASTEXITCODE -ne 0) { throw 'Neon test configuration failed.' }
```

For a newly bootstrapped, empty isolated application database only:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\run-neon-database.ps1 -Target test -Mode migrate
if ($LASTEXITCODE -ne 0) { throw 'First isolated migration or acceptance failed.' }
```

The first isolated migration has already been applied. For this branch, repeat
acceptance with:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\run-neon-database.ps1 -Target test -Mode verify
if ($LASTEXITCODE -ne 0) { throw 'Isolated database or compiled API acceptance failed.' }
```

`migrate` validates configuration and migration definitions, checks the manifest,
builds the database package, runs regressions, requires an empty target, applies
Drizzle migrations, provisions runtime grants, and verifies the result. `verify`
checks the migrated database without reapplying SQL migrations or grants. Both
modes then build the API and its dependencies, run the 12 API verifier tests, and
verify actual compiled API HTTP and shutdown behavior. Neither creates jobs
queues.

The compiled acceptance process receives only the two runtime database URLs and
synthetic provider configuration. A temporary copy of the compiled API prevents
its optional repository `.env` loader from reading operator secrets. Acceptance
checks liveness, database-backed readiness, anonymous owner rejection, widget
origin rejection, and closure of both pools. Linux reports `os-sigterm`; Windows
reports `ipc-sigterm-hook`, invoking Nest's registered shutdown handler over IPC
without claiming POSIX signal delivery.

Conflicting database, PostgreSQL, and Node TLS/startup variables are cleared
temporarily. The caller's environment and working directory are restored on
success or failure. Migration and provisioning require certificate and hostname
verification on the same checked client as their session preflight. Neon's proxy
means `pg_stat_ssl` does not establish client certificate verification. Live
diagnostics suppress raw driver exception details.

The Neon contract workflow runs offline checks without Neon credentials or SQL.
Its synthetic compiled startup test does not replace live isolated acceptance.
Production remains outside this runner's allowed targets.
