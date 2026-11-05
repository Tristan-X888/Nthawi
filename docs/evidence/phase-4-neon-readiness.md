# Phase 4: Neon readiness evidence

Date: 5 November 2026 (UTC). **G-01 status: implementation complete and
verified offline on Windows and Linux; final-commit live re-proofs pending the
operator's role-password rotation; repository acceptance pending.** Phase 4 is
not accepted until its pull request has final-head CI, an independent human
approval, resolved threads and a separately instructed merge.

## Authority and dependency

- Plan: production implementation plan, SHA-256
  `8a4368e2a68ae4f62d1cc5916ef456ba7f13a3025fcc07dc1f7a1cd5be27d5e9`, page 10.
  Phase 4 work: inspect the archived branch lifecycle, re-establish isolated
  acceptance, choose production plan/recovery coverage, implement reviewed
  production promotion. Evidence: verified targets, migrations, roles, readiness
  and recovery procedure.
- Contract: `docs/release/v0.3/release-specification.md` (incorporating v0.2 and
  v0.1). No product rule changes in this phase.
- Phase 3 dependency: PR
  [#6](https://github.com/Tristan-X888/Nthawi/pull/6) final head
  `2468bb5b9b31e7c0cf4fc00e29e369aa77758d71`, approved by `sviyazhi` at
  2026-11-04T15:07:19Z, merged at 15:08:11Z as
  `b0e95bca10ca8ece2b45742b0bf626d50187df0a`. The external Phase 3 checker,
  run on a clean clone of that merge, reported `PHASE4_READY=true` at
  2026-11-05T10:55:55Z. That flag refers to the Phase 3 dependency only.
- Owner authorizations (2026-11-05, ~11:14Z), recorded as given: the Launch plan,
  production branch protection, the `nthawi-staging` project creation and the
  test-branch `nthawi_export` login (all made earlier the same day); live
  acceptance on `br-rapid-brook-zao6uwya` only (verify, 24 synthetic rows with
  cleanup, `pg_dump` restored into a local disposable PostgreSQL 18, test
  compute 0.25–1 CU); seven-day history; production compute 0.25–1 CU with
  scale-to-zero disabled. At about 19:37Z the owner directed rotation of the
  shared test-role passwords (P4-D08).

## Observed provider configuration

Project-level reads only (no SQL), recorded in
[the sanitized metadata](phase-4-neon-metadata-2026-11-05.json), observed
2026-11-05T22:41:14Z. The offline assessor passed all 16 configuration checks
on it (`productionConfigurationReady: true`; `phase4Ready` stays false by
design). It rejects metadata older than one hour, so acceptance re-fetches it.

| Item                   | Observed value                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Organization / project | `org-wild-bird-68149107` / `delicate-feather-83629956` "Nthawi", AWS London `aws-eu-west-2`, PostgreSQL 18                           |
| Plan / history         | `launch_v3`; `history_retention_seconds` 604800 (seven days)                                                                         |
| Production branch      | `br-lively-darkness-zahxet6z` "production": ready, **protected**, no application roles or schema yet (initial-empty)                 |
| Production endpoint    | `ep-wild-leaf-za09k0vy`: 0.25–1 CU, `suspend_timeout_seconds` −1 (scale to zero disabled), active since 2026-11-05T11:14:53Z         |
| Test branch            | `br-rapid-brook-zao6uwya` "test/nthawi-database-bootstrap", parent production: ready, unprotected, migrated (0000–0002)              |
| Test endpoint          | `ep-cold-shadow-zaqw3flo`: 0.25–1 CU, 300-second suspension                                                                          |
| Staging candidate      | Separate project `calm-math-03562419` "nthawi-staging" exists (created 2026-11-05T01:46Z with owner approval); configured in Phase 5 |

Production compute bills continuously while it is always on (about USD 19.08 per
30 days at 0.25 CU, USD 76.32 at a sustained 1 CU, public Launch rates; storage,
history, tax and FX extra). Compute updates on paid plans are applied in the
project's chosen update window (Settings > Postgres); manual weekly restarts are
only needed above 16 CU.

## Archived branch lifecycle

On 2026-11-04T15:33Z ([earlier metadata](phase-4-neon-metadata-2026-11-04.json))
the project was on the Free plan (`free_v3`, six-hour history) and both branches
were **archived** and unprotected. The test branch was unarchived by the
authorized connection at 2026-11-05T10:22Z. Production became ready when the
owner applied the Launch, protection and compute settings, and its always-on
compute has run since 11:14:53Z. Any SQL connection or branch-level operation
unarchives a branch and its parents, so every runner treats such a call as a
remote operation that needs specific authority; project-level metadata reads do
not unarchive. A protected, always-on production compute is not archived while
it runs.

## Live acceptance on the test branch (2026-11-05, before the final code)

These runs used the code as it stood at 12:01–12:31Z. The scripts changed
afterwards (P4-D08, P4-D09 and edits made between 16:56 and 17:01Z), so they are
**supporting evidence, not final-commit acceptance** (P4-D10).

| Check                | Result                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-config`       | Passed 11:57:50Z (offline).                                                                                                                                                                                                                                                                                                                                                                                       |
| `verify`, attempt 1  | **Failed** 11:58Z: `code=NEON_ACCEPTANCE_FAILED stage=role:jobs postgres_code=none network_code=none`, during a compute cold start (`start_compute` 11:58:16Z). A sanitized diagnostic at 12:00:18Z connected as business and jobs with correct restricted profiles. Root cause not established; recorded as an unexplained transient.                                                                            |
| `verify`, attempt 2  | Passed 12:01:17–12:03:07Z: four roles verified, application readiness, vector(1536), `NEON_API_ACCEPTANCE_PASSED shutdown_mode=ipc-sigterm-hook`.                                                                                                                                                                                                                                                                 |
| Isolation `c242146c` | Failed 12:03:43Z at `operator-privilege`: Neon refused `SET ROLE neon_superuser` (XX000). Its planned checks are not cited. This triggered P4-D07.                                                                                                                                                                                                                                                                |
| Isolation `d27ed867` | Passed 12:19:37Z: 12 forced-RLS tables, 2 tenants, 24 fresh synthetic rows, business/auth/jobs roles, reuse, concurrency, rollback; cleanup verified.                                                                                                                                                                                                                                                             |
| Export `d38ea146`    | Passed 12:25–12:27Z: one held snapshot (12:25:29.111Z), 21 classified relations, zero overdue, dump SHA-256 `9e5ae09006cfb1a733f0817f4852cc500da1fb3bae8186096cafbc16318af49e` (64,996 bytes), catalog `203740bc…`, role/grant capture `ee9e049f…`; three restricted-role dumps denied (`permission-denied`); restored copy matched catalog, 21 counts and 24 row hashes; fixture cleanup verified 12:27:00.756Z. |
| Capacity             | 12:30:55Z, test endpoint: `max_connections` 450, superuser reserved 4, reserved 0, 446 usable (85.2% unused for the planned 66). The documented minimum-size budget (97 usable) still exceeds the required 88.                                                                                                                                                                                                    |

Out-of-session activity, observed on 2026-11-05 and recorded without inference:
the test compute started at 14:27, 14:57, 16:14, 16:53, 19:09 and 19:24Z, and
`nthawi_migrator` was changed by SQL at 19:09:47Z (no control-plane operation).
The rotation in P4-D08 replaces all four passwords regardless.

## Decisions

| ID     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-D01 | Exact registered direct targets only; production is never selectable by test runners; arbitrary URLs refused.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P4-D02 | Launch, seven-day history, production 0.25–1 CU always on, protected (applied with owner authority).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P4-D03 | Synthetic-only separate staging project and bounded rehearsals; never copy customer rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P4-D04 | Full export under default `row_security=off`; never `--enable-row-security`; FORCE RLS and runtime privileges unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P4-D05 | Pre-export classification and deletion barrier bound to the schema-manifest fingerprint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P4-D06 | Production promotion is a separate signed, one-use, initial-empty executor; no production migration performed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P4-D07 | **Export mechanism.** Neon refuses `SET ROLE neon_superuser` (XX000). The export login holds BYPASSRLS itself plus effective `pg_read_all_data`; the snapshot holder and `pg_dump` use that same login with `--snapshot` and no `--role`. This supersedes the export-login row in Phase 3 `data-and-recovery.md` and the access-matrix wording in Phase 3 `README.md`, which stay unchanged as accepted history.                                                                                                                                                                                                                                           |
| P4-D08 | **Distinct role credentials.** On 2026-11-05 all four test roles shared one password, so a runtime credential could log in as the DDL-owning migrator. Every role and the export login must now hold a different secret. Enforced by `assertNeonTestEnvironment` (all test runners), `readNeonConnections` (test verification and production promotion), the export-login guard, `infra/neon/bootstrap-password-guard.psql` (any future staging or production bootstrap) and the bootstrap runner. `scripts/rotate-neon-test-credentials.ps1` rotates the test roles in one transaction; until it runs, every live test runner refuses the existing files. |
| P4-D09 | **Table rules.** `public.rate_limit` is `transient-security`: its rows never block an export, its data is excluded from every recovery copy (`--exclude-table-data="public"."rate_limit"`), and a restore must find it empty. `public.audit_events` stays `ungoverned-operational` (any row blocks) until Phase 6 defines its content contract and retention in the same change that first writes it. `public.verification` keeps its rule; expired rows need a purge before account deletion ships.                                                                                                                                                       |
| P4-D10 | **Evidence freshness.** All live proofs are re-run on the final commit after rotation; the 2026-11-05 runs are supporting evidence only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P4-D11 | **Neon Managed Better Auth: not adopted in Phase 4.** Neon documents separately deployed frontend and backend as not yet supported, and the accepted design runs Better Auth inside the API behind the signed Netlify proxy. Any adoption is a Phase 3 design change decided before Phase 5 configures the owner app, then implemented in Phase 6.                                                                                                                                                                                                                                                                                                         |

## Offline verification of the final code

| Suite                                                             | Windows (Node 24.21.0)              | Linux (container)                                                                             |
| ----------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm test:neon-readiness`                                        | 232 passed                          | 229 passed before the last three rotation tests (Node 24.21.0, pnpm 10.16.1); CI runs all 232 |
| `pnpm test:baseline-contracts`                                    | 111 passed                          | 111 passed                                                                                    |
| `pnpm test:neon-readiness:integration` (disposable loopback PG18) | 28 passed; owned containers removed | Runs in CI (`verify.yml`)                                                                     |
| PowerShell runner tests (database, readiness, rotation)           | Passed on PowerShell 5.1 and 7      | Passed on pwsh 7.4 (Linux)                                                                    |
| PostgreSQL 18 client install step                                 | n/a                                 | Passed on Ubuntu 24.04 (pg_dump, pg_restore, psql 18.6)                                       |

Final-head CI on the pull request is the authoritative cross-runner record.

## Remaining before acceptance

1. Operator: rotate the test-role passwords (console runbook §4).
2. Operator: re-run `check-config`, `verify`, isolation, export and capacity on
   the final commit and record their IDs, hashes and times here (runbook §5–§8).
3. Re-fetch provider metadata and run the assessor (runbook §3).
4. Pull request: final-head CI, technical review, independent human approval,
   resolved threads, then a separately instructed merge.

Not claimed: a deployed recovery service, independent recovery copies, eight-day
deleted-byte enforcement, RPO, RTO, Frankfurt-to-London latency (G-02, Phase 5)
or any customer SLA. A Neon branch is not an independent backup.

Use [the console runbook](../runbooks/phase-4-neon-console.md),
[production promotion](../runbooks/neon-production-promotion.md) and
[the Phase 5 handoff](../plans/2026-11-05-phase-5-handoff.md).
