# API and database foundation verification

Step 4 preserves the Nest/Fastify modular monolith and Better Auth HTTP bridge.
The shared application factory is used by production and integration tests.
Business authorization reads a verified session from the identity database,
checks workspace ownership inside a business transaction, then assigns the
transaction-local workspace context. Repositories remain module-private.

## Runtime configuration

The API requires two separately provisioned restricted LOGIN connections:

- `AUTH_DATABASE_URL`: identity tables used by Better Auth.
- `DATABASE_URL`: business tables protected by RLS.

There is no fallback between them. `DATABASE_MIGRATION_URL` belongs only to the
operator shell; it is not an API credential. The tooling package owns environment
validation. Private environment files were not changed by this implementation.
The production API uses five connections per pool: ten per replica, plus worker
connections and a migration/administration reserve. Size replicas against the
database provider's connection allowance before deployment.

An administrator provisions the separate migrator/auth/business/jobs roles,
installs `vector`, and removes PUBLIC database TEMPORARY and schema CREATE.
Runtime roles must not own application objects, inherit privileged memberships,
or have superuser/BYPASSRLS/database-creation/role-creation capabilities. Passwords
belong in the local secret store or deployment secret manager, outside commands
and SQL history. See [database provisioning](../../packages/db/README.md).

The migration connection must log in as `DATABASE_MIGRATOR_ROLE`, owning the
current database and its application objects. An existing bootstrap-migrated
local database needs an administrator-reviewed object ownership transfer first;
changing the database owner alone is insufficient. The CLI does not transfer
ownership or create LOGIN passwords.

After provisioning, set the dedicated migration connection in the operator
process and the actual role names, then run from the repository root:

```powershell
$env:DATABASE_MIGRATOR_ROLE = 'nthawi_migrator'
$env:DATABASE_AUTH_ROLE = 'nthawi_auth'
$env:DATABASE_BUSINESS_ROLE = 'nthawi_business'
$env:DATABASE_JOBS_ROLE = 'nthawi_jobs'

pnpm.cmd --filter @nthawi/db db:check
if ($LASTEXITCODE -ne 0) { throw 'Migration definitions failed.' }
pnpm.cmd --filter @nthawi/db db:manifest:check
if ($LASTEXITCODE -ne 0) { throw 'Compiled schema contract failed.' }
pnpm.cmd --filter @nthawi/db db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
pnpm.cmd --filter @nthawi/db db:provision-runtime
if ($LASTEXITCODE -ne 0) { throw 'Runtime grants failed.' }
```

These commands do not create LOGIN passwords. Apply them only after configuring
the intended migration connection. Queue schema/queue creation remains a
migrator operation; provision its restricted runtime grants after queue objects
exist. Workers must disable migrations and schema creation.

## HTTP contract

| Endpoint            | Success                                  | Failure                                                                                        |
| ------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /`             | Existing `Hello World!` response         | Existing controller behavior                                                                   |
| `GET /health/live`  | `200 {"status":"ok"}` without a database | Process cannot serve HTTP                                                                      |
| `GET /health/ready` | `200 {"status":"ready"}`                 | Sanitized `503 {"status":"not_ready","code":"API_NOT_READY"}`                                  |
| `GET /api/v1/me`    | Restricted owner/session projection      | 401 invalid session; 403 unverified owner or foreign origin; 503 unavailable identity database |

Health and owner responses are non-cacheable. Business session reads bypass
cookie caching and disable refresh, so revocation is checked against PostgreSQL
on the next request. Freshness is derived from one shared fifteen-minute policy
and capped at session expiry; later sensitive workflows must enforce it server-side.
Raw credentials, cookies, SQL errors and request bodies are not logged.

Readiness checks the real runtime logins and compiled schema contract. Database
probes have a three-second deadline; HTTP readiness has a four-second deadline
and shares concurrent work. Failed or timed-out connections are discarded.
No Google, Resend, OpenAI or Dashboard calls are part of readiness.

## Step 9: verification entry points

Root `check:step4` runs existing formatting, lint, types, unit tests, application
builds, boundary checks and compiled exports, then uncached real integration
tests. DB builds also verify the generated schema manifest against the reviewed
migrations/schema. Missing integration configuration fails rather than skips.

```powershell
pnpm.cmd --filter @nthawi/api test
pnpm.cmd --filter @nthawi/api test:e2e
pnpm.cmd --filter @nthawi/tooling test
pnpm.cmd --filter @nthawi/db test
pnpm.cmd test:boundaries
pnpm.cmd test:api-image
& .\scripts\verify-step4.test.ps1
```

For individual native commands, check `$LASTEXITCODE` immediately and stop on a
nonzero result. The complete runner below performs these checks automatically.
The orchestration regression script uses command stubs and does not prove the
actual database/image gates by itself.

## Step 10: complete local gate

Docker Desktop must run Linux containers and loopback port 5434 must be free.
The runner verifies managed Node 24.21.0 via `pnpm exec node` and pnpm 10.16.1;
the machine's bare `node` can be a different version. Run:

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
& .\scripts\verify-step4.ps1
```

If local script execution is disabled, use this process-only override:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-step4.ps1
if ($LASTEXITCODE -ne 0) { throw 'Step 4 verification failed.' }
```

The runner performs a frozen install, unchanged-lockfile check, isolated
PostgreSQL18/pgvector startup, `check:step4`, production audit, Linux API image
build and image verification. Compose uses an explicitly empty environment file,
a unique owned project name and temporary storage. It restores process variables
and removes only its own test project on success and failure. It does not migrate
or clear the development database.

The actual Compose test credentials are synthetic:
`postgresql://testadmin:synthetic-test-password@127.0.0.1:5434/nthawi_test`.
The real test suites create their own randomly named databases and restricted
LOGIN roles on that disposable server, closing external pools before cleanup.

## Step 11: hosted CI

`.github/workflows/verify.yml` keeps the existing required job name **Step 3 gate**
and pinned actions, and adds the disposable integration database, orchestration
regressions, real API/database integration and unconditional scoped cleanup.
It uses synthetic configuration and requires no production secrets. Publication
of a new implementation commit/PR and a successful hosted run remain separate
from local verification.

Run the following only after committing and publishing this implementation on
its reviewed branch. Supply the new PR number explicitly; an implicit current
branch lookup can select the already merged Step 3 PR. Uncommitted Step 4 files
cannot be verified by a hosted run of an older commit.

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
    $foundationRepository = 'Tristan-X888/Nthawi'
    $foundationChanges = @(git status --porcelain -- apps/api packages/db packages/tooling packages/contracts scripts .github/workflows/verify.yml infra/compose.test.yml package.json turbo.json .env.example)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect implementation changes.' }
    if ($foundationChanges.Count -gt 0) {
        throw 'Review, commit and publish the implementation changes before hosted verification.'
    }

    $foundationPrNumber = Read-Host 'Enter the NEW Step 4 pull request number'
    if ($foundationPrNumber -notmatch '^[1-9][0-9]*$') {
        throw 'A numeric pull request number is required.'
    }
    $foundationExpectedSha = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the implementation commit.' }
    $foundationExpectedSha = $foundationExpectedSha.Trim()

    $foundationPrJson = gh pr view $foundationPrNumber --repo $foundationRepository --json headRefOid,headRefName,state,url
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the new pull request.' }
    $foundationPr = $foundationPrJson | ConvertFrom-Json
    if ($foundationPr.state -ne 'OPEN' -or $foundationPr.headRefOid -ne $foundationExpectedSha) {
        throw 'Use the open implementation PR whose published head matches local HEAD.'
    }

    gh pr checks $foundationPrNumber --repo $foundationRepository --watch --fail-fast
    if ($LASTEXITCODE -ne 0) { throw 'Hosted PR checks are missing, pending, or failed.' }

    gh run list --repo $foundationRepository --workflow verify.yml --branch $foundationPr.headRefName --commit $foundationExpectedSha --event pull_request --limit 10 --json databaseId,headSha,status,conclusion,url
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list runs for the exact PR head.' }
    $foundationRunId = Read-Host 'Enter a run ID from the exact-commit list above'
    if ($foundationRunId -notmatch '^[1-9][0-9]*$') {
        throw 'A numeric workflow run ID is required.'
    }
    $foundationRunJson = gh run view $foundationRunId --repo $foundationRepository --json headSha,event,status,conclusion,url,workflowName
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the selected workflow.' }
    $foundationRun = $foundationRunJson | ConvertFrom-Json
    if ($foundationRun.headSha -ne $foundationExpectedSha -or
        $foundationRun.event -ne 'pull_request' -or
        $foundationRun.workflowName -ne 'Verify repository') {
        throw 'The selected run does not verify this implementation PR head.'
    }

    gh run watch $foundationRunId --repo $foundationRepository --exit-status
    if ($LASTEXITCODE -ne 0) {
        gh run view $foundationRunId --repo $foundationRepository --log-failed
        throw 'Hosted workflow failed. Resolve its findings before Step 5.'
    }

    $foundationFinalRunJson = gh run view $foundationRunId --repo $foundationRepository --json headSha,status,conclusion,url
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the final workflow result.' }
    $foundationFinalRun = $foundationFinalRunJson | ConvertFrom-Json
    $foundationFinalPrJson = gh pr view $foundationPrNumber --repo $foundationRepository --json headRefOid
    if ($LASTEXITCODE -ne 0) { throw 'Cannot recheck the PR head.' }
    $foundationFinalPr = $foundationFinalPrJson | ConvertFrom-Json
    if ($foundationFinalRun.headSha -ne $foundationExpectedSha -or
        $foundationFinalPr.headRefOid -ne $foundationExpectedSha -or
        $foundationFinalRun.status -ne 'completed' -or
        $foundationFinalRun.conclusion -ne 'success') {
        throw 'The exact implementation commit has not passed hosted verification.'
    }
    Write-Output "Verified PR head $foundationExpectedSha : $($foundationFinalRun.url)"
}
```

The run's `headSha` identifies the associated PR head. With the workflow's
default `actions/checkout` behavior, a pull-request job checks out GitHub's merge
ref and tests that head integrated with the base branch. The checkout log records
the tested merge revision. A manual dispatch must use a branch/ref containing
this implementation and be verified separately against its resulting run SHA.

## Evidence

Execution evidence and review fixes are recorded in the
[implementation ledger](../superpowers/plans/2026-10-10-step4-api-database-foundation.md).
Hosted CI must pass for the published implementation before Step 5 deployment.
