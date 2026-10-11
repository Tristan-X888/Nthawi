# Step 4 API/database foundation

The user authorized implementation of the complete Step 4 outline on 10 October 2026. Preserve the Nest/Fastify monolith, current Better Auth behavior, existing
Drizzle migrations, root `Hello World!` endpoint, and all unrelated user work.
This does not authorize commits, pushes, deployment, real provider calls, or
uploads of private source to external review services.

## Shared interfaces

- Tooling remains the sole server environment validator. Add required
  `AUTH_DATABASE_URL`; `DATABASE_URL` becomes business access. Migration and test
  administrator credentials never enter API runtime configuration.
- DB exports `DatabaseHandle = ReturnType<typeof createDatabase>`,
  `DatabaseCapability = "auth" | "business"`, and
  `probeDatabase(handle: DatabaseHandle, capability: DatabaseCapability): Promise<void>`.
- `createDatabase(url, options?)` remains lazy; options allow bounded pool size,
  connection timeout, query/server statement timeout and a sanitized idle-error
  callback. Existing call sites remain compatible.
- API resources contain `authDatabase`, `applicationDatabase`, and idempotent
  `close(): Promise<void>`. Both pools close even when one closure fails.
- API exports `createApiApplication({env, auth, resources, logger?})`, returning
  an initialized NestFastifyApplication. Production and integration tests use
  this same composition, with injected auth and resources. This factory must
  not import the environment-loading auth singleton.
- Owner principal is derived from Better Auth; `/api/v1/me` returns only owner
  id/name/email/emailVerified and ISO session createdAt/expiresAt/freshUntil.
- Workspace entry checks ownership inside the transaction before setting the
  workspace context. Repositories remain private module providers.

## Task A — DB package (exclusive: packages/db)

1. Strengthen `withTenantTransaction` generics without changing local context SQL.
2. Add configurable bounded lazy pools and handled idle errors.
3. Add compiled schema compatibility manifest and build-time migration consistency
   checker; do not edit historical SQL. Runtime does not read migration source.
4. Implement bounded runtime probe: current/session roles, unsafe role flags,
   privileged memberships, table ownership, intended grants and prohibited access,
   required schema/migration hashes, RLS/FORCE RLS, vector column/extension.
5. Role provisioning artifact uses separate migrator/auth/business/jobs profiles.
   Auth CRUD only five identity tables; business SELECT/UPDATE workspaces and CRUD
   eleven existing tenant tables; no privileged operational tables or identity.
6. Tests authenticate using generated restricted LOGIN passwords, not admin
   connections with `options=-c role=...`. Retain explicit admin/bypass controls.
7. Test migrations clean, supported upgrade preserving data, repeat execution;
   real role restrictions; actual domain RLS including same-owner workspaces,
   composite foreign keys, successful/failed transactions and pool reuse.
8. Add test-only fixture helper as needed, usable by root API integration tests.
   It must reject unsafe remote test admin URLs and only clean generated resources.

## Task B — API application (exclusive: apps/api/src and contracts/src)

1. Add typed auth session reader/service and owner guard. DB authority uses
   disableCookieCache and disableRefresh. Invalid/revoked/expired session 401,
   unverified user 403, DB failure sanitized 503.
2. Reject supplied untrusted origins before session access; unsafe owner requests
   require an allowed Origin. Set no-store on success and all errors.
3. Add browser-safe MeResponse and protected GET /api/v1/me; do not expose token,
   session id, raw auth user, IP, user-agent, or credentials.
4. Add private workspace repository and access service with FOR SHARE ownership
   lookup, owner context first, workspace context second, one transaction, 404
   for unknown/cross-owner workspace. Validate workspace UUID at service entry
   if no current transport parser exists.
5. Add liveness independent of DB; readiness invokes DB probes in parallel with
   bounded in-flight execution and sanitized 503 response. No external providers.
6. Build modules, lifecycle and createApiApplication production/test composition.
   Preserve existing HTTP bridge, proxy/origin rules, request-log restrictions,
   root endpoint and auth configuration. Never import auth.ts from business code.
7. Production auth.ts uses AUTH_DATABASE_URL and distinct business resources;
   main.ts uses the shared factory and idempotent cleanup.
8. Test meaningful security, health timeout/error headers, lifecycle and
   ownership behavior before and after wiring.

## Task C — environment and gates (exclusive: tooling, root manifests/Turbo,

## Compose, image checker, workflow; no apps/api test files)

1. Add AUTH_DATABASE_URL validation and synthetic fixtures, examples, Turbo API
   dev pass-through and image synthetic env. Never read/edit private .env files.
2. Add isolated Compose test PostgreSQL18+vector, pinned digest from outline,
   loopback5434, synthetic credentials, tmpfs, no fixed container/volume.
3. Add check:step4 = existing check:step3 plus uncached test:integration.
4. Extend image probe for live200/ready503 network-none, retain old checks.
5. Extend verify.yml with disposable DB start/integration/always-cleanup using
   synthetic env; preserve pinned actions, required check name and prior gates.
6. Add reproducible PowerShell gate runner with native exit checks and safe
   cleanup/restoration. Tests for new orchestration helpers where meaningful.

## Root integration and review

- Expand API integration discovery; preserve all existing auth coverage and
  convert fixture to real restricted login and actual application composition.
- Add owner-session HTTP, health/readiness, real role, deterministic vector1536,
  restricted pg-boss12.35 queue tests including concurrent claim/retry/completion.
- Queue DDL/setup uses migrator; runtime migration/schema creation disabled.
- Run baseline tests, observe meaningful new tests fail before implementation,
  run focused checks after tasks, then complete repository/integration/audit/image
  gates. Tests cannot silently skip when admin env is absent.
- Independent local code review and fix verification. CodeRabbit must not receive
  unapproved source scope; report authentication/review limitations honestly.
- Document actual evidence, commands for steps9–11, and remaining hosted CI gate.

## Execution ledger

Preflight: DB handles/probe are consumed by API; AUTH_DATABASE_URL consumed by
API production and test fixtures; Compose/admin URLs consumed by integration;
API factory consumed by real HTTP integration; schema manifest consumed by probe.

Ruling: Implement in the existing feature checkout to preserve the user's active
tenant edit and IDE workflow; do not switch branches, stage, reset or commit.
Cost if wrong: changes must later be moved to a dedicated branch before publication.

Ruling: Parallel implementation uses exclusive file ownership and agreed interfaces,
with root integration and a final independent review. This follows the current
developer requirement to parallelize independent work despite the skill's generic
sequential-dispatch preference. Cost if wrong: interface reconciliation rework.

Implementation uses compact, responsibility-focused Nest modules instead of
empty module/controller/service files. API composition lives in `application.ts`,
dual-pool ownership in `resources.ts`, owner authorization in
`auth/owner-session.ts`, private workspace persistence/access in
`workspaces/workspace-access.ts`, and health in `health/health.ts`. A generated
`schema-manifest.ts` is the DB package's compiled contract.

Pre-wiring evidence: the existing API unit suite passed 22 tests and tooling
passed 33. Three new real HTTP foundation assertions failed with 404 while the
13 existing authentication integration cases passed. The fixture was then wired
to the shared production factory using actual restricted LOGIN connections.

Focused implementation evidence: the auth HTTP suite passed 21 tests; the
database-free application e2e suite passed three; the initial workspace/vector/
queue suite passed seven. Subsequent independent review introduced additional
regressions before final gate execution.

Review fixes:

- Sanitize Better Auth's internal logger: database errors can contain credential
  parameters. Only fixed diagnostic codes are emitted.
- Compile/check tenant helper definitions and execution grants, not just flags.
- Reject database TEMPORARY privileges and missing PK/unique/index invariants.
- Restrict pg-boss runtime grants to an explicit allowlist, excluding migration
  commands, version writes and queue DDL helpers. Test denied permissions only;
  no privilege-escalation payload is constructed or executed.
- Put non-cacheable headers on health handlers, including encoded route prefixes.
- Reuse one freshness constant and a readonly verified-owner response contract.
- Reject extra/missing public health fields in the real image checker.
- Preserve successful PowerShell CI exit state after deliberately testing a
  native failure, and use `pnpm.cmd` on Windows.

The image checker regression failed before its response-field fix, then all seven
checks passed. Orchestration regressions passed six lifecycle cases plus native
exit handling. The frozen installation left the lockfile unchanged. The production
audit passed the high-severity threshold with one moderate finding remaining.

No CodeRabbit review was performed: its CLI reports `not_authenticated`, and the
prior user instruction permits finishing without external review. Independent
local review is being used; private source was not uploaded.

Verification completed on 11 October 2026:

- Managed Node 24.21.0 and pnpm 10.16.1; frozen installation left the lockfile unchanged.
- Formatting, lint, type checks, application builds and package unit tests passed:
  API 50, tooling 35 and DB 4 (89 package tests).
- Browser boundary regressions 34, image-helper regressions 7, compiled runtime
  exports 4, and the actual repository boundary scan passed.
- Disposable PostgreSQL18 integration passed 64 DB cases and 30 API cases
  (21 authentication/HTTP and 9 workspace/vector/queue foundation cases).
- The separate database-free application e2e suite passed 3 tests.
- PowerShell orchestration passed 6 lifecycle regressions plus native-exit handling.
- Production audit passed the high-severity threshold. One existing moderate
  esbuild advisory remains in Better Auth's transitive tooling dependency chain.
- The actual complete PowerShell runner exited 0, including the Linux API build
  and image startup, health, compiled exports, non-root user, environment/source
  exclusion, shutdown and invalid-configuration checks.
- Verified image: `nthawi-api:step4`,
  `sha256:9736200aafde2b3f06553c0b047bc908b94cb61cfd2b64d16d7bc10fcb7f8349`.
- The runner removed its own disposable Compose project successfully; no matching
  containers remained. It restored temporary process configuration.
- Final independent local review found no remaining blocking findings in scope.

Additional final review fixes reject residual migration/queue column grants and
clear them during provisioning before applying explicit role grants. Focused and
complete real-login integration suites passed after these changes.

Status: implementation and complete local verification passed. A new committed
and published Step 4 revision still needs a successful hosted GitHub Actions run
before Step 5. No commit, push, deployment, private environment edit, or external
source upload was performed.
