# Phase 4 Neon console and acceptance runbook

This runbook follows page 10 of the production implementation plan. Phase 4
prepares and verifies the database; Phase 5 creates reproducible staging;
production release is Phase 16. The current owner authorized connections and
bounded synthetic acceptance only on the registered test branch, plus creation
of its `nthawi_export` login. That authorization persists. It does not authorize
production SQL, production migration, branch deletion/reset, new paid projects,
hosting, DNS, emails or payment calls.

## 1. Inspect the exact project before changing anything

Open [Neon Console](https://console.neon.tech). Select organization
`org-wild-bird-68149107`, then project `Nthawi`, ID
`delicate-feather-83629956`. Confirm AWS London (`aws-eu-west-2`) and PostgreSQL 18. Names alone do not select a target.

| Environment                     | Branch ID                     | Direct host                                           | Database |
| ------------------------------- | ----------------------------- | ----------------------------------------------------- | -------- |
| Production candidate            | `br-lively-darkness-zahxet6z` | `ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech`   | `neondb` |
| Authorized synthetic acceptance | `br-rapid-brook-zao6uwya`     | `ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech` | `neondb` |

Use port 5432 and `sslmode=verify-full`. Do not use `-pooler`, wildcard hosts,
connection-string host overrides, a production default, or production credentials
for a test command. Existing application/migration roles remain four separate
restricted SQL-created roles. Provider-created administrative roles must never
be used for those runtime profiles.

The metadata inventory dated 5 November supersedes the Free/archived inventory
dated 4 November. The new settings were observed, not applied by this executor:
Launch (`launch_v3`), 604800-second history, protected production, production
0.25-1 CU with suspension disabled (`-1`), test 0.25-1 CU with 300-second
suspension. A branch being ready does not establish migration/API acceptance.

## 2. Review billing and the exact changes for approval

Billing is organization-wide. In the organization/profile menu choose
**Billing > Billing summary**. Verify Launch is already active; do not purchase
it again. Read the actual account rate/credit/tax and payment information there.
No card information, invoice, password or billing address belongs in chat or Git.

Published Launch rates checked for this work are USD 0.106/CU-hour,
USD 0.35/GB-month database storage, and USD 0.20/GB-month retained history.
Compute is usage-billed; an autoscaling maximum is not a monthly spending cap.
For a 30-day month (720 hours):

| Compute scenario                                  | Minimum compute | Sustained maximum compute |
| ------------------------------------------------- | --------------- | ------------------------- |
| Production, always on, 0.25-1 CU                  | USD 19.08/month | USD 76.32/month           |
| Production plus always-on staging, each 0.25-1 CU | USD 38.16/month | USD 152.64/month          |

Storage, history, other computes, extra branches/transfer, taxes and FX are
additional. Staging with five-minute suspension bills for actual active compute
time, so it may cost less than the always-on illustration. Existing test compute
is a third endpoint and must be included while active. Project creation may
create a compute immediately; set bounds in the creation request or immediately
review its actual endpoint before admitting traffic.

The metadata connector has no binding checkout quote or invoice endpoint. Browser
inspection was stopped because the current browser URL could not be established
reliably. Therefore these calculations are a **public-rate estimate**, not an
account-specific quote. Obtain the organization's displayed rate/tax/credits
before approving new paid resources. The USD 1000 envelope and USD 250 reserve
are planning constraints, not purchase authorization. Preserve the accepted
Phase 3 USD 766 worksheet until refreshed itemized quotes justify a new one.

The separate synthetic-only staging project already exists: `calm-math-03562419`
"nthawi-staging", same organization, AWS London, PostgreSQL 18, created on
2026-11-05 with owner approval. It is not bootstrapped and not registered in
`scripts/neon-targets.mjs`. Its default branch is named "production" and uses the
project defaults (0.25-8 CU, one-day history). Renaming that branch, setting
0.25-1 CU with five-minute suspension, choosing its history, a guarded bootstrap
with distinct passwords and the registry entry are Phase 5 work under their own
approvals. It is never silently substituted for this test branch. A new
export/restore branch likewise needs a bounded lifecycle decision.

Sources: [plans](https://neon.com/docs/introduction/plans),
[billing](https://neon.com/docs/introduction/manage-billing).

## 3. Confirm production history, compute and protection

These settings are already observed as selected. The following is the inspection
and reproduction procedure; applying a changed paid setting still needs its
specific authority.

1. Select the exact production branch. Under **Postgres database > Computes**,
   identify `ep-wild-leaf-za09k0vy`, then **Edit**.
2. Inspect minimum **0.25 CU**, maximum **1 CU**, and **Scale to zero OFF**.
   Reopen the drawer after an authorized save. API
   `suspend_timeout_seconds=-1` means disabled; `0` means provider default.
   **Settings > Postgres > Compute defaults** affects future computes and does
   not establish the existing endpoint's configuration.
3. Under project **Settings > Postgres > History window**, inspect **7 days**.
   A save must be confirmed by provider metadata `604800`, not a checked box in
   an evidence template. Increasing retention cannot recreate expired history.
4. Under **Branches > production**, inspect the protected shield. If not yet
   protected, the authorized operation is **Protect > Set as protected**.
   Protection prevents certain branch/project lifecycle operations; it does not
   prevent arbitrary destructive SQL by a privileged login.
5. Re-read provider project, branches and endpoints. Record UTC observation,
   exact IDs and values, then run the offline assessor on that sanitized JSON.

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
$env:PATH = 'C:\Users\USER\AppData\Local\pnpm\nodejs\24.21.0;' + $env:PATH
pnpm.cmd exec node scripts/neon-readiness.mjs docs/evidence/phase-4-neon-metadata-2026-11-05.json
if ($LASTEXITCODE -ne 0) { throw 'Metadata is stale or production settings do not match.' }
```

This saved JSON is dated evidence, not a live query. The assessor rejects it
after one hour; re-fetch metadata rather than editing its timestamp. Even a
metadata pass always reports `phase4Ready=false` because it cannot prove SQL,
tenant isolation, export, restore or repository acceptance.

Sources: [compute settings](https://neon.com/docs/manage/computes),
[scale to zero](https://neon.com/docs/guides/scale-to-zero-guide),
[history](https://neon.com/docs/postgres/backup-restore/history-window),
[protection](https://neon.com/docs/guides/protected-branches).

## 4. Rotate the shared test-role passwords, then keep private configuration

The existing test application is already migrated. Never repeat bootstrap,
`-Mode migrate` or role creation merely to repeat verification.

**One required rotation (P4-D08).** On 2026-11-05 all four restricted test roles
shared one password. Every live runner now refuses that configuration
(`stage=configuration:password-reuse`), so rotate once before §5:

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
$env:PATH = 'C:\Users\USER\AppData\Local\pnpm\nodejs\24.21.0;' + $env:PATH
powershell.exe -NoProfile -NonInteractive -File .\scripts\rotate-neon-test-credentials.ps1 -Confirmation 'rotate-role-passwords:delicate-feather-83629956:br-rapid-brook-zao6uwya'
if ($LASTEXITCODE -ne 0) { throw 'Rotation failed; read the code/stage line before retrying.' }
```

The script fetches the `neondb_owner` credential from the authenticated Neon CLI
into memory, generates four distinct 256-bit passwords, stages the new runtime and
operator files, changes all four roles in **one** transaction, moves the staged
files into place only after COMMIT, verifies each new login and finally runs the
offline `check-config`. It prints only `NEON_ROLE_PASSWORDS_ROTATED ...`,
`NEON_TEST_CREDENTIAL_ROTATION_COMPLETED` or a `code=... stage=...` line. Failure
before COMMIT changes nothing. If the COMMIT acknowledgement is lost, a login
with one new password decides automatically. `code=NEON_ROTATION_COMMITTED_FILES_PENDING`
means the new credentials are committed and held in `*.rotating` files next to
the originals: rename them over the originals, then run `check-config`.
`code=NEON_ROTATION_COMMIT_UNCONFIRMED` means the endpoint could not be reached
to decide: keep both sets, wait until the endpoint is reachable, then rename the
`*.rotating` files over the originals and run `verify`. If `verify` then reports
password authentication (`postgres_code=28P01`), the commit did not happen:
delete the three private files, rebuild them with
`refresh-neon-test-credentials.ps1` (Neon stores SQL-set passwords) and rotate
again. The export login keeps its provider-generated password.

`code=NEON_ROTATION_PREFLIGHT_REJECTED stage=role-profiles:<role>:<attribute>`
means a restricted role no longer has its reviewed profile, and nothing was
changed. Never loosen the guard. `role-profiles:migrator:memberships` most often
means Neon Auth was enabled on the branch: enabling it grants the `neon_auth`
role to the database owner. Check with **Branch > Auth**, decide with the owner,
disable it with data deletion only on this test branch, re-read the roles, then
rerun the rotation (done on 2026-11-05; see the evidence record). Any future staging or production
bootstrap uses `infra/neon/bootstrap.psql`, whose included guard refuses reused
or missing secrets before any role change.

The owner authorized creation of `nthawi_export` on the test branch. It was
created through the Roles API. To inspect it manually select the exact **test**
branch, then **Postgres database > Roles**. Do not create it again. If preparing a
different authorized target in the future, provider Roles **Add role** is the
administrative path; restricted runtime roles use reviewed SQL/bootstrap instead.

The following command recovers existing passwords through the authenticated Neon
CLI and writes three Git-ignored files. It refuses to overwrite any existing
file, validates exact target/roles/TLS, and suppresses credential output. It
creates or resets no role. It has already been used for the current checkout;
use it only to rebuild deleted private files, never instead of the rotation.

```powershell
# Run ONLY when all three test files are absent and credential retrieval for
# this exact target is authorized. Existing files are preserved on refusal.
powershell.exe -NoProfile -NonInteractive -File .\scripts\refresh-neon-test-credentials.ps1 -Target test -ConfirmBranch br-rapid-brook-zao6uwya
if ($LASTEXITCODE -ne 0) { throw 'Private credential recovery failed or files already exist.' }
```

Files: `.env.neon.test.runtime.local` contains only auth/business URLs;
`.env.neon.test.operator.local` contains migration/jobs URLs, four role names,
`NEON_TARGET=test` and the exact expected branch; `.env.neon.test.export.local`
contains only `NEON_ACCEPTANCE_ADMIN_URL`. Keep the export login confined to
the recovery/operator context. Do not print, commit, copy to browser builds,
upload to review tools, or deploy these files. The legacy environment writer
selects production and is not this setup flow.

## 5. Verify migrations, roles and the real compiled API

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\run-neon-database.ps1 -Target test -Mode check-config
if ($LASTEXITCODE -ne 0) { throw 'Offline test configuration failed.' }

powershell.exe -NoProfile -NonInteractive -File .\scripts\run-neon-database.ps1 -Target test -Mode verify
if ($LASTEXITCODE -ne 0) { throw 'Live database or compiled API acceptance failed.' }
```

`check-config` reads private test configuration but opens no SQL connection.
`verify` can unarchive/wake the test branch and consume compute. It checks
migration hashes/order, the compiled schema contract, constraints, roles/grants,
forced RLS, vector dimensions, database readiness, actual compiled API HTTP
behavior and shutdown/pool closure. Record the final bounded success lines and
exit code. An early `NEON_ROLE_VERIFIED` is not overall success. Preserve a
failed attempt and investigate; do not reset the database to make it pass.

## 6. Prove tenant isolation with new synthetic fixtures

```powershell
# Private evidence lives outside the repository and is never committed.
$phase4Evidence = 'C:\Users\USER\Desktop\Nthawi\Nthawi-phase4-evidence-private-final'
$phase4Authority = 'owner-answer-2026-11-05T1114Z-test-acceptance'
$null = New-Item -ItemType Directory -Force -Path $phase4Evidence
powershell.exe -NoProfile -NonInteractive -File .\scripts\run-neon-readiness.ps1 -Mode isolation -AuthorizationId $phase4Authority -Confirmation 'synthetic-isolation:delicate-feather-83629956:br-rapid-brook-zao6uwya' -OutputDirectory $phase4Evidence
if ($LASTEXITCODE -ne 0) { throw 'Live synthetic isolation failed; inspect private attempt/result evidence.' }
```

The harness persists generated UUID keys before connecting, commits 24 fresh
fixture rows for two tenants across all 12 forced-RLS tables, then connects as
the actual business/auth/jobs roles. It checks positive reads/writes, cross-tenant
and no-context denial, reuse, concurrent sessions, transaction-local context and
rollback. Cleanup targets only those generated keys and verifies their absence.
The private attempt/result records survive failures. A failed attempt must not
be cited as proof that its planned checks ran. If cleanup is unconfirmed, use
its keys to investigate under the same target authority; never delete by broad
prefix or clear a schema. This is an operator harness, not a public product route.

## 7. Prove full export and a restored copy

The Phase 3 proposal used `SET ROLE neon_superuser`. The current test code checks
the provider-created export login's own `rolbypassrls` and effective
`pg_read_all_data` privilege. It records whether Neon allows that role switch.
If the switch is refused but the login itself is proven to bypass RLS, both the
snapshot holder and `pg_dump` use that same login. This bounded provider-specific
remedy must be technically reviewed; membership alone is never enough. No FORCE
RLS, runtime grants, passwords or tenant policies are weakened.

```powershell
$phase4Ca = Join-Path $env:LOCALAPPDATA 'Nthawi\certs\mozilla-ca-bundle.pem'
powershell.exe -NoProfile -NonInteractive -File .\scripts\run-neon-readiness.ps1 -Mode export -AuthorizationId $phase4Authority -Confirmation 'synthetic-export:delicate-feather-83629956:br-rapid-brook-zao6uwya' -OutputDirectory $phase4Evidence -PgDump 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' -PgRestore 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' -CertificateFile $phase4Ca
if ($LASTEXITCODE -ne 0) { throw 'Full export/restore proof failed; preserve the private attempt.' }
```

Docker Desktop must be running. The exporter uses PostgreSQL 18 clients,
verified direct TLS and one held `REPEATABLE READ READ ONLY` snapshot. Before
starting `pg_dump`, that same privileged snapshot checks the exhaustive current
relation/column classification, extension versions, migration ledger, deletion
barrier, journal watermark, counts, 24 fixture hashes and separate role/grant
capture. Unknown content or overdue payloads block before dump or upload.
A nonempty `audit_events` table blocks rather than assuming it holds no content.
Rate-limit counters (`rate_limit`, P4-D09) never block: their data is excluded
from the dump with `--exclude-table-data="public"."rate_limit"`, the manifest
records the exclusion, and the restore must find that table empty. Schema
changes require a reviewed classification update.

The dump retains default `row_security=off`. Restricted role negative dumps must
fail for authenticated privilege/RLS denial; a password or network failure is
not evidence of isolation. Never add `--enable-row-security` to obtain a backup.

The actual dump hash/length is verified before restore. Restore uses a new owned,
loopback-only, digest-pinned PostgreSQL 18 tmpfs container. Every classified
relation count, catalog/migration contract, extension version and all 24 synthetic
row hashes must match. A local partial row-security dump is separately proven
incomplete in integration tests. The owned restore container is removed; the
dump, manifest, role/grant capture and cleanup receipts are retained privately.
Data/schema restore uses `--no-owner --no-privileges`; it does not establish
runtime ACL or credential replay. Roles/grants are captured separately and their
incident replay remains explicit operator work. No recovery upload occurs.

Do not use `psql -c 'BEGIN; SELECT pg_export_snapshot();'` as a holder: exiting
`psql` closes the transaction and invalidates the snapshot. Never call a dump
complete solely because its file exists or its process exited 0. Corrupt/missing
hashes, unsupported extension versions, a lost snapshot, an overdue barrier,
incomplete manifest or unconfirmed cleanup block completion.

Sources: [Neon roles](https://neon.com/docs/manage/roles),
[PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html).

## 8. Observe capacity without changing production

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\run-neon-readiness.ps1 -Mode capacity -AuthorizationId $phase4Authority -Confirmation 'capacity-read:delicate-feather-83629956:br-rapid-brook-zao6uwya' -MinCu 0.25 -MaxCu 1
if ($LASTEXITCODE -ne 0) { throw 'Test capacity observation failed.' }
```

This reads `max_connections`, `superuser_reserved_connections` and
`reserved_connections` on the authorized test target. It must not be described
as a production SQL measurement. Reconcile provider reservations once, retain
the conservative minimum-size budget, and compute unused headroom as
`(usable - 66) / usable`. At least 88 usable slots are required for 25% headroom.
The worker's 10-slot cap already includes its two maintenance connections.
Published formulas are comparison evidence, not a replacement for observation.
Frankfurt-to-London p95 latency remains a Phase 5 hosting gate.

## 9. Review promotion and recovery readiness

Use [the promotion runbook](neon-production-promotion.md). The separate checker
binds reviewed source/artifact/migrations, target and signed prerequisite
evidence. The initial-empty production executor additionally requires a separate
short-lived signed execution authority, exact operator confirmation, a fresh
same-client catalog/role/TLS preflight, a database advisory lock and durable
one-use audit. Existing test-only migration guards continue to refuse production.
No production connection or migration is authorized by this runbook.

The recovery contract tests define signed manifests, copy-before-ack receipts,
independent pre-transition deletion intent, generation fencing, a signed
contiguous journal tail, UTC slots 00/30 and a 20-minute deadline, 28/185/186-hour
locks, 5.5-day refresh, bounded four-hour restore pins and six-hour GC. They do
not deploy a durable service. The 191h35m deleted-byte arithmetic is a bound
conditional on those mechanisms actually operating; full independence, timed
RPO/RTO and deletion races remain Phase 15. Missing/corrupt journal or unknown
commit intents keep affected traffic closed; never replay payment or paid AI
side effects during recovery.

## 10. Run repository checks and publish through a PR

```powershell
pnpm.cmd install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Frozen install failed.' }
pnpm.cmd exec turbo run build --filter=@nthawi/api
if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
pnpm.cmd test:baseline-contracts
if ($LASTEXITCODE -ne 0) { throw 'Baseline regressions failed.' }
pnpm.cmd test:neon-readiness
if ($LASTEXITCODE -ne 0) { throw 'Phase 4 regressions failed.' }
powershell.exe -NoProfile -NonInteractive -File .\scripts\run-neon-readiness.test.ps1
if ($LASTEXITCODE -ne 0) { throw 'Readiness runner regressions failed.' }
powershell.exe -NoProfile -NonInteractive -File .\scripts\rotate-neon-test-credentials.test.ps1
if ($LASTEXITCODE -ne 0) { throw 'Rotation runner regressions failed.' }
```

`test:neon-readiness:integration` requires a local disposable literal-loopback
superuser URL in `RLS_TEST_ADMIN_URL`, PostgreSQL 18 tools (`pg_dump`,
`pg_restore`, `psql`) in `NEON_EXPORT_TEST_PG_BIN`, and Docker for owned restore
containers. It covers the content barrier, isolation, export/restore including
the `rate_limit` exclusion, and the bootstrap password guard. **Never set
`RLS_TEST_ADMIN_URL` to Neon.** CI supplies the disposable local target; its
existing whole-repository checks run on a clean checkout with no `.anchor/`.
Locally use scoped formatting or a separate clean verification checkout; never
read, move or delete plugin state to make formatting pass.

Commit only reviewed Phase 4 code/docs/tests/workflows. Push the feature branch
and open a PR to `master`; do not push directly to master. Record final source
SHA, latest exact-head CI and CodeRabbit/technical review evidence. Independent
human approval, resolved threads and a separate merge instruction are still
required. Only then update the conditional Phase 5 handoff with accepted facts.

## 11. Neon Console checklist (owner, before acceptance)

Everything below is inspection except item 6, a free, non-compute setting.
Record UTC time and what you saw; never record passwords or billing details.

1. **Organization and project.** Console > organization `org-wild-bird-68149107`
   > project `Nthawi` (`delicate-feather-83629956`). Confirm AWS London and
   > PostgreSQL 18 on the project dashboard.
2. **Billing.** Organization menu > **Billing**. Launch is active and a valid
   payment method is on file. Do not upgrade or buy again.
3. **History.** Project > **Settings > Postgres > History window** shows
   **7 days**.
4. **Production branch.** **Branches > production**: shield icon shows
   **protected**. **Computes** tab > `ep-wild-leaf-za09k0vy` > **Edit**: minimum
   0.25 CU, maximum 1 CU, **Scale to zero off**. Close without saving.
5. **Test branch.** **Branches > test/nthawi-database-bootstrap**: unprotected.
   **Computes** > `ep-cold-shadow-zaqw3flo` > **Edit**: 0.25-1 CU, scale to zero
   after 5 minutes. **Roles** lists `nthawi_migrator`, `nthawi_auth`,
   `nthawi_business`, `nthawi_jobs`, `nthawi_export` and `neondb_owner`. After
   §4, the four restricted roles show a new updated time. Do not use **Reset
   password** on them: provider resets bypass the staged-file rotation.
6. **Update window (recommended once).** **Settings > Postgres > Updates**:
   choose a low-traffic hour, for example Sunday 00:00-01:00 UTC (02:00-03:00 in
   Malawi). Production is always on, so this decides when its brief restart for
   updates happens. Launch posts the notice in the console only, three days
   ahead.
7. **Compute defaults (recommended once).** **Settings > Postgres > Compute
   defaults** still shows the project default 0.25-8 CU with provider-default
   suspension. It applies only to computes created later (for example a restore
   or rehearsal branch), not to the two existing endpoints. Set minimum 0.25 CU,
   maximum 1 CU and scale to zero after 5 minutes so a new branch cannot
   silently autoscale to 8 CU. Save, then re-read metadata (item 9).
8. **Do not** enable **Auth** (Managed Better Auth), the Data API, IP Allow or
   any new branch on either project in Phase 4 (P4-D11). Do not change the
   `nthawi-staging` project; it is configured in Phase 5.
9. **Re-read.** After any save, re-run the metadata step in §3 and the assessor
   within one hour.
