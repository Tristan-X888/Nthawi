# Baseline and isolated Neon evidence — 17 October 2026

Use `docs/runbooks/neon-completion.md` for commands and the remaining delivery order.
This record does not mark reviewed production promotion or GitHub approval complete.

## Repository baseline

`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/verify-step4.ps1`
exited 0 after the catalog batching change. The recorded final line was:

```text
Step 4 dependency, integration, audit and image gates passed.
```

The runner verified managed Node v24.21.0, pnpm 10.16.1, frozen dependencies and
unchanged lockfile; formatting, lint, types and all application builds; 52 API,
35 tooling and 6 DB unit tests; 34 browser boundary, 7 image-helper and 4 compiled
export tests; 3 API composition tests; 65 real PostgreSQL DB and 30 API integration
tests; production dependency audit; and the actual Linux API image checks.
One existing moderate esbuild development-server advisory remains; no high or
critical advisory was reported. No dependency or migration history was rewritten.

Additional regressions passed: 74 Neon target/database tests, 12 compiled API
acceptance tests, 9 PowerShell Neon lifecycle cases, 3 lockfile cases, 6 baseline
lifecycle cases plus native exit handling. A mocked bootstrap passed both success
and native-failure cases with inherited libpq service/host/options cleared and
restored. Bootstrap syntax parsed successfully.

The complete 86-test Neon suite was repeated after builds finished and passed.
A prior run failed during concurrent artifact rebuilding; the sequential rerun
passed. The unsuccessful run is not counted as a pass.

The final baseline raw log is in the operator's temporary directory as
`nthawi-baseline-final-2026-10-17.log`. Focused Neon output is recorded there as
`nthawi-neon-regressions-final-2026-10-17.log`.

## Live isolated database

Project: `delicate-feather-83629956`.
Branch: `br-rapid-brook-zao6uwya` (`test/nthawi-database-bootstrap`).

The first-migration runner passed empty-target preflight, then applied the
existing three Drizzle migrations and runtime grants. Configuration initially
contained stale passwords; the authenticated Neon CLI supplied current passwords
to ignored test files without resetting any server password.

Live catalog inspection confirms PostgreSQL 18, pgvector, four restricted LOGIN
roles, 20 public application tables, and 12 tables with both RLS and FORCE RLS.
The runtime logins matched every compiled schema/privilege check. Three stored
migration hashes match repository SQL byte-for-byte:

| Migration              | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `0000_initial_app.sql` | `3b30c4ca8435b07bb398966fee9d59025266aceb9e99d3c8dfe467232bc685a6` |
| `0001_tenant_rls.sql`  | `a2e4676bc188244ae64d015693e798564c463f8eddc936be79ede90445559a71` |
| `0002_better_auth.sql` | `4e0c7459fe4391600bc30e9eba470c32963ff354315fbec61aee536826ab0216` |

The `-Target test -Mode verify` runner passed with these bounded diagnostics:

```text
NEON_ROLE_VERIFIED kind=migrator
NEON_ROLE_VERIFIED kind=auth
NEON_ROLE_VERIFIED kind=business
NEON_ROLE_VERIFIED kind=jobs
NEON_APPLICATION_READINESS_VERIFIED
NEON_ACCEPTANCE_PASSED
NEON_API_ACCEPTANCE_PASSED shutdown_mode=ipc-sigterm-hook
```

The actual compiled API returned correct non-cacheable live/ready responses,
anonymous owner rejection and widget-origin rejection; both database pools closed.
Windows uses the explicitly labelled Nest shutdown hook over IPC. Linux's actual
OS-signal evidence is recorded separately after image acceptance. Container
diagnostics found a verified login taking 2.38s, beyond the former 2s pool setup
limit. The API now permits 3s for setup and warms both runtime logins after HTTP
starts; the 3s DB/4s HTTP readiness deadlines and 2s query limits are unchanged.
The two new resource tests pass (52 API unit tests total), covering concurrent
warmup, released clients and sanitized failures.

## Review and external gates

Independent review checked verifier lifecycle/security, unchanged catalog SQL,
live role/schema agreement and bootstrap environment isolation. The initial
authenticated CodeRabbit review completed over all 24 then-changed files and
raised 0 issues. The final authenticated CodeRabbit review covered all 29 changed
files and raised one minor issue: the earlier API unit count in this record was
stale. It is corrected to 52. No code issue was raised by that review.

PR #4 must pass hosted checks at the published implementation SHA and obtain the
one independent approving review required by the active `Protect master` ruleset.
The PR author cannot provide that independent approval. Do not bypass this rule.

Production was inspected read-only: PostgreSQL 18, owner `neondb_owner`, no Nthawi
roles, no application schemas/tables and no vector extension. Production bootstrap,
migrations and grants have not run. The prepared promotion sequence is in the
completion runbook; the test runner intentionally refuses production execution.
Render and subsequent delivery gates have not started.
