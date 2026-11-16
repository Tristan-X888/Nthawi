# Phase 5 dependency audit: 13 November 2026

Status: **Phase 4 accepted; Phase 5 implementation in progress.** This audit records live GitHub acceptance, project-level Neon identity reconciliation, provider inventory limits and a pre-change local regression baseline. It is not a staging deployment receipt.

## Authority and scope

The current owner command starts Phase 5 only and requires Phase 4 to be fully complete first. The accepted plan file has SHA-256 `8a4368e2a68ae4f62d1cc5916ef456ba7f13a3025fcc07dc1f7a1cd5be27d5e9`; page 10 defines Phase 4 evidence as verified targets, migrations, roles, readiness and recovery procedure, and Phase 5 completion as recreation from configuration verified over HTTPS. The binding [v0.3 contract](../release/v0.3/release-specification.md) and its incorporated v0.2/v0.1 decisions remain unchanged.

The canonical workspace is `C:/Users/USER/Desktop/Nthawi/Nthawi`. Audit reads and tests preserved private environment files and `.anchor/`. No production SQL, migration, release, provider mutation, email or external message was performed by this audit.

## Live repository acceptance

The parent agent queried GitHub through the selected connector and fetched the local remote refs on 13 November 2026. Exact responses, rather than the historical pending checkboxes, establish the following result.

| Requirement                     | Observed evidence                                                                                                                                                                                                               | Result                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Final Phase 4 PR                | [PR #7: Phase 4 Neon readiness](https://github.com/Tristan-X888/Nthawi/pull/7), author `Tristan-X888`, base `master`, final head `01bc39e77d26adb34df2d5a63a88a8895f4f4460`                                                     | Passed                        |
| Independent exact-head approval | [`sviyazhi` approval #5794094536](https://github.com/Tristan-X888/Nthawi/pull/7#pullrequestreview-5794094536), `APPROVED`, `commit_id` equal to the final head, submitted `2026-11-06T00:30:26Z`; author differs from PR author | Passed                        |
| Merge accepted into master      | Merge `b8f5b3c98c13375941369a8758f7a08c22ec4d62`, merged `2026-11-06T00:30:59Z`; live `master` still points at this merge                                                                                                       | Passed                        |
| Final-head required check       | [Step 3 gate, run 42132823971](https://github.com/Tristan-X888/Nthawi/actions/runs/42132823971), completed `success` on exact final head                                                                                        | Passed                        |
| Final-head Neon workflow        | [Neon contract verification, run 42132824066](https://github.com/Tristan-X888/Nthawi/actions/runs/42132824066), completed `success` on exact final head                                                                         | Passed                        |
| Latest master required check    | [Step 3 gate, run 42137389128](https://github.com/Tristan-X888/Nthawi/actions/runs/42137389128), completed `success` on exact merge SHA                                                                                         | Passed                        |
| Latest master Neon workflow     | [Neon contract verification, run 42137388977](https://github.com/Tristan-X888/Nthawi/actions/runs/42137388977), completed `success` on exact merge SHA                                                                          | Passed                        |
| Effective ruleset               | [Ruleset 24955831, Protect master](https://github.com/Tristan-X888/Nthawi/rules/24955831): `active`, default-branch condition, `bypass_actors: []`, current user bypass `never`                                                 | Passed                        |
| Review/check protections        | One approving review, stale approvals dismissed on push, review-thread resolution required, strict `Step 3 gate` required with integration ID `15368`, deletion and non-fast-forward protection                                 | Passed                        |
| Review threads                  | `list_pull_request_review_threads` returned an empty list                                                                                                                                                                       | Passed; no unresolved threads |

GitHub's general branch response reports ruleset protection separately from legacy branch-protection status. The active ruleset detail is the source for effective review/check requirements; a legacy `protection.enabled: false` field alone must not be reported as an unprotected branch.

The historical [Phase 4 readiness evidence](phase-4-neon-readiness.md), lines 3-7 and 154-160, and [target inventory](phase-4-neon-target-inventory.md), lines 45-48, still say repository acceptance is pending. They describe their 5 November state. This dated audit resolves that status; it does not rewrite their historical observations.

## Phase 4 technical evidence and proof limits

The accepted PR records final executable live acceptance on `debac37d1c63d5e5ccab0253b5b78a02bc7d0aca`. The final head `01bc39e` changes only three evidence files relative to that executable commit. See the [final-code evidence](phase-4-neon-readiness.md#final-commit-live-acceptance-code-commit-debac37-2026-11-05) and [accepted PR description](https://github.com/Tristan-X888/Nthawi/pull/7).

Recorded proofs include the post-rotation distinct-password guard, real restricted-role API verification and shutdown, two-tenant isolation across 12 forced-RLS tables, complete same-snapshot privileged export, denied restricted-role dumps, matching local restoration, synthetic cleanup, observed capacity and 16/16 provider configuration checks. These are accepted historical live proofs from 5 November, not new SQL runs on 13 November.

P4-D07 through P4-D11 remain binding: the export login itself holds BYPASSRLS and effective `pg_read_all_data`; every role has a distinct generated secret; `rate_limit` data is excluded from recovery copies and restores empty; nonempty `audit_events` blocks export until classified with its first writer; Neon Managed Better Auth is not adopted. See [Phase 4 decisions](phase-4-neon-readiness.md), lines 134-140.

The [promotion runbook](../runbooks/neon-production-promotion.md), lines 1-35, records implemented tooling and offline tests without production execution. Neither that tooling nor this audit authorizes production migration. Phase 4 did not claim deployed recovery services, independent recovery copies, eight-day deleted-byte enforcement, RPO/RTO, Frankfurt-to-London latency or a customer SLA.

## Neon identity reconciliation

The parent agent used project-level settings, branch-list and project endpoint-list metadata reads at `2026-11-13T07:53:43Z`, saved in the [sanitized inventory](phase-5-neon-metadata-2026-11-13.json). No role-password retrieval, branch-level SQL connection, bootstrap, migration, compute change, unarchive, database creation or credential rotation was performed.

| Purpose              | Exact project / branch / endpoint                                                     | Fresh observed settings                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production           | `delicate-feather-83629956` / `br-lively-darkness-zahxet6z` / `ep-wild-leaf-za09k0vy` | Organization `org-wild-bird-68149107`; London `aws-eu-west-2`; PostgreSQL 18; Launch `launch_v3`; history 604800 seconds; branch protected and ready; writer active, 0.25-1 CU, suspension `-1` |
| Synthetic acceptance | `delicate-feather-83629956` / `br-rapid-brook-zao6uwya` / `ep-cold-shadow-zaqw3flo`   | Branch named `test/nthawi-database-bootstrap`; 0.25-1 CU, 300-second suspension; separate from staging                                                                                          |
| Staging candidate    | `calm-math-03562419` / `br-tiny-hall-za0rrr1l` / `ep-super-frost-zawnips1`            | Organization `org-wild-bird-68149107`; London; PostgreSQL 18; Launch; history 86400 seconds; branch still named `production`; endpoint idle, 0.25-8 CU, suspension override `0`                 |

The staging project's branch name does not make it the production database. Operations must pin project, branch and endpoint IDs together. The registered synthetic acceptance target remains unchanged and must never be repointed to staging.

The production project's defaults still permit 0.25-8 CU. This is already explicitly documented in the [console runbook](../runbooks/phase-4-neon-console.md), lines 375-380. Reducing those defaults is described as a recommended action for future computes. Existing Phase 4 configuration acceptance checks the effective production writer at 0.25-1 CU, so this is not a newly discovered failure of its accepted gate. Any new Phase 5 compute must receive explicit approved limits instead of inheriting the 8 CU default. No default was changed.

Production's current role/schema emptiness was not re-proven by SQL in this audit. The historical `initial-empty` classification must not be represented as a newly observed catalog result. Staging application roles and bootstrap likewise remain unproven until a separately authorized operation verifies them.

The existing offline `assessProductionConfiguration` was run on the fresh production inventory under Node 24.21.0. It returned 16/16 passed checks, `productionConfigurationReady: true`, and `phase4Ready: false`. The last field intentionally remains false: metadata is only one part of the full acceptance gate. Its one-hour freshness limit also means that a later operator must collect new metadata rather than relying indefinitely on this saved receipt. The exact read-only assessment command was:

```powershell
Set-Location -LiteralPath 'C:/Users/USER/Desktop/Nthawi/Nthawi'
$env:Path = 'C:/Users/USER/AppData/Local/pnpm/nodejs/24.21.0;' + $env:Path
@'
import { readFile } from "node:fs/promises"
import { assessProductionConfiguration } from "./scripts/neon-readiness.mjs"
const inventory = JSON.parse(await readFile("docs/evidence/phase-5-neon-metadata-2026-11-13.json", "utf8"))
const result = assessProductionConfiguration(inventory.production)
console.log(JSON.stringify({observedUtc: result.observedUtc, checksPassed: result.checks.filter((check) => check.passed).length, totalChecks: result.checks.length, productionConfigurationReady: result.productionConfigurationReady, phase4Ready: result.phase4Ready}, null, 2))
if (!result.productionConfigurationReady) process.exitCode = 2
'@ | node --input-type=module
if ($LASTEXITCODE -ne 0) { throw 'Fresh metadata assessor failed.' }
```

## Other provider inventory

Observed by the parent agent at `2026-11-13T07:52:49Z`, using selected provider connectors:

| Provider   | Observation                                                                           | Consequence                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render     | Accessible workspace list contains only `My Workspace`, ID `tea-d33afq8dl3ps738n62g0` | This is the explicitly unrelated workspace. No approved Nthawi application or recovery workspace was found through this connection; it must not be repurposed |
| Netlify    | Team/project reads returned `UNAUTHORIZED`, `oauth_token_invalid_grant`               | Current team, plan, project IDs, deployment policy and access cannot be verified until the connector is reauthenticated                                       |
| Cloudflare | API-spec/search read returned `UNAUTHORIZED`, `oauth_token_invalid_grant`             | Current account, zone, DNS, TLS settings and R2 state remain unverified; do not substitute local credentials or another account silently                      |
| Resend     | Domain inventory returned no domains                                                  | `notify-staging.nthawi.io` was not authenticated through this account; no domain was added and no email was sent                                              |

Inventory reads do not demonstrate Sherise's independent access, a funded provider plan, recovery account separation or authority to create resources. Authentication failure is not an empty-resource inventory.

## Pre-change local verification baseline

A separate read-only validation agent reran the safe suites under managed Node **24.21.0** and pnpm **10.16.1**, after identifying ambient Node 22.19.0 as unsupported. The supported-runtime rerun is the baseline reported here.

| Command / gate                                                                                           | Result                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| All `scripts/*.test.mjs`, excluding `*.integration.test.mjs`, run with `node --test --test-reporter=dot` | 463 passed, exit 0                    |
| `pnpm.cmd --filter @nthawi/api test`                                                                     | 56 passed across 11 files, exit 0     |
| `pnpm.cmd exec turbo run typecheck --force`                                                              | 10 successful tasks, 0 cached, exit 0 |
| `git diff --check`                                                                                       | Passed                                |

These are pre-change results for the dirty checkout, not final verification of the new Phase 5 changes. The earlier 190-regression statement covers a subset of the current script inventory. No live Neon acceptance, Docker export/restore integration, new HTTPS staging test or actual idle-period run was performed by this read-only validation.

Exact baseline commands, run from the authoritative workspace:

```powershell
Set-Location -LiteralPath 'C:/Users/USER/Desktop/Nthawi/Nthawi'
$env:Path = 'C:/Users/USER/AppData/Local/pnpm/nodejs/24.21.0;' + $env:Path
if ((node --version) -ne 'v24.21.0') { throw 'Expected Node 24.21.0.' }
if ((pnpm.cmd --version) -ne '10.16.1') { throw 'Expected pnpm 10.16.1.' }

$phase5TestFiles = @(
    Get-ChildItem -LiteralPath scripts -Filter '*.test.mjs' |
    Where-Object { $_.Name -notlike '*.integration.test.mjs' } |
    ForEach-Object { $_.FullName }
)
node --test --test-reporter=dot @phase5TestFiles
if ($LASTEXITCODE -ne 0) { throw 'Script regression failed.' }
pnpm.cmd --filter @nthawi/api test
if ($LASTEXITCODE -ne 0) { throw 'API unit tests failed.' }
pnpm.cmd exec turbo run typecheck --force
if ($LASTEXITCODE -ne 0) { throw 'Workspace typecheck failed.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed.' }
```

## Remaining Phase 5 gates

Phase 4 acceptance permits local Phase 5 work. It does not remove [G-04 and G-08](../infrastructure/phase-3/execution-and-acceptance.md#later-gates-and-stop-conditions), which require independent access/alert rehearsal before creation and current quotes/funding readiness before purchases. The USD 1,000 monthly envelope plus USD 250 reserve is planning authority, not spending approval. Each provider action still needs explicit operation, target, cost and rollback authority.

G-03 Netlify conformance, G-02 deployed-pool region latency, G-06 monitored Reply-To and DMARC destination, G-07 parser-host feasibility, real HTTPS endpoints, storage and recovery isolation, operator negative-access checks, telemetry and recreation evidence remain open. The accepted plan assigns actual worker/scanner behavior to Phases 8-9; a placeholder entrypoint must not be deployed or reported healthy to fill that gap.

The existing workspace is dirty and inherits unmerged P0 commit `9e89826`. New Phase 5 code must be independently reviewed with an explicitly scoped source diff, current final-head checks and the existing approval policy. This audit makes no merge or deployment claim.

Phase 5 is **not complete**. No Phase 6 work is started by this audit. A completion handoff to Phase 6 remains conditional on reviewed, recreated staging and its actual HTTPS acceptance evidence.
