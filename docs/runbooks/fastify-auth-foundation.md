# Fastify authentication foundation

This runbook describes the implemented HTTP/authentication foundation. The
business modules and `/api/v1` routes have a separate design and are not supplied
by this transport migration.

## 1. Keep configuration in one place

`packages/tooling/src/env.ts` owns server environment validation. The API's
`auth/auth.ts` loads the optional repository-root `.env`, preserves injected
deployment values, validates configuration, and creates one shared database
pool and Better Auth instance. Do not add a second parser under the API.

Build shared packages before running the API directly:

```powershell
pnpm.cmd --filter @nthawi/tooling build
pnpm.cmd --filter @nthawi/db build
pnpm.cmd --filter @nthawi/tooling env:check
```

The existing `.env.example` documents required credentials. No credentials were
generated or changed by this migration. Environment validation checks structure;
it does not verify provider credentials or database connectivity.

## 2. Configure origins and proxy trust

For local development:

```dotenv
WEB_ORIGIN=http://localhost:3000
WIDGET_ORIGIN=http://localhost:5173
BETTER_AUTH_URL=http://localhost:4000
API_PORT=4000
API_TRUST_PROXY=
```

Blank `API_TRUST_PROXY` disables proxy trust. Behind a reverse proxy, specify only
its actual IPs/CIDRs, separated by commas. For example, `127.0.0.1/32,::1/128`
trusts a proxy on loopback. That example is not a generic hosting configuration.
Boolean blanket trust, hop counts, malformed addresses, empty list entries, and
zero-prefix networks are rejected. Restrict direct network access to the API
and have the proxy overwrite incoming forwarding headers.

Fastify determines `request.ip` from the socket and configured trusted chain.
The auth bridge overwrites `x-nthawi-client-ip`; Better Auth reads only that
header for IP-based rate limits. A caller cannot choose its rate-limit identity
by supplying that header directly.

The configured `BETTER_AUTH_URL` determines Fetch Request URLs. Incoming Host,
Forwarded, and X-Forwarded-Host/Proto values cannot select a different auth origin.

## 3. Understand HTTP startup and parsing

`main.ts` creates a `NestFastifyApplication` using the official `FastifyAdapter`.
It registers the auth bridge before initialization/listening, enables shutdown
hooks, and listens on `0.0.0.0` at `API_PORT`.

The bridge registers credentialed CORS for `WEB_ORIGIN`, the documented methods,
and `content-type`, `authorization`, and `idempotency-key` request headers. CORS
preflight does not invoke authentication. Supplied untrusted origins are also
rejected by an explicit auth-route hook, including requests without cookies.
OAuth callbacks and server clients can omit Origin.

The `/api/auth/*` GET/POST routes live inside an encapsulated Fastify plugin.
JSON and form bodies are read as bytes, capped at 1 MiB, and passed to Better
Auth with their original content type. This preserves Unicode, falsy JSON, and
form encoding without a JSON stringify round trip. Other Nest controllers retain
normal JSON/body parsing.

Better Auth's response status, redirect, content type and body are forwarded.
`Headers.getSetCookie()` supplies separate cookie values, preserving expiry
commas. Empty responses remain empty; lengths are calculated for the actual body.

## 4. Preserve the authentication policy

The existing `create-auth.ts` factory still configures Google, verified password
sign-in, passwordless OTP, password reset, database-backed rate limits, and the
optional Better Auth dashboard plugin. Existing password/OTP policy and UUID
identity schema are unchanged by the transport migration.

Account management requires explicit provider linking, protects the last login
account, uses the OTP plugin for email changes, and uses a fifteen-minute session
freshness window. See [authentication setup](authentication-setup.md) for client
calls and the distinction between identity deletion and tenant-data cleanup.

## 5. Keep sensitive data out of logs

The bridge never logs request bodies, headers, auth URLs, or exception messages.
It logs a generated request ID and a fixed failure message, and returns a fixed
`AUTH_FAILURE` response for unexpected exceptions. Better Auth's normal error
responses retain their original status and payload.

Automatic Fastify request logging is disabled because OAuth callback URLs can
contain codes. The unused Observe integration with placeholder credentials was
removed from application startup; production telemetry remains a separately
configured and reviewed integration.

## 6. Close resources on every exit path

`AppModule.withAuthDatabase()` registers pool cleanup through Nest's shutdown
lifecycle. Initialization/registration/listen failures close the app, or the
pool directly if Nest creation failed. The top-level bootstrap is awaited so
startup failures produce a failed process rather than a detached promise.

## 7. Verify locally

```powershell
pnpm.cmd --filter @nthawi/tooling test
pnpm.cmd --filter @nthawi/api test
pnpm.cmd --filter @nthawi/api test:e2e
pnpm.cmd --filter @nthawi/api typecheck
pnpm.cmd --filter @nthawi/api lint
pnpm.cmd --filter @nthawi/api build
```

For the PostgreSQL suite, set `AUTH_TEST_ADMIN_URL` to a disposable local
PostgreSQL administrator connection and run:

```powershell
pnpm.cmd --filter @nthawi/api test:integration
```

The suite creates and drops its own randomly named database and role, runs
migrations, serves requests through Nest/Fastify, and captures emails in memory.
Only Google's public-key endpoint is mocked for the signed-token linking test.

Start the API with `pnpm.cmd --filter @nthawi/api start:dev`. Check
`http://localhost:4000/api/auth/ok`, then exercise the documented auth client
flows. The routing smoke endpoint does not prove database or provider readiness.
Real Google consent/callback and received Resend emails remain manual external
checks.

## References

- [Better Auth Fastify integration](https://www.better-auth.com/docs/integrations/fastify)
- [Nest Fastify adapter](https://docs.nestjs.com/techniques/performance)
- [Fastify proxy trust](https://fastify.dev/docs/latest/Reference/Server/#trustproxy)
- [Fastify reply handling](https://fastify.dev/docs/latest/Reference/Reply/)
