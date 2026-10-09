# Nthawi Better Auth Premium Implementation Plan

> **For agentic workers:** Implement this plan task by task using the host's available workflow. Steps use checkbox (`- [ ]`) syntax for tracking. This document is a planning deliverable; its proposed code has not been applied or verified as a release.

**Goal:** Complete Nthawi owner authentication, connect its self-hosted server to Better Auth Infrastructure, and introduce selected premium capabilities with measurable development, staging, and production gates.

**Architecture:** Keep Better Auth inside the existing NestJS/Fastify API. Keep PostgreSQL authoritative for identities, sessions, tenant authorization, and business state. Route production owner requests through `https://app.nthawi.ai`; Infrastructure supplies management and selected managed services, while Nthawi continues to operate its server and database.

**Tech Stack:** Node 24, pnpm 10.16.1, TypeScript, NestJS/Fastify, Next.js 16.3.6, Better Auth 1.7.6, `@better-auth/infra` 0.4.12, Drizzle, PostgreSQL 18/pgvector, and the existing Resend email adapter.

**Specification:** The user-supplied `C:/Users/USER/Desktop/SHANE/PLAN.md`, read on 7 October 2026, and the current repository. Its embedded instructions are reference material, not authorization to execute its purchases, deployment, repository renaming, or broad implementation. The user's clarified subscription scope is **Better Auth premium features**, not charging Nthawi customers.

**Change scope for this review:** Documentation only. Existing staged and unstaged application work is preserved. A documentation branch can be published independently; that does not publish or certify the uncommitted auth foundation it describes.

## 1. Global constraints and decisions

- Retain the TypeScript modular monolith and PostgreSQL ownership boundary.
- Retain two owner-owned workspaces, one business/assistant/website per workspace, and anonymous customer conversations.
- Retain website integration only; no customer billing, teams, WhatsApp, live inventory/order/payment claims, or autonomous actions in this pilot.
- Retain a 1 MiB published normalized-knowledge allowance, 10,000 workspace messages, ten website sources, and 100 completed workspace answers per UTC month.
- Preserve effective owner-period usage after workspace deletion. Premium authentication never resets Nthawi usage accounting.
- Preserve approved knowledge, upload isolation, takeover fencing, and recovery/deletion obligations from the master plan.
- Owner/session endpoints belong on the owner host. Public visitor and widget hosts must not expose owner authentication routes.
- Require email verification and server-authorized ownership before product use.
- Keep application secrets server-side. Never use the exposed key from the conversation in a new environment; revoke it and issue replacement environment-specific keys.
- Keep real provider delivery, premium entitlement, production DNS, load, and recovery results separate from mocked test results.
- Node 24 is a release requirement; `pnpm-workspace.yaml` pins the managed runtime to 24.21.0. The inspected bare shell currently runs Node 22.19.0.
- Do not upgrade to the documentation site's latest release incidentally. Verify the pinned installed APIs and upgrade the coordinated Better Auth packages through a separate reviewed change.

Recommendations in this plan are labeled as such. Paid purchases and production deployment need their own concrete, reviewed authorization. Configuring or documenting them here does not perform them.

## 2. Executive assessment: what already exists

The master plan's older starting inventory describes a different directory and an unborn branch. The current checkout is `C:/Users/USER/Desktop/Nthawi/Nthawi`; it has the existing GitHub history on `master` and substantial uncommitted work. Use the inventory below for this authentication implementation.

| Area                 | Inspected implementation                                                                                                      | Remaining work                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Server dependencies  | `apps/api/package.json` pins Better Auth/core/Drizzle adapter 1.7.6 and Infrastructure 0.4.12                                 | Frozen clean installation and coordinated upgrade checks                                       |
| Browser dependencies | `apps/web/package.json` pins Better Auth 1.7.6 and Infrastructure 0.4.12                                                      | Build with the intended public origin and secret-boundary checks                               |
| Server plugin        | `apps/api/src/auth/create-auth.ts` conditionally mounts `dash({ apiKey, activityTracking: { enabled: false } })`              | Rotated project key, dashboard connection, access review, real smoke tests                     |
| Client plugin        | `apps/web/lib/auth-client.ts` mounts `emailOTPClient()` and `dashClient()`                                                    | Real UI and premium behavior verification                                                      |
| Server entrypoint    | `apps/api/src/auth/auth.ts` loads optional root `.env`, validates settings, constructs one database pool/auth instance        | Deployment injection and production-only validation rules                                      |
| HTTP integration     | `apps/api/src/auth/http.ts` mounts `/api/auth/*`, preserves raw bodies and separate cookies, enforces origin/proxy boundaries | Same-origin production ingress, route exposure tests, signed Infrastructure request tests      |
| Identity schema      | `packages/db/src/schema/auth.ts`; migration `0002_better_auth.sql`                                                            | Runtime role verification and future plugin-schema migrations                                  |
| Auth flows           | Password signup/login, hashed OTP, Google, password recovery, session freshness/revocation, explicit account linking          | Browser screens, real mail/OAuth, protected product routes                                     |
| Email                | Fixed Resend endpoint, awaited delivery, ten-second timeout, sanitized failure                                                | Verified sender, delivery events/retry design, provider selection for managed email            |
| RLS                  | Transaction-local context; reviewed tenant SQL and tests                                                                      | Identity-to-owner authorization, workspace creation/deletion path, business repositories       |
| Account deletion     | Core `deleteUser.enabled: true` and a fresh-session policy                                                                    | Durable off-server deletion intent, workspace/storage cleanup, job fencing, restoration replay |
| Health               | Root greeting controller; `/api/auth/ok` smoke check                                                                          | Independent liveness and schema-aware readiness                                                |
| Application UI       | Auth client exists; web remains a starter foundation                                                                          | Signup, verification, recovery, onboarding, account settings, owner inbox                      |
| Evidence             | Auth, bridge, email, env and RLS tests exist                                                                                  | Current Node 24 results, database results, external-provider evidence, release evidence        |

**Do not reinstall the plugin or replace the existing auth server to satisfy the onboarding screen.** The code installation/mounting steps are already present. Activating a valid project key and restarting the server is a configuration operation. Infrastructure still requires Nthawi's application services and PostgreSQL; buying Pro does not host those services. [Infrastructure overview](https://better-auth.com/docs/infrastructure/introduction)

### Review focus

1. A paid key activates control routes: anonymous users, ordinary owner sessions, and arbitrary Bearer strings must not access dashboard administration.
2. A dashboard action may bypass the application's deletion orchestration: user deletion must not leave original files, retained knowledge, or recoverable deleted data behind.
3. Same-origin production cookies must reach both browser API calls and server-rendered page checks; the local two-port arrangement does not prove this.
4. Turning activity tracking or security features on can change generated identity schema and expose additional personal metadata.
5. Provider outages, wrong entitlement, quota exhaustion, proxy IP mistakes, and mobile-network changes must have tested outcomes without disabling origin, session, or tenant checks.

Each condition is assigned to tasks below and the final verification matrix.

## 3. Subscription scope, price, and premium-feature selection

Better Auth's open-source authentication library and its Infrastructure subscription are separate. Nthawi is subscribing as the operator of its authentication service. Nthawi's owners do not automatically receive paid product plans, and no Stripe or subscription table is needed for the stated request.

Public Infrastructure pricing inspected on **7 October 2026**:

| Plan/item                         | Published allowance or charge                                                                                 | Planning consequence                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Starter                           | $0/month; one dashboard seat; 10,000 audit logs/month with one-day retention; 1,000 security detections/month | Suitable for evaluation; verify actual account feature entitlement      |
| Pro                               | $20/month; unlimited dashboard seats                                                                          | Recommended candidate for the requested premium production setup        |
| Pro audit logs                    | 20,000/month; then $0.0001/event; seven-day retention                                                         | Monitor volume; seven days is not a long-term evidence archive          |
| Pro security detections           | 10,000/month; then $0.001/event                                                                               | Bound abuse-driven spend and inspect account controls                   |
| Transactional email/SMS           | $0.001/email; $0.09/SMS                                                                                       | Metered separately; SMS is outside this pilot                           |
| SSO/directory sync                | One connection of each; then $50/month per additional connection                                              | Availability does not authorize adding enterprise/team product behavior |
| Dashboard custom domain/log drain | Each listed as a $25/month Pro add-on                                                                         | Defer unless a concrete operational requirement warrants the expense    |
| Enterprise                        | Custom contract                                                                                               | Obtain actual retention, SLA, support and processing terms if needed    |

These are public list prices, not an account quote or a spending approval. Verify tax, currency conversion, account entitlements, overage behavior, and cancellation terms in the actual checkout. The published getting-started and pricing pages differ in their descriptions of Sentinel eligibility; confirm the account's entitlement before enabling it. [Pricing](https://better-auth.com/pricing), [getting started](https://better-auth.com/docs/infrastructure/getting-started)

### Recommended initial feature set

| Capability                        | Initial recommendation                                                     | Required implementation/evidence                                                      |
| --------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Dashboard user/session management | Enable after connection/access tests                                       | Least-privilege operator access; safe session revocation; deletion policy             |
| Audit logs                        | Enable deliberately                                                        | Data inventory, quota monitoring, retention and export policy                         |
| Activity/online-user analytics    | Start with existing `enabled: false`; enable through a migration if needed | `lastActiveAt` schema, grants, accuracy/write-load tests                              |
| Sentinel abuse detection          | Evaluate in synthetic staging, then enable reviewed controls               | Account entitlement; installed types; false-positive/outage policy; trusted client IP |
| Managed email/templates           | Choose as a separate change, or retain Resend                              | OTP/reset callbacks wired to exactly one sender; delivery failure tests               |
| SSO/SAML/SCIM                     | Defer for this owner-only pilot                                            | New product/access model, provider verification, separate schema and threat review    |
| SMS                               | Defer                                                                      | New consent, phone identity, delivery and cost requirements                           |
| Custom dashboard domain           | Defer                                                                      | DNS/TLS and cost decision; distinct from `app.nthawi.ai`                              |
| Log drain                         | Optional if seven-day retention is inadequate                              | Redaction, destination authentication, retries and bounded retention                  |

Paying for a feature does not configure it. Mounting `dash()` does not silently replace the Resend callbacks, mount Sentinel, provision enterprise organizations, or implement Nthawi's workspace permissions.

### Budget update

The master plan's hosting and OpenAI envelopes predate this premium request. Record Infrastructure Pro's **$20/month plus metered usage** as a new separate operating line. Keep OpenAI's $20 global allocation separate. If Resend remains the sender, retain its independent account expense; if managed email replaces it, revise that line after migration and delivery verification. The master plan's hosting prices are historical estimates and were not revalidated in this review.

## 4. File responsibilities and implementation boundaries

Observed paths are existing files; proposed paths below are future work, not changes made by this review.

| Path                                  | Status   | Responsibility                                                    |
| ------------------------------------- | -------- | ----------------------------------------------------------------- |
| `apps/api/src/auth/create-auth.ts`    | Observed | Single canonical Better Auth options/plugins factory              |
| `apps/api/src/auth/auth.ts`           | Observed | Validated environment and one production database/auth instance   |
| `apps/api/src/auth/http.ts`           | Observed | Fastify-to-Web Request bridge; cookies, origin, bounded raw body  |
| `apps/api/src/auth/http.constants.ts` | Observed | Internal resolved-client-IP header name                           |
| `apps/api/src/auth/email.ts`          | Observed | Delivery adapter and injectable `SendAuthEmail` port              |
| `apps/web/lib/auth-client.ts`         | Observed | Browser-safe auth methods/plugin registration                     |
| `packages/tooling/src/env.ts`         | Observed | Authoritative server configuration contract                       |
| `packages/db/src/schema/auth.ts`      | Observed | Generated identity schema                                         |
| `packages/db/src/tenant.ts`           | Observed | `withTenantTransaction<T>(db, context, callback): Promise<T>`     |
| `packages/db/drizzle/`                | Observed | Append-only reviewed SQL migrations and metadata                  |
| `apps/api/src/auth/owner-identity.ts` | Proposed | Authoritative session-to-owner DTO; no business repository access |
| `apps/api/src/workspaces/`            | Proposed | Ownership checks and transactional workspace lifecycle            |
| `apps/api/src/deletion/`              | Proposed | Durable deletion journal, fencing and cleanup orchestration       |
| `apps/api/src/health/`                | Proposed | Independent live/readiness HTTP routes                            |
| `apps/web/features/auth/`             | Proposed | Forms, auth states, safe callback policy and account settings     |
| `apps/web/app/(auth)/`                | Proposed | Public signup/sign-in/verification/recovery pages                 |
| `apps/web/app/(owner)/`               | Proposed | Protected owner pages; leaf/data checks remain authoritative      |
| `apps/web/lib/owner-session.ts`       | Proposed | Server-only no-store session read with forwarded cookie           |
| `infra/caddy/Caddyfile`               | Proposed | Canonical owner routing, visitor allowlist and no-cache policy    |
| `tests/e2e/auth.spec.ts`              | Proposed | Browser evidence for flows and production-shaped cookies          |
| `docs/evidence/auth/`                 | Proposed | Redacted check outputs, versions, delivery and release evidence   |

Do not construct another Better Auth instance inside Next.js. In this architecture the API owns auth; Next.js calls it. Do not add a Next catch-all auth handler copied from the standalone Better Auth example while retaining the Fastify handler.

## 5. Task 1: reproducible development prerequisites

**Files:** Inspect `.node-version`, root/package manifests, `pnpm-lock.yaml`, and existing runbooks. Modify tooling only if a reproduced failure identifies a necessary change.

**Interfaces:** Consumes the pinned package manifest/lockfile. Produces a documented clean Node 24 install and built workspace dependencies.

- [ ] Select Node 24 using the installed version manager or the official Node installer. pnpm is also configured to provision/use Node 24.21.0; it needs access to its user-local runtime cache. Verify both the bare shell runtime and `pnpm.cmd exec node --version` for commands actually used, and verify pnpm is `10.16.1`.
- [ ] Preserve `.env`, database volumes, and current staged/unstaged work. Review `git status --short` before any implementation; never run `git clean`, `reset --hard`, force push, or blanket staging for this task.
- [ ] Run a frozen install. If it fails, fix the specific manifest/lockfile or package accessibility problem; do not broadly update dependencies.
- [ ] Build exported workspace libraries before loading the API configuration or CLI.
- [ ] Verify framework/adapter/infra versions and actual peer dependencies from the installed package.
- [ ] Run focused baseline checks on Node 24 and record their actual results.

```powershell
node --version
pnpm.cmd --version
pnpm.cmd exec node --version
pnpm.cmd install --frozen-lockfile
pnpm.cmd --filter @nthawi/tooling build
pnpm.cmd --filter @nthawi/db build
pnpm.cmd --filter @nthawi/api typecheck
pnpm.cmd --filter @nthawi/web typecheck
pnpm.cmd --filter @nthawi/api test
pnpm.cmd --filter @nthawi/tooling test
```

**Expected:** No engine mismatch, no unresolved workspace `dist` imports, matching pinned Better Auth packages, passing relevant checks. A successful check on Node 22 is preliminary evidence and cannot satisfy this requirement.

`@nthawi/contracts` currently exports `./src/index.ts` and has no build script. Do not run an invented `contracts build` command. Before production consumers import it, add a tested compiled-output/export contract or keep its browser-safe contracts within the reviewed compiler/bundler boundary. The API must run compiled JavaScript without an implicit TypeScript source loader.

The generic `npm i @better-auth/infra` onboarding command is inappropriate for this existing pnpm workspace. The dependency is already present in both packages. Only for a future clean reconstruction or explicitly approved dependency change:

```powershell
pnpm.cmd --filter @nthawi/api add --save-exact @better-auth/infra@0.4.12
pnpm.cmd --filter @nthawi/web add --save-exact @better-auth/infra@0.4.12
```

Commit only a necessary reproduced tooling fix and its lockfile/tests. A baseline investigation does not justify committing unrelated pending work.

## 6. Task 2: create the premium projects and rotate exposed credentials

**Files:** Private local `.env`, deployment secret stores; safe templates only when the contract changes.

**Interfaces:** Produces server-only `BETTER_AUTH_API_KEY` for each environment; consumes the existing `ServerEnv.BETTER_AUTH_API_KEY?: string`.

- [ ] Sign into [Better Auth Dashboard](https://dash.better-auth.com) using the account that will operate Nthawi. Verify recovery and available account security controls.
- [ ] Create separately named development, staging and production projects. If the account does not permit enough projects, resolve that constraint before connecting synthetic and real identity stores to a shared project.
- [ ] Inspect the current paid plan and actual entitlement; choose Pro if its confirmed features meet the requirement. Complete the purchase only after explicit spending authorization.
- [ ] Revoke the API key pasted in the conversation. Generate fresh project keys; never copy the exposed value into this guide, Git, an issue, a screenshot, or a test fixture.
- [ ] Put each replacement key in that environment's API secret store. Only the backend receives it.
- [ ] Keep a distinct, high-entropy `BETTER_AUTH_SECRET` per environment. This application cryptographic secret is different from the Infrastructure project key.
- [ ] Give dashboard operators the minimum available roles. Document who may revoke sessions, change identities, inspect logs, or trigger destructive operations.
- [ ] Record plan, project identity, owner, key rotation date and allowed operator roles without recording key values.

Generate a new application secret locally without sending it elsewhere:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Paste the result directly into the private secret store and avoid retained terminal recordings. Rotating an Infrastructure project key and rotating the application's encryption/signing secret are different procedures. For the latter, inspect the pinned release's supported versioned-secret behavior and encrypted data before changing it. [Secret rotation](https://better-auth.com/docs/reference/security)

**Acceptance:** Separate project identities and secrets, revoked exposed key, verified plan entitlement, no browser/commit secret disclosure. Premium purchase or dashboard login has not been performed by this planning task.

## 7. Task 3: environment contract and production fail-closed validation

**Files:** Modify `packages/tooling/src/env.ts`; test `packages/tooling/test/env.test.ts`; update safe environment templates.

**Interfaces:** Preserve `loadServerEnv(environment?: NodeJS.ProcessEnv): ServerEnv`. Add production checks to the existing schema without a second environment loader.

### Current development values

Copy safe templates only when the target private file does not already exist. Existing `.env` files may contain working credentials; do not overwrite them.

```dotenv
# Root .env: server-only; never committed
NODE_ENV=development
WEB_ORIGIN=http://localhost:3000
WIDGET_ORIGIN=http://localhost:5173
API_PORT=4000
API_TRUST_PROXY=
POSTGRES_HOST_PORT=5433
DATABASE_URL=postgresql://nthawi_runtime:<encoded-runtime-password>@localhost:5433/nthawi
DATABASE_MIGRATION_URL=postgresql://nthawi_dev:<local-admin-password>@localhost:5433/nthawi
BETTER_AUTH_URL=http://localhost:4000
BETTER_AUTH_SECRET=<new-development-application-secret>
BETTER_AUTH_API_KEY=<new-development-project-key>
GOOGLE_CLIENT_ID=<development-web-client-id>
GOOGLE_CLIENT_SECRET=<development-web-client-secret>
RESEND_API_KEY=<development-sending-key>
EMAIL_FROM=Nthawi <no-reply@verified-development-sender.example>
OPENAI_API_KEY=<development-project-key>
```

```dotenv
# apps/web/.env.local: the only current browser auth configuration
NEXT_PUBLIC_API_URL=http://localhost:4000
```

The current server schema requires Google, Resend, and OpenAI variables even when only auth is being exercised. No OpenAI request is made by auth, but absent configuration still fails startup. For real development supply valid intended credentials; for tests use process-local synthetic values and injected/mocked providers. If an auth-only mode is desirable, design an explicit capability flag and conditional adapter construction as a separate change. Do not silently disable validation or use test placeholders in deployed services.

### Production target

```dotenv
NODE_ENV=production
WEB_ORIGIN=https://app.nthawi.ai
WIDGET_ORIGIN=https://widget.nthawi.ai
BETTER_AUTH_URL=https://app.nthawi.ai
NEXT_PUBLIC_API_URL=https://app.nthawi.ai
API_PORT=4000
# Set to the exact Caddy peer address or a dedicated validated proxy range.
API_TRUST_PROXY=<reviewed-proxy-IP-or-CIDR>
EMAIL_FROM=Nthawi <no-reply@notify.nthawi.ai>
```

Supply server variables to the API at runtime. Supply `NEXT_PUBLIC_API_URL` to the web **build**, because Next.js embeds public values in the client output. The API root `.env` is not Next.js's app-local `.env.local`, and Turbo strict-mode environment handling can hide injected variables unless the affected tasks declare them. Add the public URL to the web build task's `env` inputs and the reviewed server variables to API startup `passThroughEnv` when starting through Turbo; keep auth secrets out of frontend build inputs. Check the bundled URL after building each environment. Installed Next.js guides: `apps/web/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` and the API reference for `headers()`.

### Proposed validation addition

The current origin schema accepts `http:` in production. Extend the existing `z.object(...)` rather than recreating its fields. The following chained refinement is proposed code:

```ts
// packages/tooling/src/env.ts, after the existing z.object({...})
.superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return

  const fields = ["WEB_ORIGIN", "WIDGET_ORIGIN", "BETTER_AUTH_URL"] as const
  for (const field of fields) {
    const url = new URL(env[field])
    if (url.protocol !== "https:" ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: "Production requires a public HTTPS origin",
      })
    }
  }

  // Recommended architecture invariant: owner auth is same-origin in deployment.
  if (env.BETTER_AUTH_URL !== env.WEB_ORIGIN) {
    ctx.addIssue({
      code: "custom",
      path: ["BETTER_AUTH_URL"],
      message: "Production auth must use the canonical owner origin",
    })
  }
})
```

This is structural validation, not a DNS/domain ownership check. Staging also runs production mode with its own HTTPS hosts. Keep `BETTER_AUTH_API_KEY` optional for tests/local recovery; a deployment-specific preflight must require its presence when the release promises premium features. Missing premium configuration must be visible to readiness/deployment checks instead of silently certifying a premium-enabled release.

- [ ] Add tests for HTTP/local production origins, canonical-origin mismatch, valid HTTPS staging, blank optional dashboard key, and secret-free error messages.
- [ ] Run the tests to establish the relevant failing behavior.
- [ ] Add the refinement and deployment capability preflight; retain existing coercion and sanitized errors.
- [ ] Run `pnpm.cmd --filter @nthawi/tooling test`, then API/web typechecks.
- [ ] Commit the schema, tests and safe templates together.

**Expected:** Invalid production topology fails before opening a pool; development retains localhost; errors name fields without echoing values.

## 8. Task 4: database, runtime grants, and schema stability

**Files:** Existing `packages/db/src/schema/auth.ts`, `packages/db/drizzle/`, `packages/db/scripts/migrate.mjs`; future migrations only when plugin configuration changes.

**Interfaces:** `createDatabase(connectionString)` returns the shared `pool` and schema-aware `db`. Runtime uses `DATABASE_URL`; migration runner exclusively requires `DATABASE_MIGRATION_URL`.

- [ ] Start local PostgreSQL without deleting/reinitializing the persistent volume.
- [ ] Apply the reviewed migration chain through the migration connection.
- [ ] Provision or inspect the runtime role. It must be non-owner, non-superuser and `NOBYPASSRLS`, with no membership in privileged roles.
- [ ] Grant explicit identity table CRUD and only the reviewed business privileges. Do not grant `ALL TABLES`, schema CREATE, TRUNCATE, broad default privileges, or migration-role membership.
- [ ] Verify schema generation with the current plugin configuration. Preserve `activityTracking.enabled: false` until a deliberate tracking change is made.
- [ ] Run clean/upgrade and runtime-role integration tests against a disposable local server.

```powershell
pnpm.cmd db:up
pnpm.cmd --filter @nthawi/db db:check
pnpm.cmd --filter @nthawi/db exec node --env-file=../../.env scripts/migrate.mjs
```

For first-time local role provisioning, connect to the local admin console:

```powershell
docker exec -it nthawi-postgres psql -U nthawi_dev -d nthawi
```

```sql
CREATE ROLE nthawi_runtime LOGIN NOSUPERUSER NOBYPASSRLS
  NOCREATEDB NOCREATEROLE NOINHERIT;
\password nthawi_runtime
GRANT CONNECT ON DATABASE nthawi TO nthawi_runtime;
GRANT USAGE ON SCHEMA public TO nthawi_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public."user", public."session", public."account",
  public."verification", public."rate_limit"
TO nthawi_runtime;

SELECT current_user, session_user, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname = current_user;
```

Run the inspection using the actual runtime connection as well as the administrator; inspecting the administrator only proves the wrong role. If the role exists, inspect/correct it without recreating it. Follow `packages/db/README.md` for explicit business-table grants and the rules denying workspace INSERT/DELETE.

### Schema changes when enabling premium analytics

Activity tracking adds a `lastActiveAt` identity field in the installed plugin. Dashboard connectivity with tracking disabled does not require that field. For tracking:

1. Enable the chosen option in a reviewed branch/configuration used by schema generation.
2. Use the published `auth@1.7.6` CLI. Its registry manifest pins Better Auth/core/telemetry 1.7.6 and utilities 0.4.2. Do not use `auth@latest` in reproducible release automation.
3. Generate to a temporary candidate path, compare it to the current schema, and preserve compatible IDs, indexes and custom policy definitions when updating the canonical file.
4. Generate/review a new Drizzle migration and metadata. Never edit applied `0002_better_auth.sql`.
5. Apply an additive nullable-column migration before activating tracking, with corresponding explicit runtime grants if a new table is introduced.
6. Test key present/absent, field writes, schema compatibility, restart and rolling deployment. Leave schema compatible if tracking is turned off later.

```powershell
pnpm.cmd dlx auth@1.7.6 generate `
  --config apps/api/src/auth/auth.ts `
  --output packages/db/src/schema/auth.candidate.ts `
  --yes
# Compare candidate, then update canonical schema intentionally.
pnpm.cmd --filter @nthawi/db db:generate --name auth_activity_tracking
pnpm.cmd --filter @nthawi/db db:check
```

The CLI generates Drizzle definitions; the existing ORM migration workflow applies the SQL. Do not substitute the CLI's Kysely-specific direct migration command for Drizzle. [Published CLI 1.7.6 manifest](https://registry.npmjs.org/auth/1.7.6), [Better Auth CLI](https://better-auth.com/docs/concepts/cli)

**Expected:** Existing migration history preserved; key presence alone does not unexpectedly require a different schema; the runtime role can operate auth without bypassing tenant isolation.

## 9. Task 5: preserve server/client mounts and prove dashboard connectivity

**Files:** Existing auth factory, browser client and bridge; add tests to `apps/api/test/auth.integration.spec.ts` and `apps/api/src/auth/http.spec.ts`.

**Interfaces:** `createAuth(env, database, sendEmail?)` returns the canonical auth instance. `configureAuthHttp(app, auth, env): Promise<void>` forwards requests to its `handler`.

The installed server code already contains the essential integration. This is the existing conditional element inside its `plugins` array, after the existing `emailOTP({...})` element:

```ts
import { dash } from "@better-auth/infra"

...(env.BETTER_AUTH_API_KEY
  ? [dash({
      apiKey: env.BETTER_AUTH_API_KEY,
      activityTracking: { enabled: false },
    })]
  : []),
```

This excerpt is an array element, not a standalone module. Retain the OTP options and all other current auth settings. No mounting change is required for the current setup.

The existing complete browser mount is:

```ts
"use client"

import { createAuthClient } from "better-auth/react"
import { emailOTPClient } from "better-auth/client/plugins"
import { dashClient } from "@better-auth/infra/client"

const baseURL = process.env.NEXT_PUBLIC_API_URL
if (!baseURL)
  throw new Error("Missing client configuration: NEXT_PUBLIC_API_URL")

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient(), dashClient()],
})
```

Never put `apiKey` into this client configuration. The server key is consumed by the API plugin.

### Dashboard “Connect your app” fields

| Environment        | Auth server URL entered in Dashboard                                                | Better Auth API path |
| ------------------ | ----------------------------------------------------------------------------------- | -------------------- |
| Direct local API   | `http://localhost:4000`, if the dashboard's current localhost mechanism supports it | `/api/auth`          |
| Development tunnel | The HTTPS tunnel origin actually reaching the API                                   | `/api/auth`          |
| Staging            | The chosen owner origin, e.g. `https://app.staging.nthawi.ai`                       | `/api/auth`          |
| Production         | `https://app.nthawi.ai`                                                             | `/api/auth`          |

Enter origin and path in their separate fields. Do not put `/api/auth` in both, and do not enter the marketing host unless it actually proxies the canonical auth server. The local frontend runs at port 3000, but the existing local auth server runs at port 4000.

- [ ] Restart the API after installing the new server key; rebuild/redeploy affected services if package code or client public URL changes.
- [ ] Check `/api/auth/ok` from the intended route. This proves routing only.
- [ ] Use Dashboard's signed connection test and record a connected state in the correct project.
- [ ] Confirm a synthetic user and its session appear; revoke the session and prove the cookie no longer authorizes a protected API request.
- [ ] Confirm ordinary owner users cannot invoke Dashboard administrative endpoints.
- [ ] Confirm disconnected/bad-key status is observable and does not bypass core auth/tenant checks.

The installed plugin has `/api/auth/dash/config` and `/api/auth/dash/validate` routes protected by Infrastructure-issued signed Bearer JWTs. A raw `BETTER_AUTH_API_KEY` is not a substitute request token. Do not make these routes public or disable security checks to obtain a green dashboard indicator. Route names on live docs can differ from the installed release; verify the installed declarations and source. [Dashboard documentation](https://better-auth.com/docs/infrastructure/plugins/dashboard)

### Localhost and optional custom headers

Determine whether the current Dashboard connection test is executed by browser code or Infrastructure's service. `localhost` on a remote service refers to that service, not this workstation. Browser access may also be limited by mixed-content/private-network restrictions. If the documented localhost path fails, use a short-lived HTTPS development tunnel or synthetic HTTPS staging.

For a tunnel, set the backend canonical URL to its external HTTPS origin and update the development OAuth callback to that exact origin. Keep the web trusted origin explicit; use synthetic data, a development key, bounded exposure, and remove the tunnel after testing. An end-to-end browser test is required for the resulting cookie topology; a working dashboard fetch alone does not prove login.

Custom headers are only for an additional ingress access gate required by the deployment. Configure the exact scoped header in the proxy and Dashboard, store it privately, and verify it survives the route to the API. Avoid replacing `Authorization`, which the plugin uses for its signed control requests. Do not add a wildcard origin or broaden CORS to trust the dashboard website without proving the necessary browser flow. The current bridge allows only the owner/canonical origin when `Origin` is supplied; a failing connection with a different Origin must be investigated against the actual signed-request path.

**Expected:** Auth stays protected; Dashboard reaches the correct project with valid signed requests; no admin access for anonymous/ordinary users; revocation reaches PostgreSQL-backed product authorization.

## 10. Task 6: complete owner identity flows and transactional email

**Files:** Existing `create-auth.ts`, `email.ts`, auth integration tests; proposed `apps/web/features/auth/` and auth pages.

**Interfaces:** Preserve `SendAuthEmail = (message: AuthEmail) => Promise<void>` for current Resend delivery. Auth pages consume the existing exported `authClient`. Auth errors must be handled before subsequent UI state transitions.

### Provider setup in dependency order

1. Verify the domain and HTTPS owner origin for the target environment.
2. Create a separate Google **Web application** OAuth client for each environment. Configure the exact redirect URI:
   - Direct local API: `http://localhost:4000/api/auth/callback/google`.
   - Staging example: `https://app.staging.nthawi.ai/api/auth/callback/google`.
   - Production: `https://app.nthawi.ai/api/auth/callback/google`.
3. Add the owner frontend origin when Google's configuration requests a JavaScript origin. Add approved test accounts while in Google's testing mode; complete the requirements shown for production publishing. A generated Google authorization URL does not prove real callback exchange or public authorization.
4. Verify `notify.nthawi.ai` with the chosen sending provider using the exact account-supplied DNS records. Configure SPF/DKIM and reviewed DMARC policy; avoid duplicate/conflicting SPF records.
5. Choose the real sender and owner-provided reply/support contact. Add any needed reply-to field to the typed email port/adapter rather than hardcoding an invented address.
6. Send verification/recovery messages to controlled Gmail and Outlook inboxes and inspect authentication headers, arrival and expiry.

[Google provider](https://better-auth.com/docs/authentication/google), [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)

### Required browser flows and states

| Page/flow        | Calls and behavior                                                                          | Failure/edge cases to cover                                                       |
| ---------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Signup           | `signUp.email({ name, email, password })`; show email verification state                    | Validation, duplicate identity policy, delivery failure, interrupted registration |
| Verification     | `emailOtp.verifyEmail({ email, otp })`; then sign in if no usable session exists            | Expired code, wrong code, three failures, replay, resend cooldown                 |
| Password sign-in | `signIn.email({ email, password })`; then navigate to onboarding/app                        | Wrong credentials, unverified email, 429, offline, expired session                |
| Passwordless OTP | `emailOtp.sendVerificationOtp({ email, type: "sign-in" })`, then `signIn.emailOtp`          | Implicit signup behavior is an explicit product choice; no surprise linking       |
| Google           | `signIn.social({ provider: "google", callbackURL })`                                        | User cancel, state mismatch, wrong callback, existing-email explicit linking      |
| Reset by OTP     | `emailOtp.requestPasswordReset`, then `emailOtp.resetPassword`                              | Generic request acknowledgement, unknown account, expiry/replay, revoked sessions |
| Reset by link    | `requestPasswordReset({ email, redirectTo })`, then `resetPassword({ newPassword, token })` | Trusted destination only, token redaction, expired/reused token                   |
| Sessions         | `getSession`, `listSessions`, `revokeSession`, `revokeOtherSessions`                        | Own-session authorization, cross-user token attempt, database revocation          |
| Email change     | Existing OTP change-email endpoints, not the disabled core link flow                        | New-address verification, duplicate address, stale auth, old-session policy       |
| Account linking  | Explicit authenticated link operation                                                       | Verified matching email alone must not imply linking                              |
| Logout           | `signOut`; clear owner query/state caches; navigate to sign-in                              | Expired cookie, network failure, multi-tab expiry                                 |
| Deletion         | Product deletion orchestrator with fresh session                                            | Durable journal failure, original cleanup, worker races, backup replay            |

The server currently uses 6-digit, hashed OTPs, a 300-second lifetime and three attempts; passwords are 12–128 characters; recovery revokes prior sessions. These are existing repository decisions. Review whether to expose all available passwordless/link recovery methods initially; the server already supports more than a single sign-in form. [Email OTP API](https://better-auth.com/docs/plugins/email-otp)

### Minimal proposed password form

This complete proposed component demonstrates call/error/pending behavior. Place it at `apps/web/features/auth/password-sign-in-form.tsx` when implementing the UI; add the page and end-to-end tests in the same deliverable. It deliberately uses a fixed internal destination.

```tsx
"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "../../lib/auth-client"

export function PasswordSignInForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const values = new FormData(event.currentTarget)
    const email = values.get("email")
    const password = values.get("password")
    if (typeof email !== "string" || typeof password !== "string") return

    setPending(true)
    setMessage(null)
    try {
      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        setMessage("Sign-in failed. Check your details and email verification.")
        return
      }
      router.replace("/app")
      router.refresh()
    } catch {
      setMessage("Could not connect. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} aria-busy={pending}>
      <label htmlFor="sign-in-email">Email</label>
      <input
        id="sign-in-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        disabled={pending}
      />
      <label htmlFor="sign-in-password">Password</label>
      <input
        id="sign-in-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        disabled={pending}
      />
      <button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  )
}
```

Create `/app` as part of the owner UI task. No browser method's successful response grants workspace permissions by itself; protected API calls remain authoritative.

### Verification/reset UX requirements

- Represent form state explicitly: editing, submitting, code sent, verifying, success, recoverable failure and throttled. Do not advance on an `error` result.
- Use text OTP input with `inputMode="numeric"`, `autoComplete="one-time-code"`, six-character length and string values so leading zeroes survive.
- Do not store password/OTP/reset token in URL parameters, persistent browser storage, analytics or logs. A link-reset token necessarily arrives in the link; consume it in the auth API and immediately replace the browser URL, with referrer/log protections and no third-party scripts on that page.
- Resend cooldown is a UX aid; server-backed limits enforce abuse protection across clients.
- Preserve user input after recoverable network failures, but clear passwords/codes when a flow ends or a user signs out.
- Use generic recovery-request acknowledgement whether the identity exists. Test response, status and delivery side effects; do not rely on copy alone to prevent enumeration.
- Fix callback destinations to known internal pages, or implement a strict relative-path policy. Reject protocol-relative URLs, foreign origins and encoded path tricks; do not pass raw `returnTo` query values to auth calls.
- Do not log entire error objects, request bodies or `FormData` while debugging.

### Resend delivery completion

The current sender awaits an HTTP response; that is useful but does not prove inbox delivery. Add a content-free delivery record keyed to a server-issued message ID, safe delivery state and provider event ID. Verify provider webhook signatures, deduplicate repeated events and process out-of-order statuses safely. Do not retain OTPs, reset links or email bodies in ordinary delivery logs. Keep auth proof lifetime independent of retry scheduling; retries must not extend or publish an expired code.

If an outbox is introduced, design how it protects short-lived proof material at rest and how the user learns that delivery is queued. Do not turn the existing callback into an untracked `void sendEmail(...)`. Use awaited bounded sending initially, and only add a queue when its semantics and protected payload retention are reviewed. [Resend Better Auth integration](https://resend.com/docs/send-with-better-auth)

- [ ] Write browser tests for signup → verification → login → onboarding and reset → old-session rejection.
- [ ] Add provider failure/unknown-account/replay/expiry tests to the auth integration suite.
- [ ] Implement screens and fixed safe callbacks, retaining the current server policies.
- [ ] Verify actual Google and inbox delivery on HTTPS staging.
- [ ] Commit the focused feature and its evidence; label external results separately from mocks.

## 11. Task 7: authoritative owner sessions and tenant authorization

**Files:** Proposed `apps/api/src/auth/owner-identity.ts`, workspace service/controllers and tests. Consume existing auth instance and `withTenantTransaction`.

**Interfaces:** Produce `requireOwner(headers: Headers): Promise<OwnerIdentity>` from a factory bound to the canonical auth instance. `OwnerIdentity` contains only `ownerId`, session ID and authentication time; ownership never comes from a body/query/browser claim.

Proposed complete boundary module:

```ts
import { ForbiddenException, UnauthorizedException } from "@nestjs/common"
import type { NthawiAuth } from "./create-auth.js"

export interface OwnerIdentity {
  ownerId: string
  sessionId: string
  authenticatedAt: Date
}

export function createOwnerIdentityReader(auth: NthawiAuth) {
  return async function requireOwner(headers: Headers): Promise<OwnerIdentity> {
    const result = await auth.api.getSession({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    })
    if (!result) throw new UnauthorizedException("Authentication required")
    if (!result.user.emailVerified) {
      throw new ForbiddenException("Email verification required")
    }
    return {
      ownerId: result.user.id,
      sessionId: result.session.id,
      authenticatedAt: result.session.createdAt,
    }
  }
}
```

Bind this reader to the existing `auth` via a Nest provider; never import a factory that creates another pool per request. Convert Fastify request headers with `fromNodeHeaders`. An auth-store error is a dependency failure, not an authenticated session; return a safe 503 via the global error mapping rather than leaking internals or pretending it is a successful anonymous read.

For a workspace operation:

1. Resolve authoritative owner identity from the session.
2. Validate the workspace UUID and exact mutation Origin using the existing configuration contract.
3. Enter an owner-context transaction and select the workspace whose `owner_id` equals the verified user ID. Missing or inaccessible resources return 404.
4. Only after ownership is established, enter the authorized workspace context and use its transaction for every business query.
5. Return browser-safe DTOs. Never return password hashes, session tokens, provider tokens, verification values or operational journal data.

The current workspace RLS policy denies INSERT/DELETE. Implement creation/deletion with an explicitly reviewed narrow service path, not by escalating the ordinary runtime login or granting bypass. Creation must serialize/count per owner so two concurrent requests cannot exceed two workspaces. The workspace owner column is text while auth IDs are UUID values represented as strings; any future FK/type migration must account for existing data and deletion retention requirements.

For sensitive changes use a fresh-session check: session creation within the existing 15-minute fresh window, or a reviewed provider-appropriate reauthentication flow. Password-only confirmation must not lock out owners whose only credential is Google. Check freshness server-side even if the UI prompted reauthentication.

### Next.js server-rendered auth

Next.js 16's installed `headers()` API is asynchronous. Use `await headers()`. A layout-only check cannot enforce every route because of partial rendering, and a client hook is not a security boundary. Perform checks near the data and again in the API.

The current web package does not install `server-only`. Add its published 0.0.1 package with the proposed server module; the existing strict side-effect import checks otherwise reject the example. Commit the exact manifest/lockfile change with that task:

```powershell
pnpm.cmd --filter @nthawi/web add --save-exact server-only@0.0.1
```

Proposed `apps/web/lib/owner-session.ts` performs an authenticated **read** to the canonical API, forwards only the necessary cookie, and prevents cross-user caching:

```ts
import "server-only"
import { headers } from "next/headers"
import { z } from "zod"

const sessionResponse = z
  .object({
    session: z.object({ id: z.string(), expiresAt: z.string() }),
    user: z.object({ id: z.string(), emailVerified: z.boolean() }),
  })
  .nullable()

export async function readOwnerSession() {
  const origin = process.env.AUTH_INTERNAL_ORIGIN
  if (!origin)
    throw new Error("Missing server configuration: AUTH_INTERNAL_ORIGIN")
  const incoming = await headers()
  const endpoint = new URL("/api/auth/get-session", origin)
  endpoint.searchParams.set("disableCookieCache", "true")
  endpoint.searchParams.set("disableRefresh", "true")
  const response = await fetch(endpoint, {
    headers: { cookie: incoming.get("cookie") ?? "" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  })
  if (response.status === 401) return null
  if (!response.ok) throw new Error("Authentication service unavailable")
  return sessionResponse.parse(await response.json())
}
```

`AUTH_INTERNAL_ORIGIN` is a proposed **server-only web** setting. For local use choose `http://localhost:4000`; inside production networking choose the fixed API service origin, e.g. `http://api:4000`. Validate it before server startup, keep it out of `NEXT_PUBLIC_*`, never derive it from request headers, and declare it in relevant Turbo runtime environment configuration. This call observes session status; it does not forward `Set-Cookie` renewal headers through a Server Component. Keep renewal/sign-in/mutations on browser-to-canonical auth requests, or implement an explicit route/action that can propagate all cookies.

```tsx
// Proposed apps/web/app/(owner)/app/page.tsx
import { redirect } from "next/navigation"
import { readOwnerSession } from "../../../lib/owner-session"

export default async function OwnerPage() {
  const current = await readOwnerSession()
  if (!current) redirect("/sign-in")
  if (!current.user.emailVerified) redirect("/verify-email")
  return (
    <main>
      <h1>Your workspaces</h1>
    </main>
  )
}
```

The server helper's data validation strips unnecessary identity fields. If `cacheComponents` is enabled, follow the installed runtime-data/Suspense rules; never cache identities globally or introduce `use cache` for this read. Use a fixed API destination so incoming cookies cannot be forwarded to an attacker-supplied URL.

**Focused tests:** Missing/expired/revoked session → 401; unverified owner → 403; wrong owner/workspace → 404; forged `ownerId` rejected; DB outage → safe dependency error; pooled context cleared after commit/rollback; two simultaneous creates cannot exceed two; server-rendered owner data does not leak across cookies.

## 12. Task 8: production ingress, cookies and HTTP controls

**Files:** Proposed `infra/caddy/Caddyfile`; existing `http.ts`/bridge tests; proposed health module and environment tests.

**Interfaces:** Owner browser uses `https://app.nthawi.ai/api/auth/*`; Caddy forwards to `api:4000` without modifying the auth path. Widget/visitor APIs use separate allowed routes and credentials.

Proposed owner-host Caddy fragment:

```caddyfile
app.nthawi.ai {
  @ownerApi path /api/*
  handle @ownerApi {
    header Cache-Control "private, no-store"
    reverse_proxy api:4000
  }
  handle {
    reverse_proxy web:3000
  }
}
```

This is an owner-host fragment, not the complete reviewed production ingress. It uses `handle`, which preserves `/api/...`; `handle_path` would strip the matched prefix and break the existing routes. Define the widget/public host allowlist as part of the visitor API task; reject `/api/auth/*` and owner `/api/v1/*` routes there. Validate the actual Caddy configuration before using it. [Caddy handle](https://caddyserver.com/docs/caddyfile/directives/handle), [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

- Bind API/database to private service networking; public firewall exposes only reviewed ingress/operator ports.
- Set the API's canonical base URL to the public owner HTTPS origin even though its internal request arrives over HTTP.
- Preserve separate `Set-Cookie` headers, auth redirects/query strings and raw callback bodies. Retain the current bridge's 1 MiB auth-body limit and sanitized errors.
- Use host-scoped Secure/HttpOnly/SameSite=Lax cookies; leave cross-subdomain sharing disabled. Verify attributes on real HTTPS responses and cookie sending in real browsers.
- Configure `API_TRUST_PROXY` for exact reachable Caddy peers or a dedicated restricted range. Never trust all headers or all RFC1918 networks. Network ACLs and proxy allowlists must match.
- The bridge overwrites `x-nthawi-client-ip` with Fastify's resolved `request.ip`; do not allow client-supplied internal headers to bypass this. Preserve this when enabling Sentinel.
- Origin checks and CORS are independent. Same-origin deployment simplifies browser behavior; retain exact server mutation checks and Better Auth's CSRF/OAuth protections.
- Cloudflare/proxy caches must bypass auth, owner API, uploads, downloads and SSE; no session response may be shared.
- Access logs must not retain auth query strings, cookies, Authorization headers, email/password/OTP bodies or reset tokens. Include safe request ID/status/latency metadata instead.
- Keep WebSocket/SSE behavior in the visitor/service route design, with bounded streams and graceful drain; the existing auth bridge buffers small auth responses and should not be reused as a general SSE proxy.

**Tests:** Spoofed Host/forwarding headers do not change callbacks; untrusted peers cannot fake client IP; malicious Origin fails; legitimate Google callback survives; two cookies remain distinct; no-owner-host auth exposure; no private response caching; internal runtime without ingress cannot be reached publicly.

## 13. Task 9: activate premium security and analytics deliberately

**Files:** Existing auth factory; candidate generated identity schema; new migrations if needed; integration/bridge tests; new safe security event metadata adapter if required.

**Interfaces:** Consume valid Infrastructure key, authenticated operator access and resolved client IP. Produce documented security verdict behavior and, optionally, activity/audit telemetry. Do not change application ownership or anonymous visitor authentication.

### Dashboard and audit controls

- Confirm the exact available operator roles in the purchased account. Application owner identity and Dashboard operator privileges are separate.
- Exercise read-only user search, safe profile edits and session revocation using synthetic users. Reject arbitrary unauthenticated control requests.
- Treat export, bulk mutation and adapter-execution routes as privileged operations. Verify signed request validation and operator authorization rather than exposing general database execution to Nthawi owners.
- Define which metadata leaves Nthawi: identity fields, auth event type/time, session/network/device fields and any analytics fields actually transmitted. Verify source/runtime behavior; do not assume no data leaves the app because identities are self-hosted.
- Update the privacy/data inventory for the selected managed services and actual retention. Avoid collecting transcripts, source documents or original files for auth analytics.
- Monitor logs/detection usage and invoice changes. Audit retention is not the backup strategy, incident evidence store or durable deletion journal.

### Activity tracking

The current explicit `activityTracking: { enabled: false }` keeps the identity schema stable. If online-user/last-active reporting is useful, complete Task 4's additive migration first and then enable the exact installed option. Measure write volume, update interval and meaning of “active”; do not present it as a product usage counter or exact session count.

### Sentinel

Adding Sentinel is a separate server plugin change. `dashClient()` supplies audit-related client behavior; it does not by itself implement all browser fingerprint/proof-of-work security features. Read the installed Sentinel server/client types and the current security docs before selecting controls. [Sentinel](https://better-auth.com/docs/infrastructure/plugins/sentinel)

For the first evaluated release:

1. Confirm paid entitlement and which request/security checks are actually enabled.
2. Preserve database-backed local rate limits and per-identity/endpoint abuse controls.
3. Preserve existing email identity semantics. The installed Sentinel normalization defaults can alter Gmail aliases; disable normalization initially through the verified option or provide a reviewed migration/conflict policy before enabling it.
4. Use the already-resolved client IP. Test mobile carrier/NAT/shared-IP behavior and legitimate travel/VPN use before blocking accounts automatically.
5. Test bad-password, disposable-email, high-rate signup, challenge, and suspicious session scenarios against the actual selected settings.
6. Simulate timeout, service rejection, invalid key, quota exhaustion and missing device data. The inspected release's security service can return an allow verdict on upstream failures; document this behavior and retain local controls. If a stricter failure policy is required, implement it explicitly with tests and recovery controls rather than claiming Sentinel fails closed.
7. Roll out via synthetic staging and a bounded initial cohort. Keep a reviewed feature-only rollback; never disable core session/origin/ownership checks to resolve false positives.

The following proposed server element uses options verified in Infrastructure 0.4.12. It starts with observation-oriented settings and explicitly disables identity normalization. Place it beside `dash()` only when the key exists; this is a starting configuration to evaluate, not a claim that all policies are enforced:

```ts
import { sentinel } from "@better-auth/infra"

sentinel({
  apiKey: env.BETTER_AUTH_API_KEY,
  apiOptions: { timeout: 3_000 },
  kvOptions: { timeout: 1_000 },
  security: {
    emailNormalization: { enabled: false },
    emailValidation: { enabled: true, strictness: "medium", action: "log" },
    compromisedPassword: { enabled: true, action: "log" },
    botBlocking: { action: "log" },
    suspiciousIpBlocking: { action: "log" },
    credentialStuffing: { enabled: false },
    impossibleTravel: { enabled: false },
    velocity: { enabled: false },
    freeTrialAbuse: { enabled: false },
    staleUsers: { enabled: false },
    unknownDeviceNotification: false,
  },
})
```

Keep `dashClient()` and `emailOTPClient()` in the browser. Add the separately verified client plugin only for the Sentinel-enabled build:

```ts
import { sentinelClient } from "@better-auth/infra/client"

const identifyUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_IDENTIFY_URL
if (!identifyUrl) throw new Error("Missing client configuration: identify URL")

sentinelClient({
  identifyUrl,
  autoSolveChallenge: true,
  identifyOptions: {
    timeout: 1_000,
    retry: { attempts: 2, baseDelay: 400, maxDelay: 600 },
  },
})
```

This public identification URL comes from the actual project's settings, typically a project-scoped Infrastructure ingestion URL. It is not the project secret key. Validate its approved HTTPS destination; include it in web build environment inputs and CSP connect/script rules actually required by the installed client.

For the existing local cross-origin setup, extend `http.ts` CORS `allowedHeaders` with `x-visitor-id`, `x-request-id`, `x-pow-solution`, and add `exposedHeaders: ["x-pow-challenge", "x-pow-reason"]`. Test preflight, challenge visibility, bounded retry and legitimate error handling. Keep exact origins/credentials policy.

Inspect coverage per enabled route. The installed main Sentinel admission check skips GET and `/dash` and uses a defined auth-route list; separate identification/session/email hooks have their own coverage. Current OTP change-email endpoints are not automatically proved protected by coverage of the core change-email route. Sentinel also coordinates with local rate-limit rules for challenge round trips. Test direct-IP throttling and solved/unsolved challenge behavior after enabling it; there is no verified `excludeRoutes` option to invent.

**Acceptance:** Each enabled feature has an exact configuration, a schema decision, expected failure behavior, source link, entitlement evidence and regression tests. Premium support does not eliminate these application release obligations.

## 14. Task 10: managed premium email, if selected

**Files:** Proposed `apps/api/src/auth/infra-email.ts`; current auth factory and typed email port; email unit/integration tests; safe provider configuration.

**Interfaces:** The installed package exports `createEmailSender(config)` and typed `sendEmail(options, config)`. Its result has a `success` boolean; callers must check it, not treat a resolved promise as proof of success.

Retaining Resend is the lowest-change option because it matches the accepted architecture and current callbacks. If premium templates are desired, add a typed Infrastructure sender and route the auth callbacks to it. Do not send the same verification code through both providers.

Before implementing:

- Verify the account's domain/sender verification, template editor, quota, delivery metadata and webhook capabilities. Record any missing capability rather than inventing a managed-email contract.
- Inspect installed `EMAIL_TEMPLATES` and `EmailTemplateVariables` names. Use exact template variables; OTP and reset-link templates are different.
- Extend the current email port to carry typed purpose and required proof fields if both providers need to implement it. Do not scrape OTPs or links back out of rendered plain-text messages.
- Keep sending bounded and errors sanitized. Audit only safe provider status/message IDs.
- Compare delivery, tracking, support and retention behavior with Resend; update the privacy/provider inventory.

A complete proposed reset-link sender, compatible with the inspected installed email API:

```ts
import { sendEmail } from "@better-auth/infra/email"

export function createInfraResetLinkSender(apiKey: string) {
  return async function sendResetLink(input: {
    email: string
    name: string
    url: string
  }): Promise<void> {
    try {
      const result = await sendEmail(
        {
          template: "reset-password",
          to: input.email,
          variables: {
            resetLink: input.url,
            userEmail: input.email,
            userName: input.name,
            appName: "Nthawi",
          },
        },
        { apiKey, apiOptions: { timeout: 10_000 } }
      )
      if (!result.success) throw new Error("Delivery rejected")
    } catch {
      throw new Error("Authentication email delivery failed")
    }
  }
}
```

Wire its result to the existing `emailAndPassword.sendResetPassword` callback only after the sender is selected. Implement OTP sending using the inspected OTP template and variables in the same typed adapter, and test every enabled OTP purpose. Do not change the core change-email link policy while `overrideDefaultEmailVerification` remains enabled. [Managed email](https://better-auth.com/docs/infrastructure/services/email)

The installed template set has `sign-in-otp`, `verify-email-otp` and `reset-password-otp`, but its `change-email` template requires a **confirmation link**. The existing application uses a change-email **OTP**. Keep that purpose on Resend, or verify and implement an appropriate managed custom template before moving it. A supported custom template API has not been established in this review; do not mislabel an email-change code as a sign-in code. This compatibility gap prevents an unqualified complete sender replacement.

**Focused tests:** `success: false` rejects safely; thrown network/provider errors are sanitized; exactly one send per callback; correct template/purpose; no duplicate link/code verification sends; expired proofs not retried; quota/provider outage does not issue a session without verified proof.

**Production acceptance:** Real controlled inbox delivery and headers, abuse limits and monitored usage, working rollback to the reviewed sender configuration. A premium invoice or HTTP success alone is insufficient.

## 15. Task 11: account lifecycle, durable deletion and recovery

**Files:** Proposed deletion/workspace services and journal adapters; existing auth `deleteUser` configuration; auth/business integration and recovery tests.

**Interfaces:** Define `requestOwnerDeletion(owner: OwnerIdentity, idempotencyKey: string): Promise<{ operationId: string; state: "accepted" }>` and a durable job `completeOwnerDeletion(operationId: string): Promise<void>`. A successful request acknowledges recorded intent, not completed erasure. A read endpoint reports safe operation status to the reauthenticated owner/support workflow.

The existing core deletion endpoint can remove identity records after a fresh session. It does not implement the master plan's business/storage deletion process. Workspace `owner_id` does not currently enforce identity deletion via a foreign key, and retained originals/journals are separate resources. Do not expose unrestricted production self-deletion or use Dashboard's direct user deletion as the whole deletion workflow.

The required sequence is:

1. Authenticate, verify email and require fresh authentication. Confirm the intended operation explicitly in the product UI.
2. Resolve every owner-owned workspace server-side and serialize the account lifecycle transition. Reject concurrent new workspace creation/writes while deleting.
3. Record an idempotent, content-free **off-server** deletion intent before acknowledging acceptance. If the journal write fails, return a retryable failure and do not claim deletion.
4. In PostgreSQL, revoke sessions and disable further account/product access; revoke publications and widget installation credentials; fence jobs and in-flight generations by durable state/version.
5. Delete original/derived/quarantine objects and business data according to the documented retention policy; preserve the minimal owner-period usage/tombstone accounting required to prevent allowance reset.
6. Remove remaining provider/identity material through the controlled auth integration. Decide the minimal irreversible tombstone identity, retention and consent/legal basis in the data inventory; do not retain raw email unnecessarily.
7. Verify object and row absence and complete the journal operation. Retry cleanup idempotently after process failures.
8. On restoration, replay off-server intents before exposing traffic; deleted accounts/knowledge/originals must not reappear.

Gate the core self-delete endpoint until it is routed through this sequence. Inspect whether Dashboard deletion invokes the same core hooks in the installed version; if it uses adapter deletion directly, application hooks alone are insufficient. Use the available endpoint/role restriction mechanism, or prohibit that destructive dashboard operation operationally until a technical gate exists. If the paid account cannot enforce the required controls, that is a deployment prerequisite, not a reason to weaken deletion guarantees.

### Other lifecycle events

- Password reset/change: verify old sessions are revoked according to the selected flow, and confirm revoked cookies fail sensitive product reads/writes.
- Email change: keep OTP proof bound to the new address and authenticated account; do not implicitly relink Google or reset owner usage. Define whether to revoke other sessions and notify the old address.
- Provider unlink: retain a usable login method; the current configuration blocks unlinking all accounts. Test Google-only and password-only owners.
- Dashboard password/session changes: record safe administrative audit metadata and confirm the affected owner can recover securely.
- Restore: assess restored session validity and revoke sessions issued before the recovery cutover when needed. Preserve application encryption keys securely enough to decrypt retained provider material without putting recovery keys on production.
- Premium key rotation/outage: do not reset or erase PostgreSQL identities; test core auth with the configured feature state and report disconnected premium status accurately.

**Tests:** Stale/fresh auth; journal failure before acknowledgement; duplicate deletion request; new write racing deletion; worker race; scanner/object cleanup retry; identity removal with orphan workspace prevention; restore after deletion; allowance preservation; dashboard destructive-path behavior; lost recovery keys.

**Expected:** No deletion UI claims completion until cleanup is verified; no restore resurrects deleted data; a fresh core identity session alone cannot bypass durable business deletion.

## 16. Task 12: staging, production delivery and evidence

**Files:** Proposed infrastructure/containers, health module, protected CI workflows, auth browser tests and `docs/evidence/auth/`; preserve current deploy baseline until tested replacements exist.

**Interfaces:** Produce independent `/health/live` and `/health/ready`, immutable build artifacts, a reviewed migration deployment step, and an evidence-backed auth release.

### Health contract

- `/health/live`: process/event loop can serve requests; never requires the DB, mail provider or Infrastructure.
- `/health/ready`: safe bounded checks for DB connectivity, expected migration/schema compatibility and required configured capabilities. Return generic safe status; do not expose credentials, hostnames or raw provider errors publicly.
- Premium upstream outage policy is explicit. Prefer a separate degraded-premium metric/status rather than removing a healthy core auth server from service and producing a cascading outage. If release requirements demand premium connectivity, enforce that in deployment preflight and alerting, with a reviewed availability decision.
- Mail/Gmail/Google workflows are synthetic operational checks, not external requests on every load-balancer readiness poll.

### Development-to-production order

1. **Local foundation:** Node 24 install, explicit secrets, PostgreSQL roles/migrations, local mail/OAuth test accounts, current plugin mount, basic UI and server authorization.
2. **Premium evaluation:** synthetic project and data; connection test; audit/session operations; selected feature entitlement; activity migration and Sentinel tests if selected; managed-email compatibility tests if selected.
3. **HTTPS staging:** separate project/key/OAuth/sender/database/buckets; production-shaped ingress/cookies and CSP/CORS; real controlled Google and inbox delivery; browser/session/deletion/provider-failure scenarios.
4. **Production prerequisites:** verified domain/DNS/TLS, operator roles/recovery, secret injection, runtime/migration separation, paid account entitlement, redacted monitoring, backup and deletion/accounting journals, reviewed privacy/terms/support copy.
5. **Release candidate:** immutable API/web/worker images, reviewed additive migrations, successful checks, staging deployment of exact image digests, rollback and recovery rehearsal.
6. **Production promotion:** after the deployment is authorized and the candidate/evidence is concrete, apply reviewed migration and promote the tested artifacts. Connect only the production Infrastructure project and verify real controlled production sign-in/session revocation.
7. **Operate:** alert on error/delivery/abuse/usage rates, rotate access, patch through tested changes, review quotas and retention, rehearse recovery after material persistence changes.

### CI and build principles

- Use minimum workflow permissions and pinned reviewed actions. PR tests use synthetic credentials, never production deployment secrets.
- Do not execute fork/untrusted PR code with privileged secrets or unsafe `pull_request_target` checkout behavior.
- Validate Node 24/pnpm/frozen lockfile; format, lint, typecheck, unit and relevant disposable DB integration tests; compile production artifacts.
- Add browser/server-only import boundary checks. Scan secret/dependency/image findings and record the release decision.
- Build server and browser artifacts separately. Frontend build has the public API URL and no auth/DB/provider keys; backend receives secrets at runtime.
- Apply migrations once through a separate deploy job/role, not on every replica boot. Prove that old/new app versions tolerate the additive schema during rollout.
- Promote the exact staged images. Keep the previous compatible image and define rollback before enabling optional features.
- Do not assume application rollback can reverse a destructive database migration. Use forward correction/restore under a reviewed incident procedure.

### Verification commands grounded in this repository

Run these on Node 24. The root format command can reveal existing unrelated formatting differences; fix only changes inside the authorized implementation scope.

```powershell
pnpm.cmd format:check
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
pnpm.cmd --filter @nthawi/db db:check
pnpm.cmd db:up

# Only an isolated LOCAL disposable test server may be used here.
$testDbPort = (docker compose -f infra/compose.dev.yml port postgres 5432 |
  Select-Object -First 1).Split(':')[-1]
$env:RLS_TEST_ADMIN_URL = "postgresql://nthawi_dev:dev-only-change-me@localhost:${testDbPort}/postgres"
$env:AUTH_TEST_ADMIN_URL = $env:RLS_TEST_ADMIN_URL
pnpm.cmd test:integration
Remove-Item Env:RLS_TEST_ADMIN_URL
Remove-Item Env:AUTH_TEST_ADMIN_URL
```

The literal development password above applies only to an unchanged local Compose bootstrap. Existing volumes can retain a different administrator password; use the actual local test credentials without printing them. Integration suites create/drop isolated databases/roles on that local server. Never provide a production or shared staging administrator URL, even if tests use random database names. The current suites do not constitute a universal production-target guard; add that safeguard before broad automation.

After the browser deliverable defines `tests/e2e/auth.spec.ts` and a real Playwright server/configuration:

```powershell
pnpm.cmd exec playwright test tests/e2e/auth.spec.ts
```

Do not report a missing test/config as a pass. Existing `pnpm test:e2e` is a launcher, not proof of implemented browser scenarios.

### Release matrix

| Concern             | Required result                                                                      | Evidence category                            |
| ------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Env                 | HTTP production origins/missing required capability fail safely                      | Unit/startup                                 |
| Schema              | Clean + upgrade migrations; runtime non-bypass; no unexpected plugin drift           | Real PostgreSQL                              |
| Core auth           | Signup/verification/login/reset/linking/unlink/session expiry/revocation             | Integration + browser                        |
| OTP                 | Hashed at rest; expiry/attempt limit/replay; leading zeroes preserved                | Integration + browser                        |
| Google              | Exact callback, valid state, new/existing-email behavior, user cancellation          | Mocked edge tests + real controlled provider |
| Email               | Correct single sender/template; bounded sanitized failure; real delivery headers     | Unit + actual inbox/provider                 |
| Dashboard           | Signed connection; ordinary sessions denied admin; successful revocation             | Integration + actual dashboard               |
| Tracking            | Reviewed `lastActiveAt` migration; expected update behavior/load                     | DB + staged runtime                          |
| Sentinel            | Chosen policies, challenges, alias normalization decision, shared-IP/outage behavior | Synthetic staging + controlled provider      |
| Owner authorization | Forged IDs denied; cross-owner/workspace isolation; fresh auth for sensitive work    | Real DB/API                                  |
| Browser topology    | Host-only Secure/HttpOnly/Lax cookies, server reads, no cross-user cache             | Production-shaped HTTPS browsers             |
| Logs/build          | No secrets/OTPs/reset URLs in bundles, logs, exports or errors                       | Artifact + log inspection                    |
| Deletion/recovery   | Journal first, cleanup/fencing/retry, restore replay, session cutover                | Recovery rehearsal                           |
| Availability        | Live independent of dependencies; readiness/schema checks; graceful shutdown         | Operational fault tests                      |
| Spend               | Actual paid tier/quotas, usage alerts, overage policy; no implicit purchase          | Account evidence                             |

Evidence records include commit/image digest, runtime/dependency versions, environment, command/check, date, actual outcome and safe artifact reference. Do not record email bodies, proof tokens, keys or real customer content in evidence.

## 17. Task 13: Git/GitHub delivery without losing existing work

**Observed:** The current private remote is `Tristan-X888/Nthawi`, default branch `master`, HEAD `ac7a3d998bec7b5881c1db7f0a3760bd6b114a0f`. GitHub CLI authenticated successfully when run with required filesystem/network access. The configured SSH remote could not authenticate; HTTPS Git using the CLI credential helper could read the remote. No remote URL replacement or credential disclosure is required.

**Files:** Commit only this implementation guide and its source findings for the planning task. Future feature changes use focused branches/PRs with their matching tests/docs.

- [ ] Record staged/unstaged status and exclude private `.env`, dependencies, generated outputs and unrelated changes.
- [ ] Publish the planning artifacts on a separate documentation branch from the current remote baseline, preserving the normal checkout/index.
- [ ] Review the branch diff to prove it contains documentation only and no exposed API key.
- [ ] Open a draft PR into `master` with accurate scope/evidence. Do not claim the uncommitted auth foundation is included or production-ready.
- [ ] For implementation, first reconcile and review the pending foundation on its own branch. The GitHub starter commit does not yet contain the locally inspected auth implementation.
- [ ] Add passing CI checks before requiring them. Verify account entitlement before enforcing private branch rules; their current availability was not established by this review.
- [ ] Keep existing history and repository privacy. No branch rename, force push or automatic merge is required for premium connection.

If creating a normal implementation branch later, after resolving the pending-work ownership/reconciliation and clean baseline:

```powershell
git switch -c feat/better-auth-premium
# Implement one task and verify it, then stage its explicit files.
git add -- packages/tooling/src/env.ts packages/tooling/test/env.test.ts
git diff --cached --check
git diff --cached
git commit -m "fix(auth): enforce production origin invariants"
git push -u origin feat/better-auth-premium
```

For this already-dirty checkout, do not run those example staging/commit commands against the user's pending changes as part of planning. Use an isolated documentation index/branch or isolated worktree, and verify the original index is unchanged. HTTPS can be selected per command with `-c credential.helper= -c 'credential.helper=!gh auth git-credential'` and an explicit HTTPS URL; credentials remain in the helper, not command arguments.

## 18. Reconcile the entire master implementation plan

Premium auth is one dependency in the broader production build. The following work remains required before declaring the complete Nthawi pilot ready. These are implementation deliverables from the supplied plan, not claims that they have been executed.

| Master deliverable            | Concrete next implementation                                                                                                             | Required completion gate                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Canonical specifications   | Version current scope, approved uploads, budgets, architecture/data inventory and evidence register; produce Word copy if still required | Current vs historical facts distinguished                             |
| 2. Reproducible repository    | Reconcile pending foundation with remote history, freeze toolchain, compile contracts/API/worker, establish CI                           | Clean Node 24 install/build and import boundaries                     |
| 3. API/database foundation    | Production validation, live/readiness, auth/session service, migrations/roles, actual domain RLS, queue permissions                      | Real runtime-role tests and compiled startup                          |
| 4. Domain/staging             | Authorized domain acquisition, DNS/TLS, firewall/private networking, encrypted mount, isolated staging resources                         | Host routing/certificates/secrets/mount-failure tests                 |
| 5. Owner identity/email       | Tasks 2–12 here: complete UI/auth, premium project/selected features, sender and Google                                                  | Actual HTTPS provider/cookie/revocation evidence                      |
| 6. Workspaces/settings        | Verified session ownership, two-workspace concurrency, onboarding, public/private setting DTOs, deletion integration                     | Forgery/isolation/quota/deletion tests                                |
| 7. Product frontend           | Marketing/pilot, auth, onboarding, knowledge, assistant test, inbox/settings; accessible loading/error/offline/capacity states           | Full keyboard/mobile/browser workflows                                |
| 8. Knowledge/web imports      | Named logical documents/folders, immutable revisions/hash-specific approval, atomic indexed publication, bounded HTTPS website importer  | Draft exclusion, SSRF/revocation/stale job tests                      |
| 9. Safe uploads               | Private streaming quarantine, quota reservation, type/container checks, ClamAV, isolated bounded parser supervisor                       | Adversarial files, scanner/parser/network/filesystem isolation        |
| 10. Review/download/citations | Exact normalized owner review, hidden-content exclusion, location provenance, private authorized original downloads                      | Extraction fixtures, cross-tenant downloads, edited citation behavior |
| 11. Usage/accounting          | Atomic allowance/worst-case cost reservation, integer pricing ledger, owner-period preservation, off-server recovery journal             | Concurrent/retry/charged-failure/restore accounting                   |
| 12. Retrieval/answers         | Authorized approved revision filtering, FTS/pgvector, bounded context, evidence/citation validation, state recheck                       | Injection/unsupported/revoked source/cross-tenant tests               |
| 13. Conversations/SSE         | Durable modes/versions/idempotency, takeover fencing, ordered replay and disconnect/drain handling                                       | Takeover races, restart/reconnect/closed-write tests                  |
| 14. Widget/visitor boundary   | Small lazy iframe loader, exact framing/postMessage, hashed opaque visitor credentials, third-party-cookie independence                  | Origin/framing/token isolation, accessibility, loader size            |
| 15. Owner inbox/dashboard     | Owner transcripts/replies/takeover/close, setup checklist, durable usage/storage warnings                                                | Full visitor-to-human handoff and expired-session behavior            |
| 16. Backup/deletion/restore   | Consistent DB/object bundles, encrypted external backup, deletion/accounting replay, seven-day purge verification                        | Empty-target restore, missing/corrupt objects, RPO/RTO                |
| 17. Production/observability  | Immutable images, staged promotion, reviewed migrations, redacted alerts, safe rollback and capacity controls                            | Verified deployment/incident/rollback evidence                        |
| 18. Real pilot                | Three participating retailers; evaluation/UAT, delivery/network/performance/soak/recovery evidence                                       | All measured release thresholds below                                 |

### Preserve exact security-sensitive upload boundaries

- Accepted formats: UTF-8 `.md`/`.txt`, text-bearing `.pdf`, `.docx`, `.xlsx`, `.pptx`; no OCR, encrypted files, macros, legacy Office or general archives.
- 10 MiB file, 11 MiB multipart request, 100 MiB retained originals/workspace; two pending uploads and 20 MiB pending bytes/owner; five uploads/owner/hour.
- 100 PDF pages, 20 XLSX sheets/50,000 nonempty cells, 100 PPTX slides; OOXML expansion 32 MiB/1,000 entries/8 MiB entry/100:1 ratio; XML depth 100.
- 1 MiB normalized extraction/file and 1 MiB published/workspace; one parser job globally with 30-second deadline. Do not silently truncate/publish incomplete extraction.
- Authenticate/authorize and reserve quota before accepting data; stream/count/hash; scan and parse without network/secrets; retain only accepted originals privately; create an owner-private draft; require exact revision approval.
- Use format-specific citations and safe attachment downloads; do not expose original URLs or parser-generated HTML to customers.

### Preserve accounting and AI gates

- $18 production + $2 staging/evaluation AI envelopes total the accepted $20 global allocation. Infrastructure/Resend costs are separate.
- Reserve allowance/worst-case cost and durable off-server accounting before provider work; reconcile charged failures and uncertain outcomes.
- Initial retrieval parameters remain 600-token chunks/100 overlap, at most six chunks, 6,000 input tokens and 600 output tokens pending evaluated changes.
- Approved evidence is untrusted source content; separate it from application instructions and recheck publication/conversation state before committing an answer.
- Exhausted AI budgets preserve history, human support and cleanup. Premium auth usage does not consume or reset AI allowances.

### Whole-product release thresholds

At least 60 representative retail evaluation cases; ≥90% correct grounded supported answers; ≥95% appropriate unsupported fallbacks; valid approved citations and zero tenant leakage; no prohibited live-commerce claims; no unresolved high/critical security findings; no serious/critical automated accessibility findings plus manual checks; LCP ≤2.5 s and CLS ≤0.1; widget loader ≤10 KiB compressed; non-AI API p95 ≤300 ms at 20 requests/s; 25 customer streams/five owner streams/five concurrent generations; bounded memory including scanner updates/parser work; measured recovery RPO ≤24 hours and RTO ≤4 hours with deletion/accounting replay.

These are acceptance targets copied from the master plan. They have not been measured by this review. The historical 10–12-week estimate must be re-estimated from current verified progress and chosen premium scope; do not promise it from scaffold counts.

## 19. Current evidence, unresolved decisions and minimum changes

### What this review verified

- Read the supplied master plan and the current auth/database/env/HTTP/client/manifests/tests/runbooks.
- Read installed Next.js auth, environment and async `headers()` guidance before drafting Next.js code.
- Verified installed Infrastructure 0.4.12 APIs, schema switches, peer compatibility, signed dashboard control requests, Sentinel's upstream failure/normalization behavior and typed managed-email limitations.
- Checked public premium pricing and official provider/security docs; see the separate [primary-source findings](../../sources/better-auth-infrastructure-research-2026-10-07.md).
- Confirmed current local/remote baseline, privacy/default branch and HTTPS Git access using authenticated CLI credentials; SSH access failed.
- Confirmed private root/web environment files are ignored, without reading or reproducing their contents.
- Confirmed the inspected Node executable is 22.19.0; application checks were not claimed as Node 24 release evidence.
- Verified Markdown formatting with the installed Prettier executable. The pnpm wrapper's managed-runtime cache was inaccessible under this sandbox, so formatting used the direct installed executable without modifying the package setup.
- Parsed ten TypeScript/TSX examples for syntax, and typechecked four complete API examples, three complete web examples and the proposed environment refinement through virtual compiler files without writing application source. The web check represented the explicitly required `server-only` marker dependency; it has not been installed in the application by this task. These checks ran through the installed TypeScript compiler on the current shell, not a full Node 24 build/browser/provider release test.

### Minimum implementation changes before an auth production release

1. Production origin/configuration preflight and Node 24 evidence.
2. Complete accessible auth/account UI and actual Google/email delivery.
3. Authoritative session/owner authorization and reviewed workspace lifecycle entry points.
4. Same-origin HTTPS ingress, correct cookies/private routing/no-cache/log policies, liveness/readiness.
5. Durable account deletion integrated with product/storage/jobs/recovery; safe dashboard destructive-operation policy.
6. Premium project/key connection and real privileged-request/session-revocation verification.
7. Only selected premium features: feature-specific schema, sender/challenge/CORS/CSP/privacy/outage tests.
8. Focused CI, staged release and recovery evidence.

These changes are necessary implementation work described for review. They are not authorized by this document to be applied wholesale under the user's request to avoid code changes. No speculative dependency upgrade, billing integration or architectural replacement is needed simply to connect Dashboard.

### Decisions that remain external or product-specific

- Actual premium plan/entitlement, billing owner, spending authorization, overage/usage-alert controls and operator roles.
- Chosen initial premium security policies, false-positive handling and stricter outage policy if desired.
- Whether to enable activity analytics and the privacy/retention requirement for audit exports.
- Retain Resend, partially adopt managed templates, or complete a compatible sender migration including change-email OTP.
- Actual account localhost connection mechanism and, if needed, a reviewed tunnel or HTTPS staging route.
- Verified domain ownership/DNS, staging host layout, sender/reply/support addresses, Google approval and deployment secret-store details.
- Deletion retention/tombstone policy, off-server journal service, recovery-key custody, and dashboard delete/impersonation restrictions available in the account.
- Whether passwordless signup and both recovery methods belong in the first public UI.

Progress on code/configuration/tests that do not depend on these choices can continue independently. A dependency-specific gate remains pending until its actual evidence exists; elapsed time is not approval or a passing result.
