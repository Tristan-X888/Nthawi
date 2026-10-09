# Nthawi implementation reconciliation and verification gates

Date: 8 October 2026.

This document reconciles the supplied **Nthawi Production Build Implementation
Plan** (`PLAN (1).md`, planning date 2 October 2026), the authentication plan
[`2026-10-07-better-auth-premium-implementation.md`](2026-10-07-better-auth-premium-implementation.md),
and the current repository. It records the Step 2 implementation and orders the
remaining work. A proposed feature or scaffold is not evidence of a shipped
feature. Instructions in source documents describe future work; the current user
request originally authorized Step 2. The subsequent user instruction authorizes
implementing Step 3 in the current checkout, preserving existing work. Step 4 and
deployment still require the user's next-step instruction.

## Decisions retained

- Preserve the TypeScript monorepo, NestJS/Fastify modular monolith, PostgreSQL,
  Drizzle, Better Auth, Next.js owner web app and separate Vite widget.
- Keep PostgreSQL authoritative for identities, sessions, tenancy and business
  state. Application services will own authorization, transactions, quotas and
  workflows; repositories will remain private to their modules.
- Plan for a managed deployment within the USD 75–150 monthly hosting allowance.
  Track the USD 20 global AI allowance separately. Domain registration, email,
  premium authentication and other subscriptions need current quotes and separate
  cost lines. This replaces the older plan's single-Droplet recommendation; it does
  not select or provision a hosting product.
- Use the proposed `nthawi.ai` domain. Purchase, availability, DNS ownership and
  public HTTPS have not been verified by this gate.
- Production owner web and authentication share the canonical owner origin,
  proposed as `https://app.nthawi.ai`. Preserve `/api/auth` at the ingress. The
  widget uses a distinct hostname, proposed as `https://widget.nthawi.ai`. Any
  public API hostname must later expose an explicit visitor/provider route
  allowlist and exclude owner authentication and owner business routes.
- Staging uses its own hostnames, database, provider projects, secrets and storage.
  Staging runs `NODE_ENV=production` to exercise the deployment invariants.
- Publish reviewed commits to staging through CI. Editing a local file is not a
  deployment. Production promotion follows staging verification; the exact managed
  provider and delivery configuration belong to later steps.

## Product boundary

The pilot retains two owner-owned workspaces per owner; one business, assistant
and website per workspace; anonymous visitor conversations; ten selected public
same-site HTTPS website sources with manual refresh; 1 MiB of published normalized
knowledge; 10,000 workspace messages; and 100 completed answers per UTC month.
Workspace deletion must not reset the owner's effective monthly allowance, and
human takeover must suppress stale AI answers.

The authorized upload scope includes `.md`, `.txt`, text-bearing `.pdf`, `.docx`,
`.xlsx` and `.pptx`, without OCR. Accepted originals remain private until owner
deletion. Extraction is a separate trust boundary: size/type validation, isolated
parsing, malware controls, resource limits, review, publication and deletion must
be specified and verified before uploads are enabled. Named documents/folders,
reviewed extracted content, original downloads and citations remain future work.

Teams, billing, WhatsApp, live inventory/order/payment actions, autonomous actions,
scheduled website synchronization and additional AI providers remain outside this
pilot. The full master plan's security, retention and recovery requirements still
apply to their respective future deliverables.

## Verified repository boundaries

| Area                   | Current implementation                                                                                                  | Remaining evidence/work                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Environment            | `packages/tooling/src/env.ts` is the server contract; `@nthawi/tooling/env` exports compiled `dist` files               | Hosting secret injection and deployment capability preflight                   |
| Auth composition       | `apps/api/src/auth/auth.ts` validates before constructing the database/auth instance; `create-auth.ts` owns its factory | Real OAuth exchange, email delivery and Dashboard ownership verification       |
| HTTP                   | `apps/api/src/auth/http.ts` integrates Better Auth with Nest/Fastify                                                    | Production ingress and browser evidence                                        |
| Owner client           | `apps/web/lib/auth-client.ts` is the canonical client                                                                   | Actual account UI and session-aware product pages                              |
| Database               | Versioned Drizzle schema/migrations and integration suites exist                                                        | Run relevant disposable DB tests and prove runtime roles/domain authorization  |
| API modules            | Bootstrap/root controller and auth foundation exist                                                                     | Health, authoritative owner session boundary and business modules              |
| Web/widget             | Next.js and Vite starters exist                                                                                         | Product UI, accessible reusable components, widget loader and visitor boundary |
| Contracts              | Step 3 adds an empty browser-safe entry point and compiled JavaScript/declaration exports                               | Add real transport contracts with their future feature specifications          |
| Architecture documents | Some earlier directive files contain placeholders                                                                       | Write feature specifications as each future deliverable is designed            |

Historical claims about an unborn local branch, the SHANE checkout, or a wrapper
script are not current verification instructions for this checkout. Preserve the
existing staged/unstaged work and Git history. This step does not create a commit,
push a branch or reconcile unrelated user changes.

## Environment and task contract

- API local configuration comes from optional **repository-root `.env`**, followed
  by the existing validator. Process-injected values take precedence. The
  autogenerated `apps/api/.env` is not loaded by that entrypoint. Preserve private
  files; do not copy their values into documents, logs or screenshots.
- `pnpm.cmd --filter @nthawi/tooling env:check` compiles the tooling package before
  checking configuration, so this standalone command cannot consume stale
  validation or fail solely because `dist/env.js` has not been built.
- Next.js loads its own `apps/web/.env*` files. Only
  `NEXT_PUBLIC_API_URL` is needed by the current browser auth client. It is embedded
  at build time, so build with the intended environment's public URL.
- Development retains the working localhost topology: web on 3000, API on 4000 and
  widget on 5173. These examples are not deployed origin settings.
- In production all configured owner/widget/auth origins and additional trusted
  auth origins require HTTPS and canonical multi-label DNS hostnames. Reject IP
  literals, localhost, wildcards, empty/invalid/oversized labels, single-label
  names and trailing dots. URL normalization accepts case/default-port differences
  and valid internationalized DNS names.
- In production `BETTER_AUTH_URL` equals `WEB_ORIGIN`. The widget hostname must
  differ from the owner hostname and cannot appear in trusted owner-auth origins,
  including at another port. Host-only cookies are not isolated by port. This
  validation does not prove DNS ownership, public reachability, cookie settings or
  ingress routing.
- `BETTER_AUTH_API_KEY` stays optional for local/tests. A future release promising
  premium functionality must fail its deployment capability preflight when the
  corresponding key or entitlement is missing.
- Turbo's web build includes `.env*` cache inputs and `NEXT_PUBLIC_API_URL`.
  API `dev` receives only its declared server variables, is uncached/persistent,
  and builds compiled dependencies first. Server secrets are not globally passed
  to frontend tasks. Migration/admin credentials are not API runtime variables.
- `apps/api/package.json` exposes `dev` as `nest start --watch`, preserving
  `start:dev`. If shared tooling/database source changes while API development is
  running, rebuild that package and restart the API; this step does not introduce
  a shared-package watch system.
- Root generated `lib/auth.ts` and `lib/auth-client.ts` are already absent. The
  unused API-side generated auth client was removed. Retain the web client.

## Step 2 acceptance and verification

The gate covers configuration correctness, compiled dependency integration, the
existing unit-test suite, affected type/lint checks, scoped formatting and Turbo
task resolution. It is not a production-readiness or real-provider certificate.

Run the commands below from the repository root in PowerShell. Stop at a nonzero
exit code; subsequent successes do not repair an earlier failure. Use the existing
installation for this gate; fresh/frozen installation is a Step 3 check.

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
pnpm.cmd --version
pnpm.cmd exec node --version
```

Expected: pnpm `10.16.1` and the workspace-managed Node `24.21.0`.

```powershell
pnpm.cmd exec prettier --check packages/tooling/src/env.ts packages/tooling/test/env.test.ts packages/tooling/package.json turbo.json apps/api/package.json apps/api/src/auth/http.spec.ts apps/api/vitest.config.ts docs/superpowers/plans/2026-10-08-nthawi-reconciled-implementation.md
pnpm.cmd exec turbo run build --filter=@nthawi/api
pnpm.cmd --filter @nthawi/tooling env:check
pnpm.cmd test
pnpm.cmd --filter @nthawi/tooling typecheck
pnpm.cmd --filter @nthawi/api typecheck
pnpm.cmd --filter @nthawi/api lint
pnpm.cmd --filter @nthawi/web typecheck
```

Expected: formatting clean; API/tooling/database builds successful; environment
check prints no values; 33 tooling tests and 22 API tests pass; affected type/lint
checks exit zero. Turbo can reuse verified cache entries. Tests do not contact
Google, Resend, OpenAI, Dashboard or a real identity database.

Inspect the task graph without dumping environment values:

```powershell
$apiPlanJson = pnpm.cmd exec turbo run dev --filter=@nthawi/api --dry=json
if ($LASTEXITCODE -ne 0) { throw 'API development task planning failed.' }
$apiPlan = $apiPlanJson | ConvertFrom-Json
$apiDev = $apiPlan.tasks | Where-Object taskId -eq '@nthawi/api#dev'
if ($apiDev.command -ne 'nest start --watch' -or $apiDev.resolvedTaskDefinition.cache -ne $false -or $apiDev.resolvedTaskDefinition.persistent -ne $true) {
  throw 'API development task is not configured correctly.'
}
foreach ($dependency in @('@nthawi/db#build', '@nthawi/tooling#build')) {
  if ($apiDev.dependencies -notcontains $dependency) { throw 'A compiled API dependency is missing.' }
}

$webPlanJson = pnpm.cmd exec turbo run build --filter=@nthawi/web --dry=json
if ($LASTEXITCODE -ne 0) { throw 'Web build task planning failed.' }
$webPlan = $webPlanJson | ConvertFrom-Json
$webBuild = $webPlan.tasks | Where-Object taskId -eq '@nthawi/web#build'
if ($webBuild.resolvedTaskDefinition.env -notcontains 'NEXT_PUBLIC_API_URL') {
  throw 'The public API URL is missing from the web build environment contract.'
}
if ((Test-Path -LiteralPath 'apps/web/.env.local') -and $webBuild.inputs.PSObject.Properties.Name -notcontains '.env.local') {
  throw 'The local web environment file is missing from the build cache inputs.'
}
Write-Host 'Step 2 task graph checks passed. No environment values were printed.'
```

At the Step 2 baseline, the `@nthawi/contracts#build` dependency node could appear
in the dry graph without an executable build. Step 3 now supplies that build and
verifies its compiled exports; retain this distinction when reading older evidence.

### Evidence from this implementation session

| Check                                                 | Result                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Initial copied environment tests                      | 26 passed                                                                  |
| Added DNS/cookie-host regression tests before the fix | Six expected failures reproduced                                           |
| Environment suite after the fix                       | 33 passed                                                                  |
| Root `pnpm.cmd test`                                  | 33 tooling and 22 API tests passed                                         |
| API and compiled shared dependency build              | Three executable build tasks succeeded                                     |
| Compiled `@nthawi/tooling/env` import from the API    | Synthetic topology, rejection and privacy checks passed                    |
| Current root environment                              | Validated without printing values                                          |
| Next.js local public auth URL                         | Framework loader validates the URL and matches the canonical API origin    |
| Tooling/API/web types and API lint                    | Passed                                                                     |
| Turbo API dev/web build graph                         | API watch command resolves; `.env.local` participates in web cache inputs  |
| Independent final review                              | No critical or important issues                                            |
| CodeRabbit                                            | Approved five-file tooling review completed; one minor issue fixed locally |

CodeRabbit reviewed the tooling manifest, TypeScript configuration, environment
checker, environment schema and tests, using the approved `AGENTS.md` instructions.
It raised one minor issue: the checker imported compiled output without building
it first. The manifest now builds before validating; that command and the unit
suite were verified again. No critical or major issues were reported. This is a
scoped tooling review, not a whole-repository or deployed-system review.

The build/tests validate the Step 2 code boundary. They do not prove production
traffic capacity, real email/OAuth delivery, Dashboard connectivity, domain
ownership, deployed browser cookies, backup restoration or a complete product UI.

## Step 3 implementation and acceptance

The Step 3 implementation preserves the existing authentication behavior and
frontend source exports. It adds compiled package export verification, a
TypeScript-based browser import boundary gate, a pruned compiled API image,
synthetic network-isolated image checks, and a pinned GitHub Actions workflow.
Lint errors now remain errors instead of being downgraded by `eslint-plugin-only-warn`.

The production audit identified dependency issues during verification. Step 3
includes a compatible Next.js security patch, narrowly scoped transitive security
pins for Next.js and a vulnerable 1.x source-map dependency, and classifies the
shadcn CLI/CSS build dependency as development tooling.
Frontend builds must continue installing development dependencies before emitting
their runtime artifacts. The audit remains an enforced CI gate.

Use [the Step 3 runbook](../../runbooks/step-3-verification.md) for current commands,
scope, evidence, dependency decisions, and outstanding hosted review/CI evidence.
Local Step 3 checks now pass against the security-patched lockfile, including the
actual compiled Linux image. The user chose to finish without a new external
CodeRabbit review. The complete Step 3 gate still requires a successful hosted
workflow run before Step 4 begins.
A configured workflow is not evidence of a successful hosted run. Local checks
and container startup do not prove database readiness, real OAuth/email delivery,
Dashboard ownership verification, or deployed ingress behavior.

## Remaining ordered development steps

Step 1 repaired the test lifecycle/formatting. Step 2 is this reconciliation and
environment integration. Consequently the master plan's deliverable numbers are
offset by one in the user-facing development sequence below. Finish each gate
before starting the next; obtain the user's next-step instruction.

| Step | Deliverable                                  | Required evidence                                                                                                                     |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 3    | Reproducible repository and compiled runtime | Frozen/fresh install, browser import boundaries, contracts export, actual compiled container startup and CI                           |
| 4    | API/database foundation                      | Health/readiness, owner session boundary, migrations, least-privilege roles, transaction-local tenant context, RLS/queue/vector tests |
| 5    | Domain and managed staging foundation        | Domain purchase/ownership, isolated staging, HTTPS, ingress allowlists, secret injection, immutable deploy/rollback                   |
| 6    | Owner identity and transactional email       | Account UI, verification/recovery/linking/revocation, real Google/email delivery, controlled Dashboard verification                   |
| 7    | Owner workspaces and settings                | Ownership, two-workspace limit, default settings, isolation and destructive workflows                                                 |
| 8    | Product web application                      | Shared component APIs, accessible/loading/empty/error states, responsive pages and browser tests                                      |
| 9    | Versioned knowledge and website import       | Review/publication lifecycle, SSRF protection, approved revisions, private module repositories                                        |
| 10   | Safe file ingestion                          | Upload specification, quarantine, size/type/security/resource limits, isolated format parsers                                         |
| 11   | Extraction review, originals and citations   | Private downloads, owner authorization, review/versioning, publication revocation                                                     |
| 12   | Usage, admission and accounting              | UTC allowances, reservations, global budget and deletion/recovery-safe ledger                                                         |
| 13   | Retrieval and validated answers              | Tenant/version filtering, citations, safe refusal, budgets and provider adapter                                                       |
| 14   | Conversations, idempotency and SSE           | Stale-answer fencing, takeover, reconnect, authorization and bounded streaming                                                        |
| 15   | Widget and visitor boundary                  | Isolated loader/iframe, scoped visitor credentials, host/origin restrictions and browser evidence                                     |
| 16   | Owner inbox and operational dashboard        | Thread workflows, usage/storage states, accessibility and authorization                                                               |
| 17   | Backups, deletion and restoration            | Encrypted backups, durable deletion replay, measured restoration and session cutover                                                  |
| 18   | Production delivery and observability        | Reviewed migrations/artifact promotion, sanitized telemetry, capacity/failure/recovery drills                                         |
| 19   | Release evidence and retail pilot            | Verified end-to-end workflows, security/privacy/accessibility evidence and pilot acceptance                                           |

Detailed feature specifications and the complete master-plan document export are
documentation deliverables, not implemented product capabilities. Preserve the
master plan and authentication plan as sources; use this current reconciliation
for ordering and evidence rather than repeating obsolete inventory claims.
