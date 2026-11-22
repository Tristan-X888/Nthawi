# Phase 6 agent record: context audit (Step 1, in progress)

Evidence labels: **local** (this machine), **CI**, **mock**, **live staging**.
`BA` = `node_modules/.pnpm/better-auth@1.7.7_drizzle-k_064a95742ea64f36e6ae3feb042c3119/node_modules/better-auth/dist`.
`INFRA` = `node_modules/.pnpm/@better-auth+infra@0.4.12_@_56d5e75708ce75015c3fe9aad582f762/node_modules/@better-auth/infra/dist`.

## Step 0 gate (2026-11-06, local, via `gh`)

PR #7 merged at `b8f5b3c` (2026-11-06T00:30:59Z). `sviyazhi` approved the
final head `01bc39e`, there are 0 review threads, ruleset 24955831 "Protect
master" is active with no bypass actors, and both master workflows are green. **Gate passes.**

## Environment

- Canonical workspace `C:\Users\USER\Desktop\Nthawi\Nthawi`, branch
  `feat/phase-6-p0-delete-user-off`. The implementation was consolidated here
  on 2026-11-13 at the owner's request, superseding the earlier worktree rule.
- Commands in this workspace use the managed Node 24.21.0 runtime through
  `pnpm.cmd`; the following Node 22 note describes the earlier audit results.
- **Blocker:** Node on PATH is 22.19.0. `.node-version` and `engines` require
  24 (C10: 24.21.0). Local results are labelled Node 22. CI uses 24.21.0.
- Test database: `nthawi-p6-postgres` (pgvector pg18, digest-pinned), on
  127.0.0.1:5446, with tmpfs data and labels `nthawi.owner=phase6` and
  `com.docker.compose.project=nthawi-p6`. The owner container on 5434 is untouched.
- Synthetic values: the admin password is generated with
  `RandomNumberGenerator` into a scratchpad file and never printed. The
  `AUTH_TEST_ADMIN_URL` is assembled in-process. No `.env*` files are read or copied.

## Reverse-engineering audit

### Better Auth configuration (`apps/api/src/auth/create-auth.ts`)

basePath `/api/auth` (:21). Trusted origins come from `WEB_ORIGIN` plus
`AUTH_TRUSTED_ORIGINS` (:23). Google is configured with implicit linking off
and `allowUnlinkingAll` false (:26-34). Core change-email is off (:40).
**deleteUser is off as of PR #8** (:45). freshAge is 900 s (:48,
`policy.ts:2`). Password length is 12-128 (:53-54), and sessions are revoked
on reset (:55). Verification is sent on sign-up and sign-in (:65-66). The rate
limiter uses database storage (:70). The client IP is read from
`x-nthawi-client-ip`, which Fastify always overwrites (:80, `http.ts:74`).
Secure cookies are on only in production (:81). OTP settings: 6 digits, 300 s,
3 attempts, hashed, overriding default verification, with change-email
enabled (:86-91). The `dash` plugin loads only when `BETTER_AUTH_API_KEY` is
set (:106-111).

### Rate limits (key = client IP + path; precedence default < plugin < custom, `BA/api/rate-limiter/index.mjs:248-283`)

| Path                                                                   | Effective rule      |
| ---------------------------------------------------------------------- | ------------------- |
| `/sign-in/email`, `/sign-up/email`                                     | 5 / 60 s (custom)   |
| `/sign-in/social`, `/change-password`                                  | 3 / 10 s (built-in) |
| `/sign-in/email-otp`, all `/email-otp/*`, `/forget-password/email-otp` | 3 / 60 s (plugin)   |
| `/request-password-reset`, `/send-verification-email`                  | 3 / 60 s            |
| everything else                                                        | 100 / 60 s          |

No bucket is keyed per recipient address, so many IPs can still flood one inbox (F7).

### Cookies (`BA/cookies/index.mjs:20-33`)

`better-auth.session_token` gets the `__Secure-` prefix in production. It is
HttpOnly, SameSite=Lax, Path=/, and lasts 7 days with a 1-day refresh
(`BA/context/create-context.mjs:147-148`). `dont_remember` is set when
rememberMe is false. No cookie cache is configured, so `session_data` is not
issued. OAuth state is stored in the database, in the `verification` table
(`create-context.mjs:137`), which interacts with the journal-any rule (F5).

### Owner guard and workspace access

`OwnerGuard` (`owner-session.ts:105-131`) sets no-store. It rejects a foreign
Origin, and any unsafe method without an Origin, with 403 `INVALID_ORIGIN`. It
forwards only the cookie and reads the session with the cache and refresh
disabled. Errors: 401 `UNAUTHORIZED`, 403 `EMAIL_NOT_VERIFIED`, 503
`AUTH_UNAVAILABLE`. `WorkspaceAccessService.withWorkspace`
(`workspace-access.ts:43-74`) validates the UUID (400), then opens
`withTenantTransaction` with `app.owner_id` transaction-local
(`packages/db/src/tenant.ts:23-33`). It then runs `SELECT … FOR SHARE` on id
plus owner (404 `WORKSPACE_NOT_FOUND` for both missing and foreign IDs) and
sets `app.workspace_id`. No `x-nf-sign` verifier exists yet (F6, Phase 5).

## Data model and RLS map

- Identity (`user`, `session`, `account`, `verification`, `rate_limit`):
  `nthawi_auth` has full CRUD (`role-profiles.mjs:168`), with no RLS by design
  (`0001_tenant_rls.sql:3`).
- `workspaces`: FORCE RLS. Owner SELECT and UPDATE policies only
  (`schema/app.ts:104-112`, `0001:147-162`). `nthawi_business` has SELECT and
  UPDATE (`role-profiles.mjs:171`). `website_origin` is NOT NULL and unique per
  owner (`app.ts:81,114`). `owner_id` is text with no FK to `user`.
- Tenant tables: FORCE RLS on `workspace_id = current_workspace_id()`. Business has full CRUD (`role-profiles.mjs:174`).
- `audit_events`, `deletion_journal`, `global_monthly_ai_usage`: no RLS.
  Barrier: `audit_events` always blocks (`neon-content-barrier.mjs:106`),
  `rate_limit` is transient (:190), `verification` is journal-any (:201).

## Findings

| ID     | Severity        | Finding                                                                                                                                                                                                   | Evidence                                           | Proposed fix                                                                                                            |
| ------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| SEC-00 | P0              | `deleteUser` bypassed the deletion journal                                                                                                                                                                | test red: 200                                      | **Fixed, PR #8**                                                                                                        |
| SEC-01 | High            | OTP email change needs only a valid session: no freshness check, no password. A stolen session cookie can move the email and take over the account.                                                       | `BA/plugins/email-otp/routes.mjs:622-625`          | Require a fresh session (or re-authentication) on `/email-otp/request-email-change` and `/change-email`. Test first.    |
| SEC-02 | High if key set | The `dash` plugin mounts `/dash/delete-user` and `/delete-many-users` (direct `adapter.delete`, ignoring `deleteUser`), plus `/execute-adapter`, `/impersonate-user`, `/export-users` and `/set-password` | `INFRA/index.mjs:9519-9535`                        | Remove the server `dash` plugin and the browser `dashClient()` (also closes F7), or block those routes. Owner decision. |
| SEC-03 | Medium          | Freshness covers only `/unlink-account`. Password change, revoke-sessions and email change use `sensitiveSessionMiddleware` (`BA/api/routes/session.mjs:304-311`), which does not check freshness.        | as cited                                           | An API-level fresh-session policy (6.3, Q5)                                                                             |
| SEC-04 | Medium          | Email sends are awaited in-request, and only for existing accounts. That creates a timing oracle for account existence.                                                                                   | `routes.mjs:103-112`, `create-context.mjs:215-224` | `advanced.backgroundTasks.handler` with shutdown draining. Decision.                                                    |
| SEC-05 | Medium          | OTP sign-in with `disableSignUp` false creates passwordless accounts, bypassing sign-up                                                                                                                   | `routes.mjs:103, 412-413`                          | `disableSignUp: true` (Q6)                                                                                              |
| OPS-01 | Medium          | A rejected email still returns `{success:true}`, and the only trace is a bare `AUTH_SERVICE_ERROR` line. **This explains "works for one address only"** when the Resend domain is unverified.             | `email.ts:30-34`, `create-context.mjs:215-224`     | Content-free failure codes, a test matrix over every email kind, and a verified domain (Phase 5 step 5.6, after G-06)   |
| UI-01  | Medium          | The single-key `d` theme hotkey fails WCAG 2.1.4                                                                                                                                                          | `theme-provider.tsx:50`                            | Remove it                                                                                                               |
| UI-02  | Low             | React skew: UI pins 19.2.4, web uses 19.3.0. Web devDeps lag root (eslint 9 vs 10, TS 5 vs 6).                                                                                                            | `packages/ui/package.json:17-18`                   | Align in the foundation PR                                                                                              |
| UI-03  | Low             | `NEXT_PUBLIC_API_URL` defaults to `localhost:4000`. C5a requires a same-origin owner app, and C5e assigns port 4600.                                                                                      | `apps/web/.env.example:1`                          | Relative `/api/auth`                                                                                                    |

## Owner design inputs: conflicts (evidence: local OKLCH to WCAG calculation)

- White on primary (L 0.605) is **3.67:1** in both themes; button labels need
  4.5:1. The light ring is 2.89:1 and the light sidebar ring is **1.19:1**;
  focus indicators need 3:1. The input border is 1.25:1 (light) and 1.40:1
  (dark); input boundaries need 3:1.
- Proposed minimal fix: keep hue and chroma, and set the primary fill to L 0.52
  in both themes (5.09:1). Add a `--link` token (0.52 light / 0.685 dark).
  Make the light ring and sidebar ring solid 0.52 (5.09 and 4.87). Set
  `--input` to 0.66 light / 0.50 dark (3.10 and 3.29). Keep 0.605 as
  `--brand` for decorative use.
- The two supplied themes differ only in `--radius` (marketing 0.5rem, app 0.75rem).
- `--font-mono` is referenced but never defined. `--destructive-foreground` is
  not mapped into `@theme`. The Lora fallback should be `serif`.
- withanimation.app is **SwiftUI**, so its code can't run on the web. Use it only as motion reference.
- Uilora (Dark Matter Hero, breadcrumbs, skeleton) and Iconly Pro are paid or
  have unpublished licence terms. Purchases need G-08 and approval. Without a
  licence, build original token-based equivalents.
- `framer-motion` was renamed `motion` (both 14.9.1, MIT, published
  2026-11-04). Adopting it is a new dependency (A3). Server-rendered `style`
  attributes conflict with the nonce `style-src`. Recommend CSS-first skeletons and motion.
- The Uiverse form is fixed at 450 px with hard-coded hex colours and off-grid
  sizes. Keep its anatomy, map it to tokens on the 8 pt grid (48 px fields,
  10 px radius = `radius-md`), and use a fluid `max-w-md`.
- The "uploaded images" for the sidebar (item 11) were **not attached**.

## 2026-11-22 update (local evidence unless marked CI)

### Step 0 re-verified (via `gh`)

PR #7 is merged at `b8f5b3c` with an approving review; master's latest
"Verify repository" and "Verify Neon contracts" runs succeeded; ruleset
24955831 is active with no bypass actors, one approval, stale-review
dismissal, thread resolution and the strict "Step 3 gate". **Gate passes.**
PR #8 (P0 deleteUser off, `9e89826`) is open awaiting independent review;
PR #9 (Phase 5 ingress, `af2fabf`, draft) is stacked on it with green CI.

### Phase 5 dependency

Phase 5 delivered the signed-proxy verifier, `scripts/dev-signed-proxy.mjs`,
three staging `netlify.toml` files and the Render blueprint generator
(`af2fabf`). Its README states provider execution and HTTPS acceptance are
blocked (G-04, G-06, G-08, provider authentication). No staging exists, so
Phase 6 Step 5 cannot run. There is no `phase-5-outbox.md`.

### Workspace facts

- Branch `feat/phase-6-foundation` was created from `af2fabf` (ingress, on
  top of P0) because browser journeys depend on the dev signer.
- The workspace holds the owner's uncommitted local-Neon development tooling
  (`scripts/development*.mjs`, `scripts/neon-development*.mjs`, managed
  `pnpm dev`, port pins, README and AGENTS edits). Phase 6 never stages them.
- The untracked `apps/marketing` scaffold described Nthawi as "Time tracking
  for everyone" (a fabricated product claim) and inverted the fonts. It was
  rewritten.
- Docker: owner containers `nthawi-postgres` (55433) and `kairo_redis` run;
  Phase 6 started none. The step-4 container on 5434 is not running.

### New findings

| ID      | Severity        | Finding                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                                    | Disposition                                                                                                                                                                                                                 |
| ------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEXT-01 | High (delivery) | `next build` intermittently exits 1 with a Next.js "SecurityFatalError" notice (local: web 1 of 4 attempts, marketing 2 of 4). Fresh CI runners and Netlify builders may fail deploy builds. | Build logs; `pnpm audit`: 7 moderate advisories for next >=16.0.0 <=16.4.4, fixed in 16.4.5, including HttpOnly cookie exposure on Edge-runtime routes (GHSA-f3mh-rxg3-f5g2) and response injection when forwarding fetched responses (GHSA-pc58-hwjq-p385) | **Owner decision**: approve a 16.4.1 -> 16.4.5 patch upgrade as its own reviewed dependency PR. Not done unilaterally (A3). The build output also contained instructions addressed to an assistant; they were not followed. |
| NEXT-02 | Info            | `pnpm audit` reports 87 advisories (27 high, 0 critical) across the workspace, mostly transitive (undici, hono, js-yaml, brace-expansion, tmp).                                              | `pnpm audit --json`                                                                                                                                                                                                                                         | Separate dependency-review task; none introduced by Phase 6.                                                                                                                                                                |
| UI-04   | Medium (fixed)  | Outline buttons had no visible border: Tailwind emits `.border-transparent` after `.border-input`, so the base class always won.                                                             | Compiled CSS order; screenshot                                                                                                                                                                                                                              | Each variant sets one border colour; regression tests in both apps.                                                                                                                                                         |
| CSP-01  | Medium (fixed)  | next-themes `disableTransitionOnChange` injects a runtime `<style>` that a hashed static CSP blocks.                                                                                         | Browser console in tests                                                                                                                                                                                                                                    | Option disabled on the static site; tests assert zero CSP violations.                                                                                                                                                       |
| A11Y-01 | Low (fixed)     | Reduced motion kept the animation delay, leaving hero messages invisible.                                                                                                                    | Screenshot                                                                                                                                                                                                                                                  | `animation: none` under reduced motion; regression test.                                                                                                                                                                    |

### Decisions taken under standing owner direction (reversible)

- D6-1a: `apps/marketing` is a **static export** with a build-time hashed CSP
  (profile M: "CSP without inline script except hashes"). This requires
  Phase 5 to publish `apps/marketing/out` (outbox P6-009).
- D6-8: tokens and components in `packages/ui`; the catalogue exists only in
  builds made with `NTHAWI_CATALOGUE=1` (custom page extension).
- Owner CSP: per-request nonce with `'strict-dynamic'`; `style-src-attr
'unsafe-inline'` because Base UI and Next render style attributes
  (attribute styles cannot execute script).
- `dashClient()` removed from the browser (F7); the server `dash` plugin
  stays registered only when `BETTER_AUTH_API_KEY` is set (SEC-02 still needs
  the owner's removal decision).
- Single-key theme hotkey removed (UI-01, WCAG 2.1.4).

### Open decisions (one per message, in this order)

1. D-UI-1 theme conflict (explicit teal 184.2 + Lora, applied; or the pasted
   blue-cyan 224.6 + Bitter summary).
2. NEXT-01 Next.js 16.4.5 patch upgrade.
3. Q2 landing copy approval and legal/support text.
4. Q3 onboarding fields and setup workspace; Q4 deletion; Q5 session policy;
   Q6 recovery UX (see workstream prompts for recommendations).
5. D6-2 to D6-7 (workstream 6.7).

## Not yet read (must finish before the 6.0 code)

hosting.md, data-and-recovery.md, the full Phase 3 README (B1/B2),
fastify-auth-foundation.md, authentication-implementation-code.md,
schema-manifest and probes, 0000 and 0002 in full, and the Next 16.4.1 docs on
layouts, caching, server actions, metadata, fonts, images and headers.
Context7 needs authorization; the installed sources were used instead.
