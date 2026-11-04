# Phase 3 hosting design: hostnames, Cloudflare, Netlify and Render

Part of the [Phase 3 design bundle](README.md). Status: **selected design**
unless a row says approved or observed. Nothing here creates a record, project,
service or certificate. Evidence IDs refer to the
[hosting evidence](../../sources/phase-3-hosting-research-2026-11-04.md).
Responsible owners: **P** is Shane Viyazhi (primary operator) and **B** is
Sherise Viyazhi (backup), per P3-U03.

## Hostname map

Production keeps the plan's names. Staging uses flat first-level names, which
Universal SSL could cover if proxying is ever enabled (CF-01). The
transactional sending names follow Resend's subdomain guidance (RES-01). No
other public hostname is introduced. The parser host is reached by IP address
with a private-CA server name, and recovery storage uses provider endpoints.

| Host                       | Environment and purpose                                                    | Serving resource (proposed)                            | Canonical behavior                                                                                               | DNS record (all DNS-only initially)                                                                                                                           | Certificate owner     | Profile |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------- |
| `nthawi.io`                | Production marketing apex                                                  | Netlify `nthawi-marketing-production` (alias)          | Permanent redirect to `https://www.nthawi.io`, preserving path and query.                                        | Flattened CNAME at `@` to the provider-issued apex target. NET-09 documents `apex-loadbalancer.netlify.com`, or A `75.2.60.5`; copy what the dashboard shows. | Netlify (managed)     | M       |
| `www.nthawi.io`            | Production marketing, canonical                                            | Netlify `nthawi-marketing-production` (primary domain) | Canonical marketing origin. Netlify recommends a subdomain primary with external DNS (NET-09).                   | CNAME to the provider-issued Netlify target.                                                                                                                  | Netlify (managed)     | M       |
| `app.nthawi.io`            | Production owner application                                               | Netlify `nthawi-owner-production`                      | Canonical owner origin: `WEB_ORIGIN` and `BETTER_AUTH_URL`. No redirect to marketing; unknown paths return 404.  | CNAME to the provider-issued Netlify target.                                                                                                                  | Netlify (managed)     | O       |
| `api.nthawi.io`            | Production API: signed-proxy target, direct routes, webhooks, external API | Render `nthawi-api-production` custom domain           | Canonical API origin. HTTP is redirected to HTTPS by Render (RDR-09); no cross-host redirects of request bodies. | CNAME to the provider-issued `onrender.com` target; no AAAA, since Render has no IPv6 (RDR-08).                                                               | Render (managed)      | A       |
| `widget.nthawi.io`         | Production widget loader and iframe                                        | Netlify `nthawi-widget-production`                     | Canonical widget origin (`WIDGET_ORIGIN`); never redirects to owner hosts.                                       | CNAME to the provider-issued Netlify target.                                                                                                                  | Netlify (managed)     | W       |
| `staging.nthawi.io`        | Staging marketing                                                          | Netlify `nthawi-marketing-staging`                     | Canonical for staging; no apex/`www` pair; never redirects to production.                                        | CNAME to the provider-issued Netlify target.                                                                                                                  | Netlify (managed)     | M + S   |
| `app-staging.nthawi.io`    | Staging owner application                                                  | Netlify `nthawi-owner-staging`                         | Staging `WEB_ORIGIN` and `BETTER_AUTH_URL`.                                                                      | CNAME to the provider-issued Netlify target.                                                                                                                  | Netlify (managed)     | O + S   |
| `api-staging.nthawi.io`    | Staging API                                                                | Render `nthawi-api-staging` custom domain              | Canonical staging API origin.                                                                                    | CNAME to the provider-issued `onrender.com` target; no AAAA.                                                                                                  | Render (managed)      | A + S   |
| `widget-staging.nthawi.io` | Staging widget                                                             | Netlify `nthawi-widget-staging`                        | Staging `WIDGET_ORIGIN`, embedded only by synthetic fixture sites.                                               | CNAME to the provider-issued Netlify target.                                                                                                                  | Netlify (managed)     | W + S   |
| `notify.nthawi.io`         | Production transactional sending identity                                  | Resend domain, region `eu-west-1` (RES-02)             | No web service.                                                                                                  | Exactly the records Resend issues (types as issued) for the domain and its Return-Path subdomain. Nothing is invented here.                                   | Not applicable (mail) | E       |
| `notify-staging.nthawi.io` | Staging sending identity                                                   | Separate Resend domain, `eu-west-1`                    | No web service; sends only to allowlisted recipients.                                                            | Exactly the records Resend issues.                                                                                                                            | Not applicable (mail) | E + S   |
| `_dmarc.nthawi.io`         | Organizational DMARC policy covering both sending subdomains               | DNS TXT authored by operators (OP12)                   | Not applicable.                                                                                                  | TXT starting at `p=none` with an approved report destination, staged to enforcement on evidence.                                                              | Not applicable        | E       |

All names are selected designs; none is a registered provider resource yet.
**P** owns DNS, certificate and redirect verification for every row, and **B**
verifies independently and can restore records from the pre-change export.

### Policy profiles

| Profile             | Authentication, cookie and CORS boundary                                                                                                                                                                                                                                                                                                                    | Caching                                                                                                                                                                                          | Security headers                                                                                                                                                                                                                                                                                            | Verification                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M (marketing)       | No session cookie, no credentialed CORS, no owner routes or owner server configuration in the deployment.                                                                                                                                                                                                                                                   | Content-hashed assets `public, max-age=31536000, immutable`; HTML revalidated on every request (`max-age=0, must-revalidate`); atomic deploys replace content.                                   | CSP without inline script except hashes; `frame-ancestors 'none'`; `X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; minimal `Permissions-Policy`.                                                                                            | `www` returns 200 and the release marker; apex redirects to `www` with path and query; owner paths return 404; headers present; checked from two networks.                                                                                                                         |
| O (owner)           | B1 and B2 in the [trust boundaries](README.md#trust-boundaries): host-only `Secure`, `HttpOnly`, `SameSite=Lax` session cookie; trusted auth origin is only `WEB_ORIGIN`; no CORS on proxied routes; API accepts owner cookies only with a valid `x-nf-sign`.                                                                                               | Authenticated HTML and every `/api/*` response `private, no-store` with no ETag or Last-Modified, because Netlify may cache proxied responses that carry them (NET-01); hashed assets immutable. | Nonce CSP from Proxy (NXT-02): `script-src 'nonce-…' 'strict-dynamic'`, `connect-src 'self'` plus the API origin for direct upload and stream; `frame-ancestors 'none'`; `X-Frame-Options: DENY`; `nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Cross-Origin-Opener-Policy: same-origin`. | Google OAuth callback and logout; cookie attributes; two-user cache isolation; spoofed `Forwarded`/`X-Forwarded-*` ignored; missing, expired, wrong-site and wrong-context `x-nf-sign` rejected with 401.                                                                          |
| A (API)             | Owner-cookie routes only behind a valid `x-nf-sign` plus session. Direct routes accept only their own credential: upload or stream capability, visitor capability, external API credential or webhook signature. Exact CORS allowlists per route class, never `Access-Control-Allow-Credentials: true`; webhooks and the external API send no CORS headers. | `no-store` on every dynamic response (existing for `/api/*` and `/health/*`); event streams `no-store, no-transform`.                                                                            | `nosniff`; JSON responses with `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`; safe error codes with correlation IDs; no secrets in query strings or logs.                                                                                                                           | 401/403 matrix per actor; a 10,485,760-byte upload accepted and one byte more rejected on actual bytes; stream first-byte and inter-chunk timing over the DNS-only path; webhook duplicate, replay and oversize cases; identical behavior on the provider `onrender.com` hostname. |
| W (widget)          | No owner cookie or owner credential. Visitor capability issued per installation and conversation. The parent origin comes from the loader handshake and is checked against the installation's allowed origins at issuance; an installation ID is public, not a secret.                                                                                      | Versioned loader `/loader/v1/<content-hash>.js` immutable for one year; stable alias `/loader/v1.js` `max-age=300`; iframe documents `no-store`.                                                 | Iframe CSP `frame-ancestors *` (embedding is the product; origin control lives in capability issuance), `script-src 'self'`, `connect-src` the API origin only; no `X-Frame-Options` on iframe documents; `nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`.                                    | Separate-site embed fixture; origin-mismatch and revoked-installation rejections; `postMessage` origin and source-window checks; compressed loader size reported (10 KiB target in Phase 15).                                                                                      |
| E (email)           | No browser surface.                                                                                                                                                                                                                                                                                                                                         | Not applicable.                                                                                                                                                                                  | Not applicable.                                                                                                                                                                                                                                                                                             | Provider shows the domain verified; SPF, DKIM and DMARC alignment pass on test messages; bounce and complaint webhooks recorded; existing mailbox records preserved.                                                                                                               |
| S (staging overlay) | Synthetic identities only; separate OAuth client; access restriction where the plan supports it.                                                                                                                                                                                                                                                            | As the base profile.                                                                                                                                                                             | Adds `X-Robots-Tag: noindex, nofollow` and a visible staging banner. Robots headers are not authorization.                                                                                                                                                                                                  | Production credentials absent from staging builds and runtime; staging cannot reach production data or private services.                                                                                                                                                           |

## Registrar, account and DNSSEC prerequisites

Observed (OBS-H01 to OBS-H04): Cloudflare, Inc is the registrar; the
registration expires 2027-10-29T13:15:35Z; `clientTransferProhibited` is set;
the delegation is signed (DS key tag 2371, algorithm 13) and validates through
two independent resolvers; the zone has no records. The plan's 30 October
observations of disabled DNSSEC and no records are superseded for DNSSEC and
confirmed for records. The zone's TLS settings were read only in the earlier
session; they affect proxied records only and must be re-read before OP09.

Before any DNS change, **P** confirms and **B** independently re-checks:
auto-renewal on, a payment method valid past the renewal date, accurate
registrant and recovery contacts, MFA on both operators' Cloudflare logins with
recovery codes in the shared vault, least-privilege membership (no extra
administrators), and scoped API tokens only. Nothing is purchased, renewed,
transferred or changed in Phase 3. Cloudflare Registrar manages DS publication
automatically (CF-04), so operators never add or remove a DS record by hand.
After any zone change, validate the chain externally with two resolvers.

## Future Cloudflare sequence

Each step runs only in its authorized phase: staging hostnames in Phase 5,
production hostnames in Phase 16.

1. Read-only re-inventory: export every record (BIND export), DNSSEC status
   and zone settings; store the export as rollback evidence. Stop if any
   unknown record exists and preserve it.
2. Create the origin (Netlify project or Render service) under its own
   operation (OP03, OP04, OP07).
3. Attach the custom domain in the provider dashboard and copy the exact
   provider-issued target and any verification record. Never construct a
   `*.netlify.app` or `*.onrender.com` value from a naming pattern.
4. Add exactly those records in Cloudflare, DNS-only, TTL Auto. Add no AAAA for
   Render hosts. Add no CAA unless it lists every CA the providers actually use,
   checked at that time.
5. Wait for provider verification and certificate issuance. Verify the
   certificate chain, subject alternative names and expiry from two networks,
   the HTTP-to-HTTPS redirect at the origin, canonical redirects, headers and
   application routes.
6. Run the compatibility suite in the bypass matrix below while DNS-only.
7. Only if a later reviewed decision selects proxying for a host: set
   Full (strict) for it, minimum TLS 1.2, keep TLS 1.3, enable the proxy, and
   re-run the whole suite. Rollback is returning the record to DNS-only.
8. HSTS starts at the origins with a short `max-age` after 30 days of stable
   HTTPS on every affected host. `includeSubDomains` waits until every
   subdomain serves valid HTTPS, and preload needs a separate owner decision.

### TLS responsibilities

With **DNS-only** records, the origin provider terminates browser TLS, issues
and renews the certificate, and performs HTTP-to-HTTPS redirects. Cloudflare's
zone TLS mode, minimum version, Always Use HTTPS, HSTS and WAF do not apply to
that traffic (CF-01). With **proxied** records, Cloudflare terminates browser
TLS with Universal SSL (apex and first-level names only) and connects to the
origin under the zone SSL mode. Full (strict) then requires an unexpired,
publicly trusted or Origin CA certificate matching the hostname (CF-02).
Render's guide mentions mode Full (RDR-08); this design requires Full (strict)
and verifies that Render's issued certificate satisfies it. Never use Flexible
or an Origin CA certificate on a DNS-only host, because browsers would not trust
it. A proxied request fails after 125 seconds without a read (CF-03), so
streams must send heartbeats well inside that (Phase 12 sets the interval).

### Bypass verification matrix

Provider default hostnames remain reachable unless the provider allows
disabling them. Render exposes a per-service subdomain policy (OBS-H06 shows
the field). Cloudflare controls never protect requests that bypass the proxy.

| Check                                           | Custom hostname | Provider hostname (`*.netlify.app`, `*.onrender.com`) |
| ----------------------------------------------- | --------------- | ----------------------------------------------------- |
| Authentication and authorization per actor      | Required        | Required, identical result                            |
| Rate limits and quota admission                 | Required        | Required, identical result                            |
| Webhook signature, replay and size checks       | Required        | Required, identical result                            |
| Owner cookie never accepted without `x-nf-sign` | Required        | Required                                              |
| Security headers and `no-store`                 | Required        | Required                                              |
| Streaming flush, heartbeat and cancellation     | Required        | Informational                                         |
| Cookies scoped to the owner host only           | Required        | Not applicable (no cookie issued there)               |

After a custom domain verifies, disable the provider default hostname where the
provider supports it. If it cannot be disabled, the matrix proves equivalence.

## Netlify design

**Team.** Use the existing team `tristan-x888` (OBS-H05), upgraded to Pro
(USD 20 per month, NET-10) for variable scopes (NET-06) and the `fra` function
region (NET-02). Both operators use MFA; enforce team MFA when the plan offers
it. One team subscription covers all six projects; credits are shared.

**Projects.** Six proposed projects, all from repository `Tristan-X888/Nthawi`
with production branch `master` and the base directory unset (repository
root, NET-03):

| Project (proposed)            | Environment | Package directory | Publish directory  | Domains                                | Functions region |
| ----------------------------- | ----------- | ----------------- | ------------------ | -------------------------------------- | ---------------- |
| `nthawi-marketing-production` | Production  | `apps/web`        | `apps/web/.next`   | `www.nthawi.io` (primary), `nthawi.io` | `fra`            |
| `nthawi-owner-production`     | Production  | `apps/web`        | `apps/web/.next`   | `app.nthawi.io`                        | `fra`            |
| `nthawi-widget-production`    | Production  | `apps/widget`     | `apps/widget/dist` | `widget.nthawi.io`                     | None (static)    |
| `nthawi-marketing-staging`    | Staging     | `apps/web`        | `apps/web/.next`   | `staging.nthawi.io`                    | `fra`            |
| `nthawi-owner-staging`        | Staging     | `apps/web`        | `apps/web/.next`   | `app-staging.nthawi.io`                | `fra`            |
| `nthawi-widget-staging`       | Staging     | `apps/widget`     | `apps/widget/dist` | `widget-staging.nthawi.io`             | None (static)    |

Separate marketing and owner projects keep the proxy-signing secret, owner
configuration and canonical-redirect rules out of the marketing deployment.
One shared web deployment would need fewer projects, but host-routing mistakes
could expose owner routes or configuration on the public site (P3-D04). Both
projects build `apps/web` today. Phase 6 must make the marketing build exclude
owner routes and owner server configuration, for example with a build-time
surface setting enforced in Proxy or a separate package. This bundle requires
the outcome but leaves the mechanism to Phase 6.

**Build fields** (derived from OBS-H08; NET-03, NET-04):

| Field               | Value                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node                | `NODE_VERSION=24.21.0`. `.node-version` says only `24`, so the build log must show `v24.21.0`; if not, Phase 5 aligns the file in a reviewed change and stops until then.                                                      |
| pnpm                | `10.16.1` from `packageManager` through Corepack (NET-04). `pnpm-workspace.yaml` also pins script Node with `useNodeVersion: 24.21.0`.                                                                                         |
| Install             | Netlify runs `pnpm install` at the repository root; `PNPM_FLAGS=--frozen-lockfile`. No `--shamefully-hoist` unless a reviewed failure proves it necessary.                                                                     |
| Build (web)         | `git diff --exit-code -- pnpm-lock.yaml && pnpm exec turbo run build --filter=@nthawi/web`                                                                                                                                     |
| Build (widget)      | `git diff --exit-code -- pnpm-lock.yaml && pnpm exec turbo run build --filter=@nthawi/widget`                                                                                                                                  |
| Next.js runtime     | Netlify's OpenNext adapter (NET-05), unpinned unless a regression requires a pin; each deploy records the adapter version from its log.                                                                                        |
| Public build values | `NEXT_PUBLIC_API_URL` set to the project's owner origin (`https://app.nthawi.io` or `https://app-staging.nthawi.io`); widget `VITE_*` values in the [configuration matrix](configuration.md#configuration-and-secrets-matrix). |

Next.js 16.4.1 is not named by Netlify, and NXT-01 says Netlify's integration is
neither built on the Adapter API nor verified by the Next.js team. Phase 5 must
prove App Router rendering, streaming, Proxy, route handlers and server actions
on the staging owner project. If a required feature fails, stop. The
alternatives are pinning a working adapter, or hosting the owner app as a
Node.js `next start` web service on Render (a fully supported deployment mode,
NXT-01). Either returns P3-D04 to review.

**Contexts and variables.** Each project uses only its own Production context.
For staging projects that context carries staging values, because a context
name does not determine the data environment. Deploy Previews are disabled on
every project (NET-07), and branch deploys are not enabled. Auto publishing is
locked on every project (NET-08): commits to `master` still build, and **P**
publishes the specific deploy built from the verified commit. Rollback is
Publish Deploy on the previous deploy. Variables:

- Browser-visible values are only the public build values above. A value
  marked secret in Netlify still becomes public once a bundle embeds it.
- `NETLIFY_PROXY_SIGNING_SECRET` exists only in owner projects, Runtime scope
  only (NET-01, NET-06), marked "Contains secret values", with a different
  value per environment.
- No secret is a team-shared variable (NET-06). The sensitive-variable policy
  for this public repository denies untrusted deploys any sensitive variable.
- Marketing and widget projects hold no secret at all.

**Owner routing.** Proposed Netlify configuration for the owner project. It is
illustrative only and becomes a real file through a reviewed Phase 5/6 change:

```toml
# PROPOSED EXAMPLE — not active configuration. Package directory: apps/web.
[build]
  command = "git diff --exit-code -- pnpm-lock.yaml && pnpm exec turbo run build --filter=@nthawi/web"
  publish = "apps/web/.next"

[[redirects]]
  from = "/api/auth/*"
  to = "https://api.nthawi.io/api/auth/:splat"
  status = 200
  force = true
  signed = "NETLIFY_PROXY_SIGNING_SECRET"

[[redirects]]
  from = "/api/v1/*"
  to = "https://api.nthawi.io/api/v1/:splat"
  status = 200
  force = true
  signed = "NETLIFY_PROXY_SIGNING_SECRET"
```

The staging project uses `https://api-staging.nthawi.io` and its own secret.
These routes carry only short JSON calls, because a proxied request times out
after 26 seconds (NET-01). The API verifies `x-nf-sign` as HS256 with the
environment secret, checks `iss` is `netlify`, `exp` is in the future and close
to now, and `site_url`, `netlify_id` and `deploy_context` equal configured
expected values. Any mismatch fails closed. The signature carries no method,
path or body, so session, origin, CSRF and resource authorization remain
mandatory. The API trusts the Netlify-supplied client address only on requests
with a verified signature; Phase 6 confirms the exact header and its
spoof-resistance. Otherwise client addresses come from the Render proxy chain
configured in `API_TRUST_PROXY`, measured in Phase 5 rather than taken from
RDR-13. Server rendering that needs owner data calls the owner origin's own
`/api/v1/*` path so the request is signed; it never sends owner cookies to the
API host directly.

**Direct routes.** Uploads (up to 10 MiB) and event streams bypass Netlify
entirely: buffered functions stop at 6 MB and synchronous execution at 60
seconds (NET-02). The browser calls `https://api.nthawi.io` with a capability
in an `Authorization` header, never in a URL. Streams use `fetch` streaming so
the capability is not placed in an `EventSource` query string. Proposed
capability bounds: upload admission 5 minutes, single use, bound to owner,
workspace, source, action, declared size, expected hash and lifecycle
generation, with a 120-second transfer deadline enforced on actual bytes.
Stream admission is 60 seconds for one conversation and action, with
server-side revocation checked during the connection. Phase 12 owns heartbeat,
replay and reconnect deadlines.

**Widget.** The current Vite counter is a starter. Proposed Phase 13 routes are
`/loader/v1/<content-hash>.js`, the `/loader/v1.js` alias and `/embed/v1/`, with
the W profile and a versioned `postMessage` protocol. The installation ID is
public and is never a credential; capabilities never appear in `data-*`
attributes. Headers come from a reviewed `_headers` file in the publish
directory.

**Custom domains and rollback.** Attach each domain after its project exists
(NET-09), then follow the [Cloudflare sequence](#future-cloudflare-sequence).
Netlify manages the certificates. Application rollback is publishing the
previous deploy. DNS rollback restores the exported record set.

## Render design

**Workspace and environments.** Create a dedicated Render workspace for Nthawi
on Pro (USD 25 per month, RDR-11), separate from the existing "My Workspace"
and its unrelated `drivesmart-backend` service, which stay untouched
(OBS-H06). Both operators are Admins with MFA. Project `nthawi` has
protected, network-isolated `staging` and `production` environments (RDR-10).
Create a second Pro workspace in a separate Render organization/account for recovery, with distinct recovery-only
provider identities and API tokens that are not members of the application
workspace. Its protected staging and production environments hold the intake,
checkpoint job and all raw recovery credentials. The same two humans hold
recovery access through those independent identities; compromise of an
application workspace identity grants no recovery workspace access.
Environment groups are scoped to one environment and workspace. Do not relax
private-network isolation to connect the workspaces. Every service is in
Frankfurt (RDR-06); a region cannot be
changed later.

**Artifacts and deploys.** Auto-deploy is off on every service (RDR-02). A
future reviewed CI change builds each image once from the merged commit and
pushes it to GitHub Container Registry, where it is identified by digest.
Staging deploys that digest; production later deploys the same digest. Images
contain no secrets (the existing image check is extended in Phase 5) and may be
public, like the source. Private images would need a read-only registry
credential in the matrix.

| Service (proposed name per environment) | Type                                                                             | Image and start                                                                                                                                                     | Port, health and discovery                                                                                                                                                                                                                                        | Size and count                                                               | Shutdown and recovery                                                                                                                                                                                                 | Scratch and logs                                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nthawi-api-{env}`                      | Web service                                                                      | Existing `infra/docker/api.Dockerfile`, root context `.`; image CMD `node apps/api/dist/main.js`; non-root `node` user.                                             | `PORT=4000` and `API_PORT=4000`; health check path `/health/ready` gates deploys and routing (RDR-05); probes also use `/health/live`; public custom domain.                                                                                                      | Production 2 × 1 CPU / 2 GB; staging 1 × 1 CPU / 2 GB.                       | `maxShutdownDelaySeconds` 60: fail readiness, refuse new streams, finish requests, send stream drain events, close both pools (existing shutdown hooks).                                                              | No disk; uploads stream to R2; structured logs with IDs and codes, never bodies, cookies, tokens or OAuth queries.                                                                       |
| `nthawi-jobs-{env}`                     | Background worker, outbound only (RDR-03)                                        | Future image and entry point (Phase 8). None exists today, so no command is supplied.                                                                               | No inbound port. Liveness is measured by heartbeats and queue age, not HTTP. Reaches the scanner through its provider-issued internal address (RDR-01).                                                                                                           | 1 × 1 CPU / 2 GB.                                                            | `maxShutdownDelaySeconds` 120: stop leasing, finish or checkpoint, release leases. Lease 60 seconds, heartbeat 15 seconds, fencing generation per attempt, at most 3 attempts per stage (backoff 30 s, 2 min, 8 min). | Per-job `/tmp` at most 32 MiB, deleted after the job; no document text in logs.                                                                                                          |
| `nthawi-scanner-{env}`                  | Private service (RDR-04)                                                         | Future image (Phase 9) from a digest-pinned `clamav/clamav` feature tag with bundled signatures, plus an authenticated wrapper supervising `clamd` and `freshclam`. | Wrapper on TLS port 8443 with mutual TLS; `clamd` bound to `127.0.0.1:3310` only, because its TCP socket has no protection (CAV-01). TCP health check only (RDR-05); the worker calls the wrapper's readiness.                                                    | 1 × 2 CPU / 4 GB.                                                            | Default 30-second delay. Scans are idempotent and retried by the worker.                                                                                                                                              | Signatures preloaded in the image; restricted ephemeral scan scratch, bounded by admission/scan limits and cleaned on terminal outcome and before readiness; never downloaded or logged. |
| `nthawi-recovery-intake-{env}`          | Public HTTPS web service in the separate recovery workspace                      | Future image (Phase 5), append-only recovery protocol; no arbitrary URL/path or delete endpoint                                                                     | Provider-issued HTTPS URL on 443; Render terminates TLS, so application authentication is canonical Ed25519 signed requests, not mTLS. Timestamp, durable nonce replay protection, environment, operation, object/hash/length and lifecycle generation are bound. | Production and staging 1 CPU / 2 GB; staging suspended outside test windows. | Durable signed receipt before acknowledgement; replay is idempotent; failed persistence fails closed.                                                                                                                 | Streams objects; bounded buffers; logs identities/codes only; no production database key.                                                                                                |
| `nthawi-recovery-{env}`                 | Cron job in the separate recovery workspace, corresponding protected environment | Future image (Phase 4/5) with PostgreSQL 18 client tools and an object-copy tool, schedule `*/30 * * * *`.                                                          | No inbound traffic; reaches Neon and recovery R2 over TLS.                                                                                                                                                                                                        | 0.5 CPU / 512 MB, upsized if measured dumps need more.                       | One active run at a time (RDR-12); UTC slots start every 30 minutes; completion deadline is slot start plus 20 minutes including startup delay; missed slot pages and does not shift cadence.                         | Dump staging in `/tmp`, deleted after verified upload.                                                                                                                                   |

**Scanner behavior** (P3-D09). Wrapper requests carry the job ID, expected
SHA-256 and size, then stream bytes. The wrapper streams them to `clamd`
(`StreamMaxLength` at least 12 MiB) and returns the verdict, engine version,
signature version and time, duration and input hash. Archive scan limits are at
least the parser's 50 MiB expansion ceiling, and `AlertExceedsMax yes` turns a
limit hit into a rejection. `ConcurrentDatabaseReload no` keeps reload memory
inside 4 GB; scans queue briefly during reloads (CAV-01). `freshclam` checks
every 2 hours (`FRESHCLAM_CHECKS=12`). Readiness requires a `clamd` PING and a
successful update check within 24 hours. An alert fires at 12 hours, and the
scanner fails closed at 24. A timeout, error, stale signature or unreadable
result is never "clean": the job stays quarantined and retries within its
deadline. ClamAV is one layer; parser isolation does not depend on it.

**Scanner scratch.** ClamAV may write temporary files while unpacking archives
(CAV-01); an ephemeral Render filesystem is not proof of RAM-only scanning.
Configure a dedicated mode-0700 `TemporaryDirectory` for the daemon, keep
`LeaveTemporaryFiles`, debug output and metadata-file generation disabled, and
admit one scan at a time so cleanup cannot remove another active scan's files.
Clean remaining attempt artifacts after success or failure and orphaned files
before readiness. Phase 9 measures peak scratch use against scan limits and
proves cleanup after timeout, OOM, cancellation and restart. Never serve scratch
through downloads or log document bytes.

**Health and readiness.** Using `/health/ready` as Render's check means an
instance without database connectivity receives no traffic, and a new deploy
cannot go live without it (RDR-05). During a database outage Render removes
instances after 15 seconds and restarts them after 60. That is acceptable
because every API route needs the database, and the outage counts against
availability either way. External probes still use both endpoints.

**Release and rollback procedure.** Deploy the staging digest, verify, then
deploy the same digest to production on its own command. Rollback redeploys the
previous digest only when the schema is compatible. Render keeps the old
instance until the new one passes health checks (RDR-02, RDR-05). Phase 3
deploys nothing.
