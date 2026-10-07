# Better Auth Infrastructure: verified sources and implementation implications

Research date: 7 October 2026. This document records source findings for the repository implementation guide. It does not enable services, purchase a plan, connect a dashboard, deploy software, or establish production readiness.

## Scope and subscription meaning

The requested subscription means Better Auth Infrastructure premium features. The open-source authentication framework remains self-hosted; Infrastructure adds an external management and services layer. Application hosting, the identity database, application authorization, mail delivery configuration, deployment, and recovery remain implementation responsibilities. [Official Infrastructure introduction](https://better-auth.com/docs/infrastructure/introduction), [official pricing](https://better-auth.com/pricing).

Customer subscription billing is a separate optional integration using `@better-auth/stripe`, not a requirement for an Infrastructure subscription. No Stripe implementation is needed for this request. [Official Stripe plugin](https://better-auth.com/docs/plugins/stripe).

## Public pricing snapshot

Verify the account's current checkout and entitlements before purchasing; these figures are a public-page snapshot, not a contractual quote. [Official pricing](https://better-auth.com/pricing).

| Item                      | Starter    | Pro                                   | Enterprise |
| ------------------------- | ---------- | ------------------------------------- | ---------- |
| Base price                | $0/month   | $20/month                             | Custom     |
| Dashboard seats           | 1          | Unlimited                             | Custom     |
| Audit events/month        | 10,000     | 20,000; then $0.0001/event            | Custom     |
| Audit retention           | 1 day      | 7 days                                | Custom     |
| Security detections/month | 1,000      | 10,000; then $0.001/event             | Custom     |
| Transactional email       | Not priced | $0.001/email                          | Custom     |
| Transactional SMS         | Not priced | $0.09/SMS                             | Custom     |
| SSO connections           | Not priced | 1 included; then $50/month/connection | Custom     |
| Directory connections     | Not priced | 1 included; then $50/month/connection | Custom     |
| Custom dashboard domain   | Not priced | $25/month add-on                      | Custom     |
| Log drain                 | Not priced | $25/month add-on                      | Custom     |

The pricing comparison's extracted feature cells lose visual checkmarks. Do not infer every feature's exact tier from blank extracted cells. The getting-started guide places `sentinel()` on Pro or higher, while pricing lists a Starter detection allowance. Treat Starter enforcement access as an entitlement to confirm in the actual account. [Getting started](https://better-auth.com/docs/infrastructure/getting-started), [pricing](https://better-auth.com/pricing).

## Installed versions and compatibility

Repository manifests already pin `better-auth` and `@better-auth/core` to `1.7.6`, `@better-auth/infra` to `0.4.12`, and `@better-auth/utils` to `0.4.2`; the API also pins `@better-auth/drizzle-adapter` to `1.7.6`. The plugin is installed in both API and web workspaces. Repeating an unversioned installation would be unnecessary and could change the lockfile. [API manifest](../../apps/api/package.json), [web manifest](../../apps/web/package.json).

The installed `@better-auth/infra@0.4.12` manifest declares peers `better-auth >=1.4.0`, `@better-auth/core >=1.4.0`, and `zod >=4.1.12`. Native/Expo peers are optional. Its development manifest uses Better Auth `1.7.6`; its utility dependency is `^0.4.2`. This supports compatibility of the selected versions, but peer ranges do not prove functional correctness. The normal lockfile install, build, typecheck, and integration checks remain necessary. [Installed published manifest](../../apps/api/node_modules/@better-auth/infra/package.json), [official package listing](https://www.npmjs.com/package/@better-auth/infra).

Live docs display framework `1.7.7`. Keep the repository's selected version as the implementation baseline and inspect the installed source when live documentation conflicts with it. In particular, the live dashboard endpoint table differs from the installed `0.4.12` routes. [Dashboard docs](https://better-auth.com/docs/infrastructure/plugins/dashboard), [installed declarations](../../apps/api/node_modules/@better-auth/infra/dist/index.d.mts).

## What is already mounted

For repeatable schema generation, the published `auth@1.7.6` CLI manifest pins Better Auth, core and telemetry to `1.7.6` and utils to `0.4.2`; its Node requirement is `>=22.12.0`. Use the repository's Node 24 baseline and `pnpm.cmd dlx auth@1.7.6 generate`, then the existing Drizzle migration workflow. Direct CLI migration is documented for Kysely, not this Drizzle setup. The registry was read without installing the package. [Published CLI manifest](https://registry.npmjs.org/auth/1.7.6), [official CLI documentation](https://better-auth.com/docs/concepts/cli).

The API's existing `createAuth()` imports `dash` from `@better-auth/infra` and includes it only when parsed server configuration contains `BETTER_AUTH_API_KEY`. It explicitly disables activity tracking. The web client's existing module imports `dashClient` from `@better-auth/infra/client` and includes `dashClient()` beside `emailOTPClient()`. Adding another auth server or a Next.js auth route would duplicate the established Fastify integration. [Server configuration](../../apps/api/src/auth/create-auth.ts), [web configuration](../../apps/web/lib/auth-client.ts).

The documented imports are valid:

```ts
import { dash, sentinel } from "@better-auth/infra"
import { dashClient, sentinelClient } from "@better-auth/infra/client"
```

`dash()` links dashboard operations and event collection. `sentinel()` supplies security checks; its client counterpart handles identification and challenges. They can be installed independently. [Official getting started](https://better-auth.com/docs/infrastructure/getting-started), [installed exports](../../apps/api/node_modules/@better-auth/infra/package.json).

A subscription and API key do not enable every feature automatically. In this repository, setting the key activates the existing server Dashboard plugin after restart/redeployment; it does not install Sentinel, organization, SSO, SCIM, or change the email transport. [Existing configuration](../../apps/api/src/auth/create-auth.ts), [installed plugin wiring](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs).

## Dashboard connection, exact authentication, and reachability

The official onboarding prerequisites are a working Better Auth instance and a project API key from the Infrastructure dashboard. `BETTER_AUTH_API_KEY` belongs in server configuration. The API origin and `/api/auth` mount must point to the existing auth handler. The server secret `BETTER_AUTH_SECRET` serves a different purpose and must not be replaced by the Infrastructure key. [Getting started](https://better-auth.com/docs/infrastructure/getting-started), [existing configuration](../../apps/api/src/auth/create-auth.ts).

Installed `0.4.12` source verifies these endpoints:

| Endpoint relative to `/api/auth` | Method | Installed behavior                                                     |
| -------------------------------- | ------ | ---------------------------------------------------------------------- |
| `/dash/validate`                 | GET    | Onboarding validation; signature and project key hash checks           |
| `/dash/config`                   | GET    | Returns redacted auth configuration after Dashboard JWT authentication |
| `/dash/list-users`               | GET    | User listing; Dashboard JWT authentication                             |
| `/dash/create-user`              | POST   | User creation; Dashboard JWT authentication                            |
| `/dash/update-user`              | POST   | User update; Dashboard JWT authentication                              |
| `/dash/delete-user`              | POST   | User deletion; Dashboard JWT authentication                            |
| `/dash/set-password`             | POST   | Privileged password operation; Dashboard JWT authentication            |
| `/dash/execute-adapter`          | POST   | Adapter reads/counts/creates/updates; Dashboard JWT authentication     |
| `/events/audit-logs`             | GET    | Session-authorized audit queries                                       |
| `/events/all-audit-logs`         | GET    | Session-authorized organization administrator/owner audit queries      |

Use the installed endpoint metadata to confirm methods before constructing smoke tests; the live reference describes differently named routes. [Installed declarations](../../apps/api/node_modules/@better-auth/infra/dist/index.d.mts), [installed routing implementation](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs).

Incoming Dashboard requests use an Infrastructure-issued signed token in the `Authorization` header. The plugin retrieves Infrastructure JWKS, verifies a maximum five-minute token age, and compares the token's `apiKeyHash` with a hash of a configured key. Most privileged routes additionally perform the upstream JTI check for tokens outside the freshness grace period; onboarding validation omits that check. Sending the raw `BETTER_AUTH_API_KEY` as an incoming Bearer token is not equivalent. Anonymous access to `/api/auth/dash/config` should be rejected, so rejection alone does not indicate broken connectivity. [Installed JWT middleware](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs).

Outbound dashboard requests use `x-api-key`. Default upstreams are `https://dash.better-auth.com` and `https://kv.better-auth.com`; Dashboard API timeout defaults to 3,000 ms and KV timeout to 1,000 ms. Prefer `apiOptions.timeout` and `kvOptions.timeout`; the older `apiTimeout` and `kvTimeout` names are deprecated. These options affect calls from the app to Infrastructure, not the dashboard's optional custom request headers to the app. [Installed constants](../../apps/api/node_modules/@better-auth/infra/dist/constants-D1m_WRqw.mjs), [installed options](../../apps/api/node_modules/@better-auth/infra/dist/types-sFD6YavS.d.mts), [HTTP clients](../../apps/api/node_modules/@better-auth/infra/dist/crypto-DZ0e3fu4.mjs).

**Localhost remains an account/UI verification item.** The public Infrastructure guides inspected do not document the supplied dashboard's localhost connection mechanism. The dashboard redirects unauthenticated access to sign-in, so this research cannot verify whether its connection uses browser requests, a remote service, or a local helper. Use the dashboard's offered localhost instructions when available; never assert that loopback is reachable from a remote service. A dedicated HTTPS staging deployment is a reliable option when remote reachability is required. A temporary tunnel is a design alternative only after confirming what the dashboard needs; tunneling is not established here as mandatory. [Public dashboard entry](https://dash.better-auth.com/), [getting started](https://better-auth.com/docs/infrastructure/getting-started).

For protected previews, identify whether optional custom headers satisfy the hosting access layer while preserving the Infrastructure `Authorization` header. Do not substitute hosting access credentials for the project's API key or copy either into browser environment variables. Whether a particular provider requires headers and whether the dashboard supports that provider's bypass mechanism must be verified in the chosen environment. This is an implementation inference from the separate incoming JWT and outgoing key flows, not a documented universal provider setup. [Installed JWT middleware and HTTP client](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs).

## Dashboard privileges, audit data, and schema

Dashboard can manage users and sessions and expose organization operations when corresponding runtime plugins exist. Its access is operationally privileged. The installed adapter execution endpoint can read and write adapter models, and user routes include password, session, deletion, and impersonation operations. Dashboard seat access, project API key custody, access removal, and incident response therefore belong in the implementation plan. Application roles do not automatically constrain every Dashboard operation. [Official Dashboard overview](https://better-auth.com/docs/infrastructure/plugins/dashboard), [installed privileged route implementations](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs).

`dashClient()` exposes `authClient.dash.getAuditLogs()` and `getAllAuditLogs()`; it does not grant the browser project-administrator privileges and does not implement Sentinel fingerprinting. Audit queries use the existing session. Per-user queries remain scoped server-side; organization-wide queries require organization membership/role checks. [Audit-log documentation](https://better-auth.com/docs/infrastructure/plugins/audit-logs), [installed client declarations](../../apps/api/node_modules/@better-auth/infra/dist/identify-client-options-BfGftEgh.d.mts), [installed server audit handlers](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs).

The installed Dashboard schema is empty when both `activityTracking.enabled` and `managedDirectorySync.enabled` are false. Connecting the current configuration therefore does not itself require a Dashboard schema migration. Enabling activity tracking adds nullable `user.lastActiveAt`. Enabling managed directory sync adds `directorySyncConnection` and `directorySyncMembershipProvenance`. Generate and review the actual Drizzle migration before enabling either flag, then deploy the compatible schema before the runtime starts using it. [Installed schema definition](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs), [installed option declarations](../../apps/api/node_modules/@better-auth/infra/dist/types-sFD6YavS.d.mts).

Without activity tracking, event analytics still operate, but precise last-activity reporting is not the same feature. Installed analytics sometimes use timestamps such as `updatedAt` as a fallback. Do not promise accurate online activity or stale-user analysis until tracking, migration, and representative activity verification are complete. The default configured update interval is five minutes. [Installed analytics and activity hooks](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs).

Events are submitted in background work. Tracking failures do not constitute a durable application audit queue; the package catches thrown submission errors and logs at debug level. Serverless/background execution lifetime and outage recovery require review if delivery guarantees matter. Event payloads can include identity and location information. Review the actual emitted payloads before defining retention and export policies; Infrastructure logs are not a replacement for business authorization audit events. [Installed event tracker](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs), [official audit collection](https://better-auth.com/docs/infrastructure/plugins/audit-logs).

## Sentinel premium security: what must be separately implemented

Official Sentinel features include credential stuffing, impossible travel, signup abuse, compromised passwords, dormant users, country policies, bots, suspicious IPs, velocity limits, and email validation. Actions include logging, challenges, and blocking. Roll out observable policies first and measure false positives before stricter enforcement. [Official Sentinel reference](https://better-auth.com/docs/infrastructure/plugins/sentinel).

The web plugin sends `X-Visitor-Id` and, following identification, `X-Request-Id`; solved challenges use `X-PoW-Solution`. Challenges arrive with `X-PoW-Challenge` and a reason header. For this separate-origin Fastify/Next.js architecture, update CORS allowed request headers and exposed response headers before challenge rollout. Evaluate CSP access to the identification service and browser retry behavior. [Sentinel client documentation](https://better-auth.com/docs/infrastructure/plugins/sentinel), [installed browser client](../../apps/api/node_modules/@better-auth/infra/dist/client.mjs).

Installed client source recommends a project-scoped ingestion URL from the project's settings, shaped like `https://kv.better-auth.com/projects/<project-id>`, passed as `sentinelClient({ identifyUrl })`. It warns against the generic global ingestion default. This browser-visible ingestion URL is configuration, not the secret project API key. Obtain the actual project value instead of constructing one from an assumed identifier. [Installed identify URL resolver](../../apps/api/node_modules/@better-auth/infra/dist/pow-retry-Cl7MAw6O.mjs).

The installed security client catches failure of `/security/check` and returns `action: 'allow'`. Thus upstream outage can preserve sign-in availability while losing this enforcement. Keep the existing local database-backed rate limiting and trusted client IP boundary. Test upstream timeouts and failure behavior; purchasing Pro is not a guarantee of fail-closed enforcement. [Installed `createSecurityClient`](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs).

A subtle installed behavior: Sentinel email normalization is enabled by default unless `security.emailNormalization.enabled` is explicitly false, or the legacy `emailValidation.enabled` configuration disables it. Normalization can change provider aliases and identity matching. For existing users, explicitly disable it initially or migrate identity semantics with collision analysis before enabling. This finding comes from `isEmailNormalizationEnabled`, not solely from the live sample. [Installed normalization logic](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs), [official normalization behavior](https://better-auth.com/docs/infrastructure/plugins/sentinel).

Dormant-user policies need the activity decision above. User/admin security notifications use Infrastructure's managed email sender in installed source, independently of the repository's Resend sender. Verify that sender configuration and entitlement before enabling notifications. [Installed security client and dormant-user handlers](../../apps/api/node_modules/@better-auth/infra/dist/index.mjs).

## Existing Resend versus managed email

The repository already sends authentication mail through `https://api.resend.com/emails` using `RESEND_API_KEY` and `EMAIL_FROM`. API-key activation and Dashboard connection do not replace it. Maintaining this transport is compatible with using Infrastructure for dashboard and security services. [Existing email transport](../../apps/api/src/auth/email.ts), [existing OTP/password handlers](../../apps/api/src/auth/create-auth.ts).

Managed email is an explicit optional migration. Infrastructure exports `sendEmail` and `createEmailSender`; calls need a template, recipient, and template variables. The documentation lists AWS SES, SendGrid, and Resend provider support. Template and sender configuration, account entitlement, domain verification, actual deliverability, and failure handling must be checked before a switch. [Official managed email guide](https://better-auth.com/docs/infrastructure/services/email).

Installed `createEmailSender(config).send(...)` returns `{ success, messageId?, error? }`; failed results must be checked because the wrapper catches errors instead of always throwing. Its API endpoint is `/api/v1/email/send` relative to the default dashboard origin, with Bearer API-key authentication. [Installed email implementation](../../apps/api/node_modules/@better-auth/infra/dist/email.mjs), [installed email declarations](../../apps/api/node_modules/@better-auth/infra/dist/email.d.mts).

Verified installed template variables relevant to the current flows:

| Template             | Required variables                             | Current flow fit                                            |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `reset-password`     | `resetLink`, `userEmail`                       | Existing reset-link handler                                 |
| `sign-in-otp`        | `otpCode`, `userEmail`                         | OTP sign-in                                                 |
| `verify-email-otp`   | `otpCode`, `userEmail`                         | Existing signup/sign-in verification                        |
| `reset-password-otp` | `otpCode`, `userEmail`                         | OTP reset if selected in future                             |
| `change-email`       | `confirmationLink`, `newEmail`, `currentEmail` | Link flow; does not match the current change-email OTP flow |

There is no separately declared change-email OTP template in the inspected template constants. Do not map that purpose to a misleading sign-in template merely to complete a transport switch. Preserve Resend for that flow or verify an appropriate managed custom template/API before migrating. Custom-template availability was not established by the inspected public docs. [Installed `EMAIL_TEMPLATES`](../../apps/api/node_modules/@better-auth/infra/dist/email.d.mts), [existing change-email OTP configuration](../../apps/api/src/auth/create-auth.ts).

## Proxy and production responsibilities

Use explicit production auth URLs and exact trusted web origins. The proxy must preserve cookies, auth headers, methods, path, and upstream status. Restrict trusted proxy addresses and overwrite the private client IP header at the application boundary. Do not weaken CSRF or origin checks to make Dashboard connectivity pass. Better Auth's static `baseURL` takes precedence over forwarded-host derivation; the repository already configures a static value. [Official security reference](https://better-auth.com/docs/reference/security), [existing auth configuration](../../apps/api/src/auth/create-auth.ts).

Premium connection does not supply the application's TLS deployment, backups, recovery, environment isolation, session cleanup, access control, provider credentials, or acceptance tests. These are implementation conclusions from the self-hosted architecture and current code, not claims of missing vendor features. [Infrastructure overview](https://better-auth.com/docs/infrastructure/introduction), [existing server configuration](../../apps/api/src/auth/create-auth.ts).

## Unverified operational facts to resolve during implementation

- The user's active Infrastructure project, purchased plan, quota utilization, payment status, or effective feature entitlements.
- The supplied project's key validity or rotation; no key was used or reproduced for this research.
- Dashboard localhost mode, hosting preview bypass behavior, and current UI flow beyond the supplied setup text.
- Hosting platform, deployment URLs, managed database, sender domain records, and mail-provider production approval.
- Enterprise negotiated retention, SLA, data region, DPA, SSO/SCIM procurement limits, or platform-specific admin roles.
- A universal machine-to-machine capability unlocked by Pro: the inspected Infrastructure pricing/setup sources establish no such automatic entitlement. Define protocol and use a verified appropriate authentication plugin if required.
