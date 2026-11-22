# Phase 6 workstream prompts (for separate chats)

Each prompt below starts one Phase 6 workstream in its own chat. Paste the
**shared preamble**, then the workstream prompt, then Block C from
`docs/plans/2026-11-05-phase-5-handoff.md`. Run them in this order; a later
workstream starts only after the earlier one's PR is reviewed:

1. 6.7 API contracts and data foundation (shared by everything after it)
2. 6.2 Account pages, email and Google flows
3. 6.3 Sessions and security
4. 6.4 Onboarding and 6.5 Workspace CRUD (6.5 first if onboarding creates the first workspace)
5. 6.6 Settings
6. 6.1 Landing completion (any time after the owner supplies approved copy and legal text)

## Shared preamble (paste first in every chat)

```text
You are a Phase 6 workstream lead for Nthawi.io: senior full-stack engineer
(Next.js 16.4.1 App Router, React 19.3, NestJS on Fastify, Better Auth 1.7.7,
Drizzle, PostgreSQL RLS, Playwright, accessibility). Workspace:
C:\Users\USER\Desktop\Nthawi\Nthawi (AGENTS.md: work only here; never read
.env* or .anchor/; preserve the owner's uncommitted files and never stage them).
Base your topic branch on the latest accepted Phase 6 branch named in
coordination\phase-6-outbox.md; stage files explicitly, never git add -A.

Before code, read: AGENTS.md and apps/web/AGENTS.md, then the bundled Next.js
guides in node_modules/next/dist/docs for every API you use;
docs/product/phase-6/design-system.md (binding: tokens, components, sidebar,
forms, states, voice); docs/product/phase-6/agent.md (audit, findings,
decisions); docs/release/v0.3/release-specification.md (binding contract);
docs/infrastructure/phase-3/hosting.md profiles M/O/A; the Base UI docs bundled
in node_modules/@base-ui/react/docs for any primitive you wrap.

Rules: build UI only from @workspace/ui components and tokens; add missing
components to packages/ui with a catalogue entry and tests, and update
design-system.md in the same change. No new npm dependency, provider action,
Neon connection or real email without the owner's explicit approval in your
chat. Legal or commercial wording beyond v0.3 comes from the owner: use marked
placeholders. Tests first (show red, then green). Every local browser journey
runs through scripts/dev-signed-proxy.mjs with the local API (port 4600), web
(3600), signer (8896), a labelled disposable PostgreSQL 18 container
(nthawi.owner=phase6) and Mailpit; never the owner's containers or Neon.
PowerShell: check $LASTEXITCODE after every native command; Node 24.21.0
(C:/Users/USER/AppData/Local/pnpm/nodejs/24.21.0 first on PATH); pnpm.cmd.
Next.js 16.4.1 builds intermittently stop on a security notice until the owner
approves the 16.4.5 patch upgrade: rerun the build once and report it.
One decision per message, recommended option first. Do not merge. Stop at
the end of your workstream with evidence (commands, exit codes, test counts,
screenshots, isolation report) and an outbox entry.
```

## 6.7 API contracts and data foundation

```text
WORKSTREAM 6.7 — API contracts and data foundation (Phase 6, plan page 10).

Goal: the shared server conventions every later workstream uses, before any
account or workspace route exists.

Decide with the owner first (one per message, with your recommendation):
D6-2 data access (Server Components read owner data only through the
same-origin signed path; client mutations by same-origin fetch or server
actions; no shared caching of authenticated data). D6-3 shared zod contracts in
packages/contracts consumed by API and web. D6-5 API conventions:
Idempotency-Key semantics and retention, 409 optimistic concurrency with a
version field, cursor pagination, the error envelope {code, message,
correlationId} with a stable code catalogue, OpenAPI for every /api/v1 route.
D6-7 audit_events governance: content-free event contract (actor, action,
resource type/id, outcome, request ID; no emails, IPs, tokens or bodies),
retention period, purge job owner, export classification change in
scripts/neon-content-barrier.mjs with a reviewed fingerprint (P4-D09), and the
verification-row purge needed before account deletion (journal-any rule).

Build: packages/contracts error/pagination/idempotency schemas; a Nest
exception filter producing the envelope with request.id as correlationId and
no internals; an idempotency store (migration 0003+, Block C5f: schema,
migration, manifest, probes, role grants, FORCE RLS, tenant-negative tests,
classification); OpenAPI generation and a contract test; the audit writer
(first writer ships with its classification). Apply SEC-01/SEC-03 fixes only if
the owner approves the policy (fresh session for email change, password change
and revoke-all).

Done when: integration tests on a disposable PostgreSQL with the real
nthawi_auth and nthawi_business roles pass (owner A allowed, owner B denied,
missing tenant context denied, replayed idempotent request returns the original
result, conflicting reuse of a key returns 409); test:neon-readiness stays
green with the new classification; OpenAPI validates.
```

## 6.2 Account pages, email and Google flows

```text
WORKSTREAM 6.2 — Account pages, email and Google (Phase 6).

Decide first: Q6 recovery by OTP or link (recommend OTP: same accessible input
as verification, no URL tokens in mail logs); handling of a Google sign-in
whose email matches a password account (implicit linking is off: recommend a
"sign in with your password, then link Google in Security" screen);
SEC-05 disableSignUp for OTP sign-in (recommend true); SEC-04 timing oracle:
background email sending with shutdown draining (recommend yes); F7 sign-in
verification emails: a per-address cooldown (recommend 60 s, content-free).

Pages (apps/web, route group (auth), design-system forms section): sign-up,
verify by OTP (one input, inputmode numeric, autocomplete one-time-code,
resend cooldown, expired, invalid and too-many-attempts states), sign-in with
email/password and "Continue with Google", forgot and reset, Google callback
error and account-linking screens, sign-out. Same response and similar timing
for known and unknown emails; 429 explains when to retry; password-manager
friendly autocomplete; safe relative return paths (apps/web/lib/return-path.ts).

Email: every auth email kind (verification, sign-in OTP, reset, change email)
must reach any recipient in development (Mailpit) and staging (after Phase 5
step 5.6). Add content-free delivery-failure classification (P6-002): a
rejected send is logged with a code, never the address or OTP.

Done when Playwright journeys pass through the dev signer: sign up, verify,
sign out, sign in, forgot then reset, every error state; Google in CI asserts
the exact client ID, redirect URI on the owner origin, state, PKCE S256 and
scopes, stopping at Google; axe clean in both themes; screenshots at every width.
```

## 6.3 Sessions and security

```text
WORKSTREAM 6.3 — Sessions and security (Phase 6).

Decide first: Q5 session policy (lifetime, freshAge for sensitive actions,
whether a password change signs out other sessions, maximum sessions).
Recommend: keep 7-day sessions with daily refresh, 15-minute freshness for
password, email and Google link/unlink, sign out other sessions on password
change, no maximum.

Build (apps/web settings/security and settings/sessions, API under
/api/v1/sessions and /api/v1/account): active sessions list with the current
one marked (device and browser family only; no IP geolocation), revoke one,
revoke all others; password change; email change by OTP; link and unlink
Google (never remove the last sign-in method); fresh-session
re-authentication dialog; global 401 handling with a safe return path;
no-store so back-navigation after sign-out never shows authenticated content.
Audit events per D6-7 (sign-in, sign-out, password change, email change,
session revocation, account linking).

Done when: two-context Playwright test shows revoking the other session signs
it out; password change and email change journeys pass; back button after
sign-out shows the sign-in page; isolation tests prove one owner cannot list or
revoke another's sessions.
```

## 6.4 Onboarding

```text
WORKSTREAM 6.4 — Onboarding after the first verified sign-in (Phase 6).

Decide first: Q3 pre-payment onboarding fields (recommend: display name,
business name, website origin, timezone default Africa/Blantyre, language
English) and whether an unpaid owner may create a non-active "setup" workspace
and how many (recommend one setup workspace; active admission stays with Phase
7 under the 2-active-workspace limit).

Build: a short stepper (profile basics, first workspace, next steps) using the
design-system forms, progress ring and card selectors; server-stored,
resumable, idempotent progress (6.7 idempotency); a next-steps checklist where
later-phase items (knowledge, widget, billing) are visibly locked with an
honest "available in a later release" state; the sidebar setup card shows real
progress.

Done when: interrupted onboarding resumes at the right step after sign-out and
sign-in; repeated submissions create nothing twice; keyboard-only completion;
axe clean; screenshots.
```

## 6.5 Workspace CRUD

```text
WORKSTREAM 6.5 — Workspace CRUD (Phase 6).

Decide first: D6-4 creation without a privileged API role. Recommend a
SECURITY DEFINER function in app_private owned by a NOLOGIN role, fixed
search_path, current_owner_id() check, atomic per-owner limit under an
advisory lock, EXECUTE granted only to nthawi_business; deletion per D6-6
(soft delete with immediate denial and a journal entry; purge in Phase 8).
Which workspace fields are editable now (recommend name, website origin,
timezone, language, support contact; country MW and currency MWK fixed).

Build: list (empty, partial, at limit), create, view, rename, delete with a
typed-confirmation AlertDialog; a keyboard-accessible workspace switcher in the
sidebar's bottom row; routes /w/[workspaceId]/... authorised on the server on
every request; another owner's ID returns exactly the missing-ID page;
optimistic UI with rollback; migrations 0003+ under expand/contract with
everything Block C5f requires.

Done when: two concurrent creates at the limit let exactly one succeed;
owner B guessing owner A's workspace ID gets the same 404 as a random ID;
FORCE RLS holds on every new table; grants match role-profiles.mjs; migrations
run on a fresh database and on a 0002 database with data.
```

## 6.6 Settings

```text
WORKSTREAM 6.6 — Settings (Phase 6).

Decide first: Q4 account deletion now (recommend (a): no self-service
deletion yet; show an honest "contact support to delete your account" state
until the D6-6 workflow exists). Profile fields shown (recommend name and
email only; no avatar upload in Phase 6).

Build following design-system section 12: account (profile, email, password,
linked accounts, sessions, deletion per Q4), workspace settings (approved
fields from 6.5), appearance (ThemeSelector: light, dark, system). Group
settings in labelled categories with icons and plain labels; search only if a
list exceeds 6-8 items; sub-pages for less frequent settings.

Done when: every setting saves with a visible confirmation (toast for
background saves, inline errors for failures), 409 conflicts are explained,
and axe, keyboard and screenshot checks pass.
```

## 6.1 Landing completion

```text
WORKSTREAM 6.1 — Landing completion (Phase 6). The landing structure, hero,
pricing and placeholders already exist in apps/marketing (static export with a
build-time hashed CSP in out/_headers).

Needs from the owner: approved landing copy (Q2), terms, privacy, refund and
cookie text, the support contact (after G-06), and the production go-live
decision. Replace every data-placeholder="owner-text" block; add a release
check that fails a production build if any placeholder remains; enable
canonical URLs, Open Graph images and the sitemap for production only.

Measure LCP, CLS and INP on throttled mobile (Lighthouse or WebPageTest
against a local preview with Netlify-equivalent headers) and propose budgets
for approval. Phase 5 must publish apps/marketing/out (not .next) and set
NEXT_PUBLIC_SITE_ENV per environment (outbox request P6-009).
```
