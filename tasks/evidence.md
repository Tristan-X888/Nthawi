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
Windows uses the explicitly labelled Nest shutdown hook over IPC. Linux live
acceptance also passed on the final image, with the exact diagnostic:

```text
NEON_API_ACCEPTANCE_PASSED shutdown_mode=os-sigterm
```

Accepted image: `nthawi-api:step4`,
`sha256:4aa4ebf133cfe3cfd4d8058ed4acc7cd8b1e823b80554007def89637f1531f48`.
The container was removed after successful acceptance. Container
diagnostics found a verified login taking 2.38s, beyond the former 2s pool setup
limit; another cold login took 4.86s as network latency varied. The API now permits
10s for setup and warms both runtime logins after HTTP starts. Query execution is
bounded at 3s, statements at 2s, and DB/HTTP readiness remain bounded at 3s/4s.
The two new resource tests pass (52 API unit tests total), covering concurrent
warmup, released clients and sanitized failures.

## Review and external gates

Independent review checked verifier lifecycle/security, unchanged catalog SQL,
live role/schema agreement and bootstrap environment isolation. The initial
authenticated CodeRabbit review completed over all 24 then-changed files and
raised 0 issues. The final authenticated CodeRabbit review covered all 29 changed
files and raised one minor issue: the earlier API unit count in this record was
stale. It is corrected to 52. The subsequent review of the final three changed
runtime-budget/documentation files raised 0 issues. No code issue was raised.

The first hosted Neon run passed its lifecycle assertions but exposed PowerShell's
hidden-dotfile cleanup restriction on Linux. Fixture deletion now uses `-Force`
after its existing path check. The Windows regression marks the synthetic runtime
fixture hidden/read-only so protected-file cleanup is exercised locally too.
Final hosted results belong to the final published PR head, not that earlier run.

PR #4 must pass hosted checks at the published implementation SHA and obtain the
one independent approving review required by the active `Protect master` ruleset.
The PR author cannot provide that independent approval. Do not bypass this rule.

Production was inspected read-only: PostgreSQL 18, owner `neondb_owner`, no Nthawi
roles, no application schemas/tables and no vector extension. Production bootstrap,
migrations and grants have not run. The prepared promotion sequence is in the
completion runbook; the test runner intentionally refuses production execution.
Render and subsequent delivery gates have not started.

## Verifier recovery — 21–22 October 2026

The pasted failure had three separate causes: API-only tests had been appended
to the database test file, edited files had not been formatted, and PowerShell
diagnostic assertions depended on terminal-width formatting. The API tests now
live beside their harness, and diagnostic tests capture message text directly.
Seven deterministic diagnostic cases include wrapping inside the missing filename
and rejection of unrelated startup failures.

The readiness verifier now uses one bounded poller instead of a successful poll
followed by a second un-retried check. It retries recognized transport failures
and the exact non-cacheable 503 contract, requires the exact 200 ready contract,
and bounds both fetch and body consumption. Its readiness window stays at 45s.
Malformed responses, interruption, child exit and persistent unavailability fail.

A controlled Windows trace reached liveness at 54.990s while loading modules and
then shut down successfully. Windows listener startup now permits 90s; Linux
retains 45s. This allowance does not extend readiness: a regression rejects
readiness budgets over 45s before issuing a request. The database verifier also
retains its four owned single-connection pools until mandatory final cleanup,
preventing idle eviction from introducing another TLS login immediately before
the unchanged three-second capability probe.

The first full baseline attempt stopped at the production audit because Vite
8.3.1/8.3.2 had newly reported launch-editor advisories. API and widget dependency
requirements and the lockfile now resolve Vite 8.3.3, including Vitest peer
contexts. The supported patch removes those high-severity findings without audit
suppression or an incompatible override. The subsequent full baseline passed
frozen dependency integrity, formatting, lint, types, builds, all 52 API / 35
tooling / 6 database unit tests, 34 boundary / 7 image helper / 4 compiled export
tests, 3 API composition tests, 65 database / 30 API integration tests, production
audit and actual Linux image verification. One moderate esbuild advisory remains;
the high/critical gate passes.

Focused Neon regressions passed **97/97** (74 target/database and 23 compiled API
verifier tests). The PowerShell runner passed its nine lifecycle cases and seven
diagnostic cases, including a narrow terminal run. Live `-Target test -Mode verify`
passed role/schema/vector/migration checks and actual compiled API acceptance
with `shutdown_mode=ipc-sigterm-hook`. The Linux image also passed live acceptance
with `shutdown_mode=os-sigterm`. The accepted image was:

```text
nthawi-api:step4
sha256:05117fa29d57f40dd46ffce37f150455cdfeb26d43ae6663687736f21ca0f112
```

Raw logs retained in the operator's temporary directory:

- `nthawi-baseline-patched-2026-10-21.log`
- `nthawi-neon-regressions-final-2026-10-21.log`
- `nthawi-runner-regressions-2026-10-21.log`
- `nthawi-neon-live-final-2026-10-21.log`
- `nthawi-neon-linux-2026-10-21.log`
- `nthawi-api-startup-profile-2026-10-21.log`
- `nthawi-coderabbit-final-2026-10-21.ndjson`

Authenticated CodeRabbit review completed over all nine changed code/dependency/
runbook files and raised **0 issues**. A further independent read-only review on
22 October (Africa/Blantyre, UTC+02:00) found no material issues. A final CodeRabbit
documentation review raised one minor date concern; a UTC clock check confirmed
the local review date, which is now explicit. Failed early startup/audit attempts are not
counted as passes. Publishing the tested revision and validating its hosted
checks is separate from these local results; independent GitHub approval,
baseline merge and reviewed production promotion remain open requirements.

A fresh 22 October baseline rerun exposed a first-composition E2E setup hook
exceeding Vitest's default 10s (10.104s, with the next two cases passing). The host
had less than 1 GiB free memory. This setup uses lazy database pools and synthetic
auth without contacting Neon. Cold local composition is consistent with the
earlier module-loading trace; timing alone does not establish its sole cause.
Only this setup hook now has a finite 90s Windows / 45s Linux startup allowance,
matching the compiled verifier. Test bodies, cleanup and readiness deadlines are
unchanged. That failed rerun is not counted as a passing baseline.

The subsequent 22 October baseline completed with exit 0, including 3/3 API
composition tests, 65/65 database and 30/30 API integration tests, image checks
and scoped cleanup. Its audit had no high/critical findings but reported five
moderate findings: the existing esbuild advisory plus two new Vitest mocker
advisories across peer contexts. A supported Vitest/coverage patch to `4.1.12`
replaced every affected `4.1.11` context; Vite remains `8.3.3`. The resolver also
updated compatible Babel and source-map codec edges. These dependency changes
require another complete baseline run before publication.

### Final patched acceptance (22 October, Africa/Blantyre)

The complete baseline on Vite `8.3.3` and Vitest/coverage `4.1.12` exited **0**.
All checks and counts above passed, including fresh production builds, 3 API
composition tests, 65 database and 30 API integration tests, actual image checks
and owned-resource cleanup. The frozen install preserved this lockfile SHA-256:

```text
fe27cb49294a8e9967c6142f98fecf0e81801b5e635ec6bb5a390736c2468842
```

The final audit JSON reports **1 moderate, 0 high, 0 critical**; only the existing
esbuild advisory remains. Both new Vitest advisories are resolved.

Live isolated `-Target test -Mode verify` then exited **0**, with 74/74 database/
target and 23/23 API verifier regressions, all four role confirmations, application
readiness and compiled Windows acceptance (`shutdown_mode=ipc-sigterm-hook`).
The final Linux image also exited **0** with real OS SIGTERM acceptance:

```text
sha256:f0fd1da6cb0d1342426719d032e723b59bd2d552f8627fdc21b85636f2162e28
NEON_API_ACCEPTANCE_PASSED shutdown_mode=os-sigterm
NEON_LINUX_OWNED_CONTAINER_REMOVED
```

Final PowerShell reruns passed both piped and narrow-terminal capture (nine
lifecycle and seven diagnostic cases), three lockfile cases and six baseline
orchestration cases plus native-exit handling. Authenticated CodeRabbit reviewed
all 11 changed files after the Vitest patch and raised **0 issues**. Independent
review confirmed that all compatible transitive refreshes satisfy their parent
dependency ranges. No production writes were performed.

The final baseline and Windows acceptance raw logs are
`nthawi-baseline-vitest-final-2026-10-22.log` and
`nthawi-neon-live-final-2026-10-22.log` in the operator's temporary directory.
The audit snapshot is `nthawi-audit-patched-2026-10-22.json`. Published-head CI
and the required independent GitHub approval remain separate external evidence;
production promotion and Render remain pending.
