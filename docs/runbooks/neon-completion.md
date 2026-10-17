# Repository recovery and Neon completion

The local baseline gate passed. PR [#4](https://github.com/Tristan-X888/Nthawi/pull/4)
still needs external review and successful GitHub checks for its final published
head before baseline closure. Isolated Neon migrations, runtime grants, and
live database and compiled API acceptance passed. Production remains empty and
untouched. The Neon gate remains open until isolated acceptance and reviewed
production promotion are complete. Render follows that gate.

## 1. Reproduce the repository baseline

Use Docker Desktop with Linux containers and keep loopback port 5434 free. Run
from Windows PowerShell:

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
pnpm.cmd exec node --version
if ($LASTEXITCODE -ne 0) { throw 'Managed Node lookup failed.' }
pnpm.cmd --version
if ($LASTEXITCODE -ne 0) { throw 'pnpm lookup failed.' }
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\verify-step4.ps1
if ($LASTEXITCODE -ne 0) { throw 'Repository baseline verification failed.' }
```

Expected versions are Node `v24.21.0` and pnpm `10.16.1`. The workspace pins the
runtime; bare `node` can resolve to Node 22. The runner performs a frozen install,
checks the lockfile hash, starts its own disposable PostgreSQL 18/pgvector
project, runs repository and integration checks, audits production dependencies,
and builds and tests the Linux API image. It restores process configuration and
removes its owned containers and temporary resources. It does not migrate or
delete the development database.

Recorded local evidence:

| Check                                                       | Result             |
| ----------------------------------------------------------- | ------------------ |
| Formatting, lint, type checks, builds and frozen lockfile   | Passed             |
| API unit / tooling / database unit tests                    | 52 / 35 / 6 passed |
| Browser boundary / image regression / compiled export tests | 34 / 7 / 4 passed  |
| API composition end-to-end tests                            | 3 passed           |
| Database / API integration tests                            | 65 / 30 passed     |
| Docker API image startup, runtime, health and shutdown      | Passed             |
| Neon target and database verifier regressions               | 74 passed          |
| Compiled Neon API verifier regressions                      | 12 passed          |
| PowerShell Neon runner lifecycle cases                      | 9 passed           |
| Baseline lockfile / runner lifecycle cases                  | 3 / 6 passed       |

The production audit has one moderate esbuild development-server advisory and no
high or critical findings. The configured high-severity audit gate passes; the
advisory still needs a separately reviewed dependency update.

Readiness now reads its 13 catalog datasets in a single read-only SQL batch.
The three-second probe and four-second HTTP deadlines remain unchanged. The
latency integration test covers a cold connection and delayed network round trips
while still rejecting excess grants. API connection setup permits ten seconds
for cold verified TLS/login; query and statement limits are three and two seconds.
After HTTP starts, the API warms both runtime logins concurrently in the
background. A failed connection never blocks liveness or turns readiness green.
Successful connections are released into their bounded pools for readiness to
check, and normal resource shutdown still owns both pools.

After runner changes, the focused checks are:

```powershell
pnpm.cmd exec turbo run build --filter=@nthawi/api
if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
pnpm.cmd exec node --test scripts/neon-targets.test.mjs scripts/verify-neon-database.test.mjs scripts/verify-neon-api.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Neon verifier regressions failed.' }
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\run-neon-database.test.ps1
if ($LASTEXITCODE -ne 0) { throw 'Neon runner lifecycle cases failed.' }
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\verify-step4-lockfile.test.ps1
if ($LASTEXITCODE -ne 0) { throw 'Frozen lockfile regressions failed.' }
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\verify-step4.test.ps1
if ($LASTEXITCODE -ne 0) { throw 'Baseline runner lifecycle cases failed.' }
```

The build must precede tests that execute the compiled production entry point.

## 2. Verify the isolated Neon branch

The exact connection contract and placeholder configuration examples are in
[the Neon README](../../infra/neon/README.md). Use only
`.env.neon.test.runtime.local` and `.env.neon.test.operator.local`. Keep actual
passwords out of commits, commands, review comments and screenshots. Stale local
credentials were refreshed privately through the authenticated Neon CLI; server
passwords were not reset.

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\run-neon-database.ps1 -Target test -Mode check-config
if ($LASTEXITCODE -ne 0) { throw 'Test configuration failed.' }

# Migrations already exist on this branch: repeat acceptance with verify.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\run-neon-database.ps1 -Target test -Mode verify
if ($LASTEXITCODE -ne 0) { throw 'Live Neon or compiled API acceptance failed.' }
```

Only a newly approved, registered, bootstrapped and empty test target uses
`-Mode migrate`. The current migrated branch must use `verify`: first-migration
mode deliberately requires an empty application target. Do not drop schemas,
change the target registry, or reset passwords to repeat acceptance.

Successful verification requires restricted-role and schema checks, vector
verification, and database-backed readiness. The runner then builds the API,
runs its lifecycle regressions and executes actual compiled `dist/main.js`.
It checks liveness, readiness, anonymous `GET /api/v1/me`, widget-origin rejection,
process exit and closure of both pools. It does not create accounts, send mail,
start Google authorization or make AI requests.

Windows reports `shutdown_mode=ipc-sigterm-hook`; Linux reports
`shutdown_mode=os-sigterm`. Windows invokes Nest's registered shutdown handler
over IPC because it cannot deliver POSIX SIGTERM to Node. Preserve a Linux result
for real operating-system SIGTERM evidence. Offline CI's synthetic readiness
does not establish live Neon permissions.

Retain the accepted commit, migration hashes and bounded success lines in the
delivery record. Record the final live result before closing this subgate. The
runner restores the caller's environment; it does not leave an API running or
operator credentials loaded.

Live Linux acceptance also passed with `shutdown_mode=os-sigterm`. Reproduce it
using the image built by the baseline runner; no secrets are supplied in Docker
arguments or written into the image:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    . .\scripts\run-neon-database.ps1
    $neonImageValues = Read-NeonTestEnvironment -Directory (Get-Location).Path
    $neonImageSnapshot = @{}
    try {
        $neonImageArgs = @('run', '--rm', '--name', ('nthawi-neon-linux-' + [Guid]::NewGuid().ToString('N')),
            '--mount', ('type=bind,source=' + (Join-Path (Get-Location).Path 'scripts') + ',target=/app/scripts,readonly'))
        foreach ($name in $neonImageValues.Keys) {
            $neonImageSnapshot[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            Set-NeonProcessEnvironment $name $neonImageValues[$name]
            $neonImageArgs += @('--env', $name)
        }
        $neonImageArgs += @('nthawi-api:step4', 'node', 'scripts/verify-neon-api.mjs')
        & docker @neonImageArgs
        if ($LASTEXITCODE -ne 0) { throw 'Linux compiled Neon API acceptance failed.' }
    } finally {
        foreach ($name in $neonImageSnapshot.Keys) {
            Set-NeonProcessEnvironment $name $neonImageSnapshot[$name]
        }
        $neonImageValues.Clear()
    }
}
```

## 3. Start the API for development or manual checks

The API needs both runtime database URLs and the application settings described
in [`.env.example`](../../.env.example). For a persistent API, maintain a
**runtime-only** root `.env`: store migration, jobs, administrator URLs and role
passwords in an operator-only file. Omit the template's operator migration key
from the API runtime file. Configure real provider credentials when testing those
provider-backed journeys.

The production entry point optionally reads the repository `.env` by file path.
Existing process variables win for matching keys, but missing keys are still
read from that file. Setting two runtime URLs does not prevent operator secrets
elsewhere in `.env` from entering the process. Review that file and use a clean
API shell before manually launching the API. Automated Neon acceptance avoids
the file entirely using a temporary compiled tree and a limited child
environment.

With a reviewed runtime-only `.env`, ordinary local development is:

```powershell
pnpm.cmd exec turbo run build --filter=@nthawi/api
if ($LASTEXITCODE -ne 0) { throw 'API dependency build failed.' }
pnpm.cmd --filter @nthawi/tooling env:check
if ($LASTEXITCODE -ne 0) { throw 'API runtime configuration failed.' }
pnpm.cmd --filter @nthawi/api dev
if ($LASTEXITCODE -ne 0) { throw 'API development process failed.' }
```

For compiled startup, replace the final development command with:

```powershell
pnpm.cmd --filter @nthawi/api start:prod
if ($LASTEXITCODE -ne 0) { throw 'Compiled API process failed.' }
```

To select the isolated test runtime file for persistent compiled startup, first
pass `check-config` above. Keep the root `.env` runtime-only for the remaining
required application settings. This block temporarily clears inherited runtime
URL overrides so the selected file supplies both connections, restoring them
when the foreground API stops:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $operatorVariables = @(Get-ChildItem Env: | Where-Object {
        $_.Name -match '^(?:DATABASE_MIGRATION_URL|JOBS_DATABASE_URL|DATABASE_.*_ROLE|DATABASE_.*_PASSWORD|AUTH_TEST_ADMIN_URL|RLS_TEST_ADMIN_URL|NEON.*|PG.*|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED)$'
    })
    if ($operatorVariables.Count -gt 0) {
        throw 'Use a clean API shell without exported operator or connection-override variables.'
    }
    $previousAuth = [Environment]::GetEnvironmentVariable('AUTH_DATABASE_URL', 'Process')
    $previousBusiness = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
    try {
        Remove-Item Env:AUTH_DATABASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        pnpm.cmd exec node --env-file=.env --env-file=.env.neon.test.runtime.local apps/api/dist/main.js
        if ($LASTEXITCODE -ne 0) { throw 'Compiled test API process failed.' }
    } finally {
        [Environment]::SetEnvironmentVariable('AUTH_DATABASE_URL', $previousAuth, 'Process')
        [Environment]::SetEnvironmentVariable('DATABASE_URL', $previousBusiness, 'Process')
    }
}
```

The command does not import the operator file. The first `--env-file` supplies
reviewed application settings; the later test runtime file replaces its database
URLs. Existing process values would override both files, which is why the block
clears those two values first. The API's later `.env` fallback cannot overwrite
the selected URLs. Provider credentials are loaded but these startup and health
requests make no external provider calls. Plain `start:prod` uses the root `.env`
and does not by itself select Neon. Use the automated runner for the stricter
acceptance environment; its staged API exits after validation.

In a second terminal, with default API port 4000:

```powershell
$apiBase = 'http://127.0.0.1:4000'
curl.exe --silent --show-error --fail-with-body --include "$apiBase/health/live"
if ($LASTEXITCODE -ne 0) { throw 'API liveness failed.' }
curl.exe --silent --show-error --fail-with-body --include "$apiBase/health/ready"
if ($LASTEXITCODE -ne 0) { throw 'API readiness failed.' }
curl.exe --silent --show-error --include "$apiBase/api/v1/me"
if ($LASTEXITCODE -ne 0) { throw 'Owner boundary request failed.' }
curl.exe --silent --show-error --include --header 'Origin: https://widget.example.test' "$apiBase/api/v1/me"
if ($LASTEXITCODE -ne 0) { throw 'Widget boundary request failed.' }
```

Expect 200 `{"status":"ok"}`, 200 `{"status":"ready"}`, 401 with
`code=UNAUTHORIZED`, and 403 with `code=INVALID_ORIGIN`; each response includes
`Cache-Control: no-store`. Use the actual configured widget origin if different.
A database outage leaves liveness available while readiness returns sanitized 503. Stop the foreground API with Ctrl+C; use automated acceptance to verify
bounded shutdown and pool closure. Startup alone does not prove readiness.

## 4. Close the baseline PR on its final revision

After publishing the reviewed commit, inspect changes and the exact PR head:

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace validation failed.' }
git status --short
git diff --stat
$baselineHead = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot read local revision.' }
$baselinePrJson = gh pr view 4 --repo Tristan-X888/Nthawi --json headRefOid,state,reviewDecision,url
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect PR #4.' }
$baselinePr = $baselinePrJson | ConvertFrom-Json
if ($baselinePr.state -ne 'OPEN' -or $baselinePr.headRefOid -ne $baselineHead.Trim()) {
    throw 'PR #4 must be open and match the published implementation revision.'
}
gh pr checks 4 --repo Tristan-X888/Nthawi --watch --fail-fast
if ($LASTEXITCODE -ne 0) { throw 'PR checks are missing, pending, or failing.' }
gh pr view 4 --repo Tristan-X888/Nthawi --json headRefOid,reviewDecision,reviews,statusCheckRollup
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect final review and CI evidence.' }
```

Checks on an earlier commit do not close the repaired baseline. Require external
review of the final revision, resolve findings, then verify its **Step 3 gate**
and **Neon contract verification** checks before merging under repository policy.
Local CodeRabbit or agent review does not replace required external review.

## 5. Reviewed production promotion before Render

The test runner, migration guard and provisioning guard refuse production. No
approved production promotion command exists yet. Do not change `NEON_TARGET`
or bypass guards to reuse the isolated runner.

1. Close the reviewed baseline PR with successful final-head hosted checks.
   Retain passing live isolated acceptance for the reviewed migration set and a
   Linux real-SIGTERM result.
2. Review the exact production project, branch, direct endpoint, database,
   PostgreSQL version, empty state, restore procedure and four independent role
   identities. Keep production credentials separate from test files.
3. Review [`bootstrap.psql`](../../infra/neon/bootstrap.psql): transaction,
   certificate-verified connection, fresh-database checks, restrictive role flags,
   default privileges and database ownership transfer. Password input is through
   environment variables, never command-line `-v`. The existing bootstrap wrapper
   is test-only.
4. Record SHA-256 hashes of reviewed SQL migrations, journal, schema manifest and
   bootstrap. Approve the exact commit, migration order, expected objects and
   grants, and recovery procedure before production writes.
5. Implement and review a separate production promotion change with explicit
   target selection, exact branch/endpoint guards, verified TLS/session preflight,
   controlled bootstrap/migration/grant phases, bounded cleanup, and sanitized
   diagnostics. Add regressions preventing fallback to test or another database.
   Obtain the required review for that concrete production operation.
6. Execute approved promotion and verify history/hashes, runtime restrictions,
   ownership and grants, vector dimensions, live readiness, HTTP boundaries and
   graceful compiled API shutdown. Retain post-promotion evidence and expose only
   auth/business connections to the API. Jobs queue objects and worker grants
   belong to their separately reviewed implementation phase.

These commands generate review metadata without accessing Neon:

```powershell
git rev-parse HEAD
Get-ChildItem -LiteralPath .\packages\db\drizzle -Filter '*.sql' -File |
    Sort-Object Name |
    Get-FileHash -Algorithm SHA256
Get-FileHash -Algorithm SHA256 -LiteralPath .\packages\db\drizzle\meta\_journal.json, .\packages\db\src\schema-manifest.ts, .\infra\neon\bootstrap.psql
```

## Remaining delivery order

1. Repository baseline recovery: external review, final-head CI and PR closure.
2. Neon completion: isolated acceptance and reviewed production promotion.
3. Render API: deployment identities, Docker image, secrets, health, shutdown and
   cold starts.
4. Design system: Teal/Rose, Geist, tokens, components, accessibility and widget
   previews.
5. Netlify owner application and signed ingress: same-origin auth, signed proxy
   requests, headers and route boundaries.
6. Widget deployment and promotion: isolated hosting, framing, headers and
   reproducible releases.
7. Identity, accounts and workspaces: real Better Auth journeys, CRUD, ownership
   and tenancy.
8. Marketing pages and application shell: approved responsive pages, navigation,
   onboarding and real account/workspace integration.
9. Jobs, knowledge and uploads: durable processing, ingestion, approval, secure
   storage, scanning and retries.
10. Remaining product and release: AI answers and citations, accounting,
    conversations, streaming, widget, inbox, recovery and prototype acceptance.
