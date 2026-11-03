# Phase 1: authoritative baseline

Status on **3 November 2026 (Africa/Blantyre)**: **local baseline verified**;
PR [#4](https://github.com/Tristan-X888/Nthawi/pull/4) remains unmerged.
Phase 1 remains open until the final published revision passes current hosted
checks, receives an independent approving review, and is merged after the user's
explicit merge instruction. Automated reviews do not satisfy that approval.

## Authority and scope

The user's current chat instructions control this work. The intended sequence
is `Nthawi_io_Production_Implementation_Plan.pdf`, dated 30 October 2026,
page 10, Phase 1. Its SHA-256 is
`8a4368e2a68ae4f62d1cc5916ef456ba7f13a3025fcc07dc1f7a1cd5be27d5e9`.
The reference copy is in the operator's Downloads folder under
`nthawiimplementationplanotherdocuments`. It is not a repository dependency.

Phase 1 recovers a complete checkout, reconciles surviving changes, reviews
PR #4, identifies the accepted foundation and closes conflicting documentation.
The plan requires an accepted foundation merged under existing policy, with
current passing checks. No merge is authorized by this implementation request.
Release specification, infrastructure, production deployment, DNS, purchases,
Neon lifecycle operations, production migrations, password resets, volume
deletion and protection bypass are outside this phase.

October plans, runbooks, checked task boxes, PR descriptions and execution logs
are historical reference. In particular, their Neon promotion/Render sequence,
domain purchase assumptions and fixed workspace limits are not current
instructions or approved release decisions. No historical pass counts as fresh
acceptance. Web and widget remain starters.

## Accepted source and preservation

Use the complete checkout at:

```text
C:\Users\USER\Desktop\Nthawi\Nthawi
```

Its reconciliation candidate was PR #4 head
`de7b82d2118b2176355bd90a18954089987e5c7e`, on
`feat/neon-prototype-database`. The final published SHA is obtained with
`git rev-parse HEAD` and must match the PR's `headRefOid`; it is recorded in the
completion report and PR description. It is not yet an accepted merge commit.

The Phase 1 closure changes build on that candidate. Identify their exact
published commit with the commands below and the PR description; do not call it
an accepted merge commit until the required approval and explicit merge
instruction have resulted in an actual merge. The
[dependency review](phase-1-dependency-review.md) records the necessary,
independently reviewed exception to the unchanged original lockfile.

Fresh source comparison found:

- `Nthawi-team` remains clean at
  `fc9e92cbb4f035bc978d5b848b71e8c7cdfb0828`, an ancestor of the candidate.
- The partial `Nthawi` folder's 78 non-generated source files all match the
  candidate after CRLF normalization. There is no unique source to overlay.
- Both handoffs contain 29 existing source paths: 22 match the candidate and
  seven are older. All 36 entries in the `55996cf` handoff manifest match their
  SHA-256 hashes. The `e69eefd` handoff has two files from the newer candidate;
  preserve the handoff as a mixed historical artifact.

The selected full checkout is named `Nthawi`. The original partial folder was
preserved at `C:\Users\USER\Desktop\Nthawi\Nthawi-partial-preserved-2026-11-03`.
The earlier complete `Nthawi-canonical` checkout remains preserved alongside it;
an existing editor held that directory open, so the selected checkout was
created with an independent Git clone and the verified working files. All 191
working source paths were reconciled byte for byte before updating path-only
documentation. Team and handoff folders remain intact. No reset or source
deletion was performed. The ignored root `.env` was preserved privately and
supplies the two local runtime logins; the web's ignored `.env.local` contains
only its public local API URL. No secrets are in this record.

## Acceptance criteria

1. Frozen installation uses managed Node `24.21.0` and pnpm `10.16.1`, preserving
   the reviewed lockfile byte for byte.
2. The complete baseline passes formatting, lint, types, unit tests, builds,
   browser boundaries, compiled exports, API composition, real isolated database
   integration, production audit, and the Linux API image checks.
3. Focused local/Neon verifier and PowerShell lifecycle/lockfile regressions pass.
   Neither the local runner nor hosted cleanup requests volume deletion.
4. The actual compiled API reaches exact non-cacheable liveness/readiness
   `200` responses against the preserved local database; anonymous owner access
   is `401`, widget-origin owner access is `403`, and both pools close on shutdown.
5. Read-only inspection confirms migration hashes, ownership, restricted role
   capabilities, 20 public application tables and 12 forced-RLS tables.
6. The final diff receives independent technical review and authenticated
   CodeRabbit review, then is committed and published to the existing PR.
   Current hosted workflows must pass on the final head.
7. One independent approving GitHub review, resolved review threads, strict
   required checks and an explicit merge instruction are required before merge.
   Phase 1 closes only after that accepted merge exists.

## Reproduce local verification

Use Docker Desktop in Linux-container mode. Keep loopback port `5434` free for
the uniquely named tmpfs test project. The runner removes only its own test
containers/network and temporary environment file, without requesting volume
deletion. The existing development container and volumes are not test fixtures.

Run each command from PowerShell and stop immediately on failure:

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
# Pin bare node as well as project scripts in this PowerShell process.
$env:PATH = 'C:\Users\USER\AppData\Local\pnpm\nodejs\24.21.0;' + $env:PATH
pnpm.cmd exec node --version
if ($LASTEXITCODE -ne 0) { throw 'Managed Node lookup failed.' }
pnpm.cmd --version
if ($LASTEXITCODE -ne 0) { throw 'pnpm lookup failed.' }

# Complete baseline, including frozen install and unchanged-lockfile assertion.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./scripts/verify-step4.ps1
if ($LASTEXITCODE -ne 0) { throw 'Complete baseline failed.' }

# Compiled API is built by the baseline before these lifecycle regressions.
pnpm.cmd test:baseline-contracts
if ($LASTEXITCODE -ne 0) { throw 'Baseline verifier regressions failed.' }
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./scripts/run-neon-database.test.ps1
if ($LASTEXITCODE -ne 0) { throw 'Neon runner regressions failed.' }
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./scripts/verify-step4.test.ps1
if ($LASTEXITCODE -ne 0) { throw 'Baseline lifecycle regressions failed.' }

# Reads the ignored runtime URLs privately; no migration/admin login is needed.
pnpm.cmd check:local-api
if ($LASTEXITCODE -ne 0) { throw 'Actual local compiled API acceptance failed.' }
git diff --exit-code -- pnpm-lock.yaml
if ($LASTEXITCODE -ne 0) { throw 'Reviewed lockfile changed.' }
Get-FileHash pnpm-lock.yaml -Algorithm SHA256
```

Expected versions are `v24.21.0` and `10.16.1`. Bare `node` may be the machine's
Node 22; always use pnpm for project execution. The reviewed lockfile SHA-256 is
`0103742d350a356ee6bbe09b4a33fd416764cbcf85e54a85bba25f0b407bbfff`.

`check:local-api` accepts only literal loopback URLs to port `55433`, database
`nthawi`, with separate `nthawi_business` and `nthawi_auth` logins and no URL
options. It rejects Neon selectors, remote targets and alternate roles before
staging files or spawning the API. It runs the real compiled entry point from
an isolated staging root so the repository `.env` cannot be loaded by the child.
The child receives only the two runtime URLs and synthetic provider settings;
it does not exercise email, Google, AI, billing or external provider readiness.
The strict Neon entry point retains its existing target validation.

## Preserved database evidence

Fresh read-only inspection on 3 November confirmed:

| Item                                                | Observed value                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| Container / host port                               | `nthawi-postgres` / `55433`                                          |
| Database / server                                   | `nthawi` / PostgreSQL `18.6`                                         |
| Existing volume                                     | `infra_postgres_data`, mounted at `/var/lib/postgresql`              |
| Database, public tables and migration objects owner | `nthawi_migrator`                                                    |
| Public application tables / forced RLS              | `20` / `12`                                                          |
| Extensions                                          | `vector 0.8.6`, `pgcrypto 1.4`, `plpgsql 1.0`                        |
| Auth/business/jobs/migrator roles                   | LOGIN, non-superuser, NOBYPASSRLS, no CREATEDB/CREATEROLE, NOINHERIT |

The existing privileged `nthawi_dev` administrator remains separate from the
runtime connections. No application data, password hash or credential was read
for this inventory. The three recorded migration hashes match the unchanged SQL:

```text
3b30c4ca8435b07bb398966fee9d59025266aceb9e99d3c8dfe467232bc685a6
a2e4676bc188244ae64d015693e798564c463f8eddc936be79ede90445559a71
4e0c7459fe4391600bc30e9eba470c32963ff354315fbec61aee536826ab0216
```

Inspect without secrets:

```powershell
docker ps -a --filter name=nthawi --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker inspect nthawi-postgres --format '{{json .Mounts}}'
docker exec nthawi-postgres psql -X -v ON_ERROR_STOP=1 -U nthawi_dev -d nthawi -c 'BEGIN READ ONLY; SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at; SELECT count(*) AS public_tables, count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity) AS forced_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=''public'' AND c.relkind=''r''; COMMIT;'
if ($LASTEXITCODE -ne 0) { throw 'Read-only database inventory failed.' }
```

Both known Neon branches were refreshed through metadata-only reads and report
`archived`: `br-rapid-brook-zao6uwya` and `br-lively-darkness-zahxet6z`.
No connection, lifecycle operation or migration was attempted against Neon.

## Current repository gates

### Fresh execution checkpoint

The complete patched baseline exited **0** with managed Node `24.21.0` and
pnpm `10.16.1`. It passed frozen dependency integrity, formatting, lint, types,
builds, 52 API / 35 tooling / 6 database unit tests, 34 browser-boundary /
7 image-helper / 4 compiled-export tests, 3 API composition tests, and
65 database / 30 API integration tests. The production audit passed the
unchanged high-severity gate: **0 high, 0 critical, 5 low and 6 moderate**.
The reviewed lockfile remained byte-identical during the frozen installation.

The Linux API image passed actual startup, health, exports, non-root user,
environment and shutdown checks:

```text
sha256:d6ec690822a6310b89e808c1654a160ac3f4ca7ea5f3936348c229698397f059
API image passed startup, health, exports, user, environment and shutdown checks.
Step 4 dependency, integration, audit and image gates passed.
```

The correctly pinned focused suite separately passed **104/104**. Actual
compiled local acceptance exited **0** with
`LOCAL_API_ACCEPTANCE_PASSED shutdown_mode=ipc-sigterm-hook`, proving ready `200`,
anonymous owner `401`, widget-origin owner `403` and closure of both pools.
PowerShell regressions passed nine Neon lifecycle cases, seven baseline
lifecycle cases plus native failure handling, and three lockfile cases.

The complete gate and focused/compiled acceptance were repeated successfully
from the selected `Nthawi` checkout after its frozen installation refreshed all
path metadata. The lockfile hash and accepted Linux image ID are unchanged.
The actual development stack was then started from this checkout: web on
`localhost:3000`, widget on `localhost:5173`, and API on `localhost:4000`.
Chromium verified meaningful rendering at `1280×800` and `390×844`, the web theme
shortcut and widget counter interaction, and no page errors, console errors or
warnings, or framework error overlays. The running API returned non-cacheable
liveness/readiness `200`, anonymous owner `401` and widget-origin owner `403`.
Only the task-owned development processes were stopped after these checks.
Startup commands are supplied in the chat. These checks cover the current
starters and foundation; external provider sign-in, email and release features
are not represented as completed product workflows.

The original graph's audit failure, restricted staging failure, interrupted
download attempts and rejected Node-version preflight are retained as failed
attempts. They do not count as passes. The
[dependency review](phase-1-dependency-review.md) records why the security
exception was necessary and how the generated graph was independently reviewed.

Authenticated CodeRabbit reviewed the full PR diff, including the new files,
and raised **3 minor issues**. The bootstrap prompt now describes assigning
passwords to new roles; historical commands now use the canonical checkout.
The volume concern was investigated: the test tmpfs covers
`/var/lib/postgresql`, matching the
[official PostgreSQL 18 VOLUME path](https://github.com/docker-library/postgres/blob/master/18/bookworm/Dockerfile).
The actual pinned image's `Config.Volumes` was inspected and confirms that exact
path, so the tmpfs covers it. No volume deletion was requested or performed.
The final authenticated CodeRabbit result and exact published revision are
recorded in the PR description and completion report.

The separate technical reviewer found no actionable local-verifier, boundary or
generated-graph defect, and independently corroborated the database inventory
and migration hashes. This technical review is not a submitted independent
GitHub approval. Current hosted results must match the published Phase 1 commit;
the initial `de7b82d` runs do not validate later revisions.

The active `Protect master` ruleset, ID `24955831`, requires one approving
review, dismisses stale approvals on push, requires review-thread resolution
and an up-to-date `Step 3 gate` from GitHub Actions. It has no bypass actors.
The initial refresh found both workflows passing at `de7b82d` and zero reviews;
those old check results do not validate the Phase 1 changes.

After publication, inspect the final revision using authenticated GitHub CLI:

```powershell
git status --short --branch
git rev-parse HEAD
gh pr view 4 --repo Tristan-X888/Nthawi --json url,state,headRefOid,baseRefOid,reviewDecision,reviews,mergeStateStatus
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect PR gates.' }
gh pr checks 4 --repo Tristan-X888/Nthawi
if ($LASTEXITCODE -ne 0) { throw 'PR checks are pending, missing or failing.' }
gh api repos/Tristan-X888/Nthawi/rulesets/24955831
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect repository rules.' }
```

Require PR head = local HEAD; both `Verify repository` and `Verify Neon contracts`
must pass at that head. The required approval must be independent of the PR
author and valid for the current revision. A clean local gate or automated
technical review cannot supply it. No merge command is part of verification.

## Next command after Phase 1

The PDF labels the next phase **2. Release specification**; it has no literal
“Step 2.1” heading. The following prompt names a bounded first substep. It is a
handoff only and does not authorize starting dependent work now:

> Implement Step 2.1 — Release specification and decision register only, using
> Phase 2 of Nthawi_io_Production_Implementation_Plan.pdf dated 30 October 2026.
> My instructions in this chat control the work. Use
> C:\Users\USER\Desktop\Nthawi\Nthawi and first verify Phase 1's accepted
> merge commit, current required checks, independent approval and explicit
> authorization to begin this step. Stop dependent work if any gate remains open.
> Treat historical plans and evidence as reference. Prepare a versioned bounded
> release specification, decision register and traceable acceptance matrix for
> scope, owner-account billing, prices/currency, workspace and usage quotas,
> service periods, renewal/expiry/grace/refund rules, languages and service
> objectives. Distinguish approved decisions from proposals; proposed consumed
> allowances must not reset on deletion, and prepaid PayChangu periods must not
> be presented as confirmed recurring eligibility. Ask only questions that block
> a concrete decision, then wait before dependent work. Preserve the plan's
> release exclusions. Do not implement product features, migrations,
> infrastructure, DNS, purchases, deployment or Neon lifecycle changes. Publish
> reviewed documentation only within authorization, report remaining decisions
> and stop after Step 2.1.
