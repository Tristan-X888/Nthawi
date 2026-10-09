# Nthawi authentication and environment setup

This guide covers the implemented server authentication foundation and the
account setup needed to supply real credentials. Source files are authoritative;
commands below are run from the repository root in PowerShell unless stated
otherwise. Do not put credentials in this document, screenshots, commits, or chat.

## 1. Understand the application boundary

The web application runs at `http://localhost:3000`, the widget at
`http://localhost:5173`, and the API at `http://localhost:4000`. Better Auth is
mounted on the API under `/api/auth`; its Google callback is therefore
`http://localhost:4000/api/auth/callback/google`. The development PostgreSQL
container maps host port **5433** to container port 5432.

The supplied example used port 5432 and pointed Better Auth at the web app.
Those values were corrected to match this repository. `DATABASE_URL` must use a
non-superuser runtime role. `DATABASE_MIGRATION_URL` is a separate administrator
connection used only by the migration runner.

Identity authentication and tenant authorization remain separate. Better Auth
manages users, passwords, OAuth accounts, sessions, verification records and
rate-limit records. It does not authorize arbitrary workspace IDs. Business
queries still use `withTenantTransaction` after server-side authorization.

Proceed when you understand which URL belongs to the browser, the API and the
database. Do not substitute the widget origin for the owner application's origin.

## 2. Files and startup flow

| File                                     | Responsibility                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/tooling/src/env.ts`            | Parses and validates the complete server environment, including exact extra auth origins.    |
| `packages/tooling/test/env.test.ts`      | Verifies defaults, coercion, invalid input and error redaction.                              |
| `packages/tooling/scripts/check-env.mjs` | Checks the private root `.env` without displaying values.                                    |
| `packages/db/src/index.ts`               | Creates a lazy PostgreSQL pool and typed Drizzle database.                                   |
| `packages/db/src/schema/index.ts`        | Exports the application and generated identity schema.                                       |
| `packages/db/src/schema/auth.ts`         | Better Auth CLI output for the selected auth configuration.                                  |
| `packages/db/drizzle.config.ts`          | Includes both schema families in migration generation.                                       |
| `apps/api/src/auth/auth.ts`              | CLI and runtime entry point; validates settings, then constructs the pool and auth instance. |
| `apps/api/src/auth/create-auth.ts`       | Configures the three sign-in methods, verification, rate limits and optional dashboard.      |
| `apps/api/src/auth/email.ts`             | Sends authentication emails through Resend with sanitized failures.                          |
| `apps/api/src/auth/http.ts`              | Bridges Better Auth on Fastify with scoped raw bodies and owner-app CORS.                    |
| `apps/api/src/app.module.ts`             | Registers pool cleanup as a Nest shutdown lifecycle hook.                                    |
| `apps/api/src/main.ts`                   | Starts Nest on the validated API port and closes resources on failure/shutdown.              |
| `apps/web/lib/auth-client.ts`            | Browser client for Google, password, OTP and dashboard integration.                          |
| `.env.example`                           | Safe server configuration template without real credentials.                                 |
| `apps/web/.env.example`                  | Public API URL template for the web client.                                                  |
| `apps/api/test/auth.integration.spec.ts` | Exercises the real HTTP adapter and PostgreSQL using captured test emails.                   |

`auth.ts` was created before invoking the requested CLI generation command.
It optionally loads the root `.env` with Node's `loadEnvFile`; variables already
injected by the deployment environment take precedence. It then calls
`loadServerEnv()`. Validation must succeed before pool/auth construction.
The pool connects lazily, so importing this configuration for code generation
does not query your database or send an email.

Shared packages compile to `dist` and expose JavaScript plus declaration files.
This makes imports work from both the CLI and the compiled Nest application;
production Node does not need to interpret shared TypeScript source. Turbo's
build dependencies prepare these packages before dependent checks.

## 3. How environment validation works

`serverEnvSchema` is a Zod object. Environment variables begin as strings.
`z.coerce.number()` converts numeric settings, `.int()` requires whole-number
counts, `.positive()` rejects zero and negative values, and `.default()` applies
only when a setting is absent. A blank number is invalid; it is not a request
for the default. The API port also cannot exceed 65535.

`ServerEnv = z.infer<typeof serverEnvSchema>` describes the validated output:
ports, budgets and counts are numbers, not strings. Consumers receive one typed
configuration object rather than repeatedly reading unvalidated `process.env`.
Unknown process environment variables are stripped from the returned object.

All requested fields are present. Defaults are:

| Setting                        | Default                   | Meaning                                       |
| ------------------------------ | ------------------------- | --------------------------------------------- |
| `NODE_ENV`                     | `development`             | Runtime mode.                                 |
| `API_PORT`                     | `4000`                    | API listening port.                           |
| `AUTH_TRUSTED_ORIGINS`         | empty                     | Optional exact browser origins for auth/CORS. |
| `OPENAI_CHAT_MODEL`            | `gpt-4.1-mini-2025-04-14` | Requested chat model configuration.           |
| `OPENAI_EMBEDDING_MODEL`       | `text-embedding-3-small`  | Requested embedding model configuration.      |
| `GLOBAL_AI_BUDGET_USD`         | `20`                      | Application budget configuration.             |
| `WORKSPACE_AI_REPLY_LIMIT`     | `100`                     | Application reply-limit configuration.        |
| `MAX_APPROVED_KNOWLEDGE_BYTES` | `1048576`                 | One MiB of approved knowledge.                |
| `MAX_WORKSPACE_MESSAGES`       | `10000`                   | Message-limit configuration.                  |
| `MAX_WEBSITE_SOURCES`          | `10`                      | Website-source-limit configuration.           |

`WEB_ORIGIN` and each optional comma-separated `AUTH_TRUSTED_ORIGINS` entry
must be HTTP(S) origins without credentials, paths, queries or fragments. A
trailing slash is normalized away. The API uses the combined exact list for
Better Auth origin validation and credentialed CORS. Database URLs must use
`postgres` or `postgresql`. Required strings cannot be blank or whitespace-only. The application
secret must have at least 32 non-padding characters. `EMAIL_FROM` accepts either a
mailbox or a display-name form such as `Nthawi <auth@your-domain.example>` and
rejects CR/LF characters. The optional `BETTER_AUTH_API_KEY` may be absent/empty;
a whitespace-only value is rejected rather than enabling a broken integration.

`loadServerEnv()` uses `safeParse`. On failure, it builds a fresh `Error` from
unique schema field paths only. It does not include the supplied values, Zod
messages, a parsed environment dump, or a nested Zod error cause. Example:

```text
Invalid server configuration: GOOGLE_CLIENT_ID, RESEND_API_KEY
```

The validator validates configuration; it does not implement the future AI
spending, ingestion or message quota enforcement. Those services must consume
these settings and enforce them when they are implemented.

## 4. Install and build

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd --filter @nthawi/tooling build
pnpm.cmd --filter @nthawi/db build
pnpm.cmd --filter @nthawi/api build
```

The application uses Better Auth and its Drizzle adapter at `1.7.6`, and the
dashboard plugin at `0.4.12`. The compatible `@better-auth/core` and
`@better-auth/utils` peer versions are explicitly pinned. Strict dependency
checks remain enabled; do not solve peer conflicts by disabling them.

`pnpm dlx auth init` asks to install `better-auth` by running `pnpm add` in its
current directory. From this monorepo root, pnpm correctly rejects adding an
application dependency to the workspace root. The API package already owns the
runtime dependency and auth implementation, so do not run the init wizard here
or accept its root install. For a genuinely new auth package, install into the
intended workspace package and run the wizard from that package:

```powershell
pnpm.cmd --filter @nthawi/api add better-auth@1.7.6
Push-Location apps/api
pnpm.cmd dlx auth@1.7.6 init
Pop-Location
```

Decline the wizard's duplicate install if the package is already present. For
this app, use the existing `apps/api/src/auth/auth.ts` and the documented
schema-generation command instead of creating a second `lib/auth.ts`.

Proceed when installation and all three builds succeed. Use `pnpm.cmd` on
Windows if PowerShell execution policy blocks the `pnpm.ps1` launcher.

## 5. Local secrets and templates

The root `.env` already contains the application secret generated with:

```powershell
pnpm.cmd dlx auth@latest secret
```

Its output was captured directly into the ignored file and was not printed.
Preserve this value. Generating a new secret on every startup breaks continuity
for data protected by the previous secret. `BETTER_AUTH_SECRET` is generated
locally; it is different from the Better Auth dashboard's project API key.

On a fresh checkout only, create the local files without overwriting existing
configuration:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
if (-not (Test-Path -LiteralPath apps/web/.env.local)) {
  Copy-Item -LiteralPath apps/web/.env.example -Destination apps/web/.env.local
}
git check-ignore .env apps/web/.env.local
```

`.gitignore` ignores private environment files and allows `.env.example` files.
Never use `git add -f` for a private environment file. Fill provider credentials
using your local editor or your deployment secret manager; do not paste them
into terminal commands, documents, or chat. Restart running processes after
changing server variables. Rebuild the web app after changing its public API URL.

## 6. Create the Better Auth dashboard project named Nthawi

1. Open [the Better Auth dashboard](https://dash.better-auth.com) and sign in to
   the account that should own Nthawi. Use the project creation/onboarding action.
2. In **Project Details**, enter `Nthawi`. Your supplied screenshot shows this
   step checked and **Setup Plugin** active. If that existing project is already
   Nthawi, continue it rather than creating a duplicate.
3. The **Install Plugin** step is implemented: both API and web packages include
   `@better-auth/infra`. The server mounts `dash()` when a project key is present;
   the web client includes `dashClient()`.
4. In **Environment Variables**, obtain the project API key and save it as
   `BETTER_AUTH_API_KEY` in root `.env` and later in the API deployment secrets.
   Never put this key in a `NEXT_PUBLIC_*` variable.
5. Complete the remaining provider/database setup in this guide, start the API,
   then use **Connect / Verify connection** in the dashboard. Supply the API base
   URL if prompted, not the web or widget URL. Follow the displayed connectivity
   requirements; a remote service cannot assume access to your computer's
   localhost. Use your deployed HTTPS API when external reachability is needed.
6. Confirm the project shows the intended instance before relying on dashboard
   data. A key being present in `.env` does not prove the connection succeeded.

Dashboard integration is optional for local authentication. Activity tracking
that adds a `lastActiveAt` column is explicitly disabled, keeping the schema
stable when the optional key is enabled. This implementation uses Resend for
email; enabling the dashboard does not switch email providers.

References: [Infrastructure setup](https://better-auth.com/docs/infrastructure/getting-started)
and [dashboard plugin](https://better-auth.com/docs/infrastructure/plugins/dashboard).

Proceed when you have either connected the intended dashboard project or
intentionally left its optional key blank.

### Expose the local API through ngrok

For the Better Auth dashboard to reach the local API, start the API, then expose
port 4000 with `ngrok http 4000`. Use the HTTPS origin ngrok assigns, without a
path, as `BETTER_AUTH_URL`. Configure the dashboard to connect to that API origin;
Better Auth is mounted at `/api/auth`. In Google's OAuth client, add
`https://<your-api-tunnel>/api/auth/callback/google` as an authorized redirect URI.

If the local web app also calls the API through ngrok, set
`NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to the same API origin, and ensure
`WEB_ORIGIN` in the root `.env` is the browser-visible web origin (normally
`http://localhost:3000`). `WEB_ORIGIN` is trusted by default. Add any other exact
browser origins, such as a separately tunneled web app, to the comma-separated
`AUTH_TRUSTED_ORIGINS`; these values control both Better Auth's trusted origins
and API CORS. Do not use a wildcard for a temporary tunnel. Restart the API and
web app after changing either environment file. Free ngrok hostnames can change,
so update `BETTER_AUTH_URL`, the web API URL, and Google's redirect URI together.

A direct browser request from a local web origin to a separately hosted ngrok API
is cross-site. Some browsers, especially Safari, may block its auth cookies. The
tunnel is sufficient for dashboard connectivity and OAuth callback reachability;
for reliable browser-session testing, keep the web and auth endpoints same-site
or proxy `/api/auth` through the web origin.

## 7. Create Google OAuth credentials

1. Open [Google Cloud Console](https://console.cloud.google.com), create/select a
   project named `Nthawi`, and open **Google Auth Platform**.
2. Complete **Branding** with the app name, support email and developer contact.
   Choose the appropriate **Audience**; for public customers, use External.
   While in Testing, add the Google accounts that will test sign-in.
3. Under **Data Access**, request only basic identity access for sign-in. This
   implementation does not need Drive, Gmail or Calendar permissions.
4. Open **Clients**, create a **Web application** client, and name it
   `Nthawi local web`. Set the JavaScript origin to `http://localhost:3000` when
   the form requests one. Set the authorized redirect URI exactly to
   `http://localhost:4000/api/auth/callback/google`.
5. Save the client ID as `GOOGLE_CLIENT_ID` and client secret as
   `GOOGLE_CLIENT_SECRET` in root `.env`. Keep the secret server-side.
6. For production, use a separate client with the real HTTPS web origin and API
   callback. Complete Google's publishing/verification requirements shown for
   your application before enabling public use.

The authorization request uses `BETTER_AUTH_URL` to construct the callback.
A different host, port or path can produce `redirect_uri_mismatch`.

References: [Google OAuth clients](https://support.google.com/cloud/answer/15549257)
and [Better Auth Google provider](https://better-auth.com/docs/authentication/google).

Proceed when your test account is allowed and both credentials and callback URI
match the API deployment you are testing.

## 8. Configure Resend and DNS

1. Sign in to [Resend](https://resend.com), open **Domains**, and add a domain or
   dedicated authentication-mail subdomain you control.
2. Copy the exact DNS records supplied for that domain to your DNS provider.
   Use the record types, names and values shown by Resend; do not invent values
   or remove existing mailbox records. Wait for verification to succeed.
3. Under **API Keys**, create a named key for Nthawi with **Sending access**,
   restricted to the verified sending domain where available. Save it as
   `RESEND_API_KEY`.
4. Set `EMAIL_FROM` to an address on that domain, for example
   `Nthawi <auth@accounts.your-domain.example>`. Replace the example domain with
   your verified domain. Avoid click tracking on password-reset emails.
5. Restart the API and request a verification code for your own test account.
   Check Resend delivery logs and your inbox; verify delivery, not just HTTP 200.

References: [verified domains](https://resend.com/docs/dashboard/domains/introduction)
and [API keys](https://resend.com/docs/dashboard/api-keys/introduction).

The sender posts a plain-text message to the fixed Resend API endpoint with a
10-second timeout. It never logs recipients, codes, reset URLs, API keys, provider
response bodies or raw network errors. Failures become the fixed message
`Authentication email delivery failed`. Test suites substitute an in-memory
sender and never send real email.

Proceed when DNS verification succeeds and a real test email reaches your inbox.

## 9. Configure OpenAI

1. Sign in to [the OpenAI API platform](https://platform.openai.com) and select
   the organization that owns the application.
2. Create a project named `Nthawi`; ask an organization owner if your account
   lacks project-creation permission.
3. In project settings, create a server/service-account API key with the
   permissions needed for the application's eventual chat and embedding calls.
   Save it as `OPENAI_API_KEY` in root `.env` and the server secret manager.
4. Configure API billing and review the project's model access and usage limits.
   Keep the requested model settings unless you deliberately change the AI
   implementation and validate compatibility.
5. Configure project spending controls and alerts in the dashboard. Where hard
   spend limits are available, explicitly select enforcement rather than
   assuming an alert stops requests. `GLOBAL_AI_BUDGET_USD=20` is an application
   setting and does not configure OpenAI's account controls.

References: [projects and keys](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)
and [current spend-limit controls](https://developers.openai.com/api/docs/guides/spend-limits).

No OpenAI request is made by authentication or schema generation. This work
validates its configuration only. Proceed when the application has an intended
project key, billing/access settings and an agreed spending policy.

## 10. Generate and migrate the identity schema

The requested command reads the actual auth configuration, including the OTP
plugin and database rate limiter, and writes Drizzle table definitions:

```powershell
pnpm.cmd dlx auth@latest generate `
  --config apps/api/src/auth/auth.ts `
  --output packages/db/src/schema/auth.ts `
  --yes
```

Generation requires the configuration to load successfully but does not need a
live database. During initial implementation, temporary process-only provider
placeholders were used for generation; they were not written into `.env` and
were never used for OAuth, email or AI calls. Normal runtime validation has no
placeholder fallback or generation bypass.

The generated file is not itself a database migration. Drizzle includes both
`app.ts` and `auth.ts`, then creates reviewed SQL and a matching snapshot:

```powershell
pnpm.cmd --filter @nthawi/db db:generate --name better_auth
pnpm.cmd --filter @nthawi/db db:check
pnpm.cmd --filter @nthawi/db build
```

Run generation after changing auth plugins/schema options, review the output,
and commit schema definitions, SQL, metadata and lockfile together. On an
unchanged checkout, generation should report no schema changes. Use matching
pinned Better Auth/CLI versions for repeatable future upgrades; `@latest` can
change over time.

The reviewed migration is `packages/db/drizzle/0002_better_auth.sql`.

Identity tables are `user`, `session`, `account`, `verification` and `rate_limit`.
`user` holds identity/profile data. `account` links providers and stores password
hashes for credential accounts. `session` stores sessions and expiration.
`verification` stores temporary proofs, including hashed OTPs. `rate_limit`
stores request counters. They receive no tenant workspace policy.

Reference: [Better Auth CLI](https://better-auth.com/docs/concepts/cli).

Proceed when the generated migration contains only the intended identity changes
and the existing tenant RLS migration remains intact.

## 11. Provision the local PostgreSQL runtime role

Start PostgreSQL with `pnpm.cmd db:up`. Existing Docker volumes retain their
original credentials even if the Compose example password later changes. Use
the actual administrator password for that instance; do not reset the volume.

Apply migrations using the separate migration connection. The runner reads
`DATABASE_MIGRATION_URL` from the process environment, so load it from your secret
manager or run the documented Node command with the local `.env`:

```powershell
pnpm.cmd --filter @nthawi/db exec node --env-file=../../.env scripts/migrate.mjs
```

Connect using an administrator (for local Compose):

```powershell
docker exec -it nthawi-postgres psql -U nthawi_dev -d nthawi
```

Create the runtime role once, then set its password interactively:

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
GRANT SELECT, UPDATE ON public.workspaces TO nthawi_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.assistants, public.knowledge_sources, public.knowledge_revisions,
  public.knowledge_chunks, public.widget_installations, public.visitor_sessions,
  public.conversations, public.messages, public.citations, public.ai_invocations,
  public.monthly_usage
TO nthawi_runtime;
```

If the role already exists, inspect it and correct its privileges instead of
recreating it. Do not grant membership in owner or bypass roles, table ownership,
TRUNCATE or all-table/default privileges. Operational tables remain privileged.

Put the runtime password in `DATABASE_URL`, using URL percent-encoding for reserved
characters. Keep the administrator URL in `DATABASE_MIGRATION_URL` only. Do not
use the Compose bootstrap superuser to serve tenant requests.

Proceed when migrations succeed and the runtime role has the explicit privileges
above without RLS bypass rights.

## 12. Run and exercise the authentication flows

Validate settings without printing them:

```powershell
pnpm.cmd --filter @nthawi/tooling env:check
pnpm.cmd --filter @nthawi/api start:dev
pnpm.cmd --filter @nthawi/web dev
```

The API's `/api/auth/ok` endpoint is a routing smoke check; it does not prove
Google credentials, email delivery or every database migration is correct.

The web client reads only `NEXT_PUBLIC_API_URL` from `apps/web/.env.local`. Server
secrets must never use the `NEXT_PUBLIC_` prefix. Use the exported `authClient`
from client components. The following calls describe the available flows; a
finished sign-in page is a separate UI feature.

```ts
// Google: redirect to Google, then return to the trusted owner application.
await authClient.signIn.social({
  provider: "google",
  callbackURL: window.location.origin,
})

// Password registration: no session is issued until email ownership is verified.
await authClient.signUp.email({ name, email, password })
await authClient.emailOtp.verifyEmail({ email, otp })
await authClient.signIn.email({ email, password })

// Passwordless email OTP sign-in; can also create a new verified account.
await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })
await authClient.signIn.emailOtp({ email, otp })

// Password recovery using an emailed code.
await authClient.emailOtp.requestPasswordReset({ email })
await authClient.emailOtp.resetPassword({ email, otp, password: newPassword })

// Session retrieval and sign-out.
await authClient.getSession()
await authClient.signOut()
```

Always handle each call's error result before advancing the UI. An OTP is valid
for five minutes and permits three failed verification attempts. Codes are
hashed at rest; a successful sign-in consumes the code. Passwords must be
12-128 characters and are hashed by Better Auth. Password reset revokes old
sessions. Database-backed rate limits apply even in development.

OTP verification is also used for password-account email confirmation. It is
configured through `overrideDefaultEmailVerification`, avoiding duplicate
verification-link and verification-code messages. A separate password reset
link callback is implemented for clients that later provide a reset-password
page and pass its trusted return URL.

Account management is configured in `apps/api/src/auth/create-auth.ts`; the
`auth.ts` entry point continues to load the environment and construct one shared
database pool. The Drizzle instance already carries the generated auth schema,
so the adapter resolves those tables without a second schema import.

Google sign-in does not implicitly link to an existing user with the same email.
That user must sign in with their existing method and explicitly link Google.
New Google users can still register. Unlinking the last account is prohibited.

Email changes use the OTP plugin's dedicated endpoints. The core
`user.changeEmail` link flow stays disabled: the verification override replaces
its link delivery with an ordinary verification code, which cannot complete a
change to a new address. Use these calls from an authenticated client and check
each error before continuing:

```ts
await authClient.linkSocial({
  provider: "google",
  callbackURL: window.location.origin,
})

await authClient.emailOtp.requestEmailChange({ newEmail })
await authClient.emailOtp.changeEmail({ newEmail, otp })

// Present a confirmation in the UI before calling this destructive operation.
await authClient.deleteUser()
```

The email address changes only after a valid code for that new address is
submitted. See Better Auth's [OTP email-change documentation](https://www.better-auth.com/docs/plugins/email-otp#change-email-with-otp)
and [account-linking documentation](https://www.better-auth.com/docs/concepts/users-accounts#account-linking).

`session.freshAge` is 900 seconds, not the session's expiry time. Deleting a user
without a password requires a session created within that window; Better Auth
also accepts the correct current password for a password account. Deletion
removes the identity and its accounts/sessions. Workspace ownership currently
uses a separate text identifier without an auth-user foreign key, so workspace
transfer and tenant-data cleanup still need a product-level lifecycle before
exposing deletion for workspace owners.

The widget origin is intentionally not trusted for owner authentication. CORS
allows credentials only for `WEB_ORIGIN`. An explicit HTTP origin check rejects
untrusted browser origins even on cookie-free requests; Better Auth also performs
its own CSRF checks. Requests without Origin remain supported for OAuth callbacks
and server clients. Do not replace these origins with `*` to fix a configuration error.

## 13. Automated checks and remaining external verification

```powershell
pnpm.cmd --filter @nthawi/tooling test
pnpm.cmd --filter @nthawi/api test
pnpm.cmd --filter @nthawi/api typecheck
pnpm.cmd --filter @nthawi/web typecheck
pnpm.cmd --filter @nthawi/db db:check
```

For integration tests, supply a **local test administrator** connection with
permission to create temporary databases and roles:

```powershell
$dbPort = (docker compose -f infra/compose.dev.yml port postgres 5432 | Select-Object -First 1).Split(':')[-1]
$env:AUTH_TEST_ADMIN_URL = "postgresql://nthawi_dev:dev-only-change-me@localhost:${dbPort}/postgres"
$env:RLS_TEST_ADMIN_URL = $env:AUTH_TEST_ADMIN_URL
pnpm.cmd --filter @nthawi/api test:integration
pnpm.cmd --filter @nthawi/db test:integration
```

Each suite creates and removes only its own randomly named database and roles.
The auth suite uses a non-bypass role and captures emails in memory. The tenant
suite verifies identity exclusion and the existing physical-connection reuse
regression. Google authorization URL tests do not redeem a real Google code.

These values match the running `infra/compose.dev.yml` service, including a
`POSTGRES_HOST_PORT` override; a separate disposable PostgreSQL server can use
different credentials and a different host port. Start Compose
with `pnpm.cmd db:up` and verify its health before testing. Both suites read
their test URLs directly from the process environment rather than loading the
root `.env`. The root `pnpm.cmd test:integration` command passes both variables
through Turbo's strict environment mode and disables integration-result caching.
See [database verification](database-verification.md) for the complete sequence,
extension checks, migration inspection, and runtime-role verification.

External readiness still requires a real Google consent/callback, a received
Resend message, any chosen dashboard connection, correctly provisioned runtime
credentials, and deployment secret configuration. The local `.env` can remain
incomplete until you obtain those values; the validator reports missing field
names and refuses to start rather than inventing credentials.

## 14. Read the implementation in execution order

1. **`auth.ts` loads configuration once.** Its URL is resolved relative to the
   module rather than the terminal's working directory, so CLI execution from
   the repository root and Nest execution from `apps/api` find the same local
   file. Existing process variables win over the file. The exported `auth`
   instance is the name consumed by Better Auth's CLI. The exported
   `serverEnv` is the same validated object used by the HTTP bootstrap.
   Prerequisite for advancing: all required server fields pass validation.

2. **`createDatabase()` constructs one pool and binds the full schema.** The
   pool permits up to ten connections and has a ten-second connection timeout.
   It opens connections only when a query is executed. Passing both schema
   families lets the adapter resolve generated identity table names without
   depending on an import cycle from the config to the generated file.
   Prerequisite for real requests: the runtime role, database and migrations
   must exist. A successful schema-generation command does not establish this.

3. **`createAuth()` is the reusable configuration factory.** Runtime passes the
   validated environment and real Drizzle database. Tests pass a database with
   the same migrated schema and a captured email sender. Both paths exercise
   the same auth configuration. `transaction: true` lets adapter operations
   use database transactions where Better Auth requests them. UUID identifiers
   agree with the CLI-generated schema.

4. **Google, password and OTP operate on the same identity system.** Google
   uses the configured OAuth client. Password registration requires verified
   email ownership before password sign-in; Better Auth performs password
   hashing. The OTP plugin supplies passwordless sign-in and email verification,
   with six-digit codes, a five-minute lifetime, three allowed failures and
   hashed code storage. The verification override makes password-account
   verification use the same email sender and OTP mechanism. These sign-in
   methods authenticate users; none grants access to a supplied workspace ID.
   Prerequisite for advancing in a browser: Google must accept the exact
   callback, or Resend must deliver the requested verification email.

5. **Recovery and abuse controls are configured explicitly.** The password
   reset callback sends a link through Resend. The OTP plugin also supports
   code-based recovery. Password resets revoke existing sessions. Rate limits
   are enabled even in development and stored in `rate_limit`, sharing counters
   across API processes that use the same database. The global rule is 100
   requests per 60 seconds; password sign-in and signup have a five-request
   rule, and reset-link requests have a three-request rule. OTP endpoints also
   use the plugin's rules, tested here for repeated code requests. Before
   deploying behind a proxy, configure and verify trusted forwarding/IP headers
   for that hosting environment; IP limits depend on reliable client addresses.

6. **`email.ts` owns the provider boundary.** Its dependency-injected `fetch`
   function makes payload and error handling testable without network delivery.
   The bearer token is sent only to Resend's fixed HTTPS endpoint. The payload
   contains a single recipient, subject and plain text. The timeout bounds a
   stalled provider call. Errors are replaced with a fixed message without
   attaching the original exception. This prevents provider responses or
   network error details from becoming application error messages.

7. **`http.ts` mounts Better Auth on Nest/Fastify.** Owner CORS is registered
   before the auth routes. An encapsulated Fastify plugin reads JSON and form
   bodies as bounded bytes; ordinary Nest controllers keep their normal parsers.
   `fromNodeHeaders` bridges headers into a Fetch Request using the configured
   public API origin. Supplied Host/forwarding headers cannot choose that origin.
   The Origin guard accepts the configured web/API origins and rejects other
   supplied origins; OAuth and server requests may omit Origin. Better Auth's
   status, body, redirect and separate Set-Cookie values are preserved.

8. **`main.ts` and `AppModule` own server lifetime.** Nest uses Fastify and listens
   on `0.0.0.0` at the validated API port. Proxy trust defaults to disabled;
   `API_TRUST_PROXY` accepts an explicit comma-separated IP/CIDR allowlist.
   The bridge overwrites its internal client-IP header with Fastify's resolved
   IP, which is the only IP header Better Auth uses for rate limiting.
   Shutdown and initialization/listen failures close the shared database pool.
   The placeholder Observe integration was removed. Automatic request logging
   is disabled because auth URLs can contain OAuth codes; bridge failures log
   only a generated request ID and a fixed message, never bodies or exceptions.

9. **The browser client contains only public configuration.** `auth-client.ts`
   is a client module and reads the public API URL, with the OTP and dashboard
   client plugins registered. It never imports the server environment or
   database. Browser calls use the API's cookie/session protocol. The UI must
   handle unsuccessful results and only advance after each operation succeeds.
   A complete login page, protected product screens and workspace provisioning
   are separate features from this authentication foundation.

10. **SQL is the persisted contract.** `0002_better_auth.sql` creates five
    identity tables, unique email/session-token/rate-limit-key constraints,
    user foreign keys with cascade cleanup, and lookup indexes. It does not
    modify tenant policies. Drizzle snapshots and journal entries track the
    generated state. The existing tenant migration still forces RLS and the
    transaction helper sets both settings with `set_config(..., true)`.
    Prerequisite before application use: apply the migrations with the
    migration connection and grant only the required privileges to runtime.

## 15. Verification recorded for this implementation

- Environment validator: 16 passing tests, including value-redaction checks.
- API unit tests: 4 passing tests, including sanitized email failures.
- Auth HTTP/PostgreSQL integration: 13 passing tests covering routing, preflight,
  Google authorization URL construction, verified password sign-in, OTP
  sign-in/replay prevention, both reset flows, origin rejection, rate limits,
  explicit Google linking, last-account unlink protection, OTP email changes
  and account deletion with the fifteen-minute freshness boundary.
- Tenant PostgreSQL integration: 19 passing tests, including real pooled
  connection reuse, commit/rollback cleanup and identity-table exclusion.
- Tooling/database/API builds and API/web type checks passed.
- Drizzle metadata check passed; repeat generation reported no schema changes.

Tests used a disposable PostgreSQL 18 instance and generated temporary databases
and roles. No Google authorization code was redeemed, no real email was sent,
no OpenAI API call was made, and no application database was migrated.

The local environment check passed during the account-management update on
2026-10-02 without printing values. Structural validation does not establish
database connectivity, Google consent/callback success or Resend delivery.
The optional Better Auth dashboard key is needed only if connecting that service.
The Google linking regression uses locally signed test tokens and mocks only
Google's public-key endpoint; no external Google account or email was used.

## 16. Full implementation code

The [complete code appendix](authentication-implementation-code.md) contains the
full source for all authentication/environment implementation files, generated
identity schema and SQL, runtime integration, client, tests and configuration
templates. Each entry links to its source and records its normalized SHA-256
hash so this handoff snapshot can be checked against the repository.

The disposable integration-test container was stopped after verification.
Private environment files and generated secret values are excluded from the appendix.
