# Phase 1 dependency audit: required remediation

On 3 November 2026 the complete baseline stopped at
`pnpm audit --prod --audit-level high`, exit 1. The fresh audit reported
**28 findings: 8 low, 6 moderate, 8 high and 6 critical**. Earlier October audit
results do not establish a current pass. The API image build/check steps were
not reached, and no complete baseline pass is claimed.

The original reviewed input lockfile had SHA-256
`fe27cb49294a8e9967c6142f98fecf0e81801b5e635ec6bb5a390736c2468842`.
The following independently reviewed dependency exception is limited to closing
the existing high/critical audit gate. Package manifests and scoped overrides
have been updated; pnpm generates the lockfile, which must receive its own
review and then pass a frozen, byte-preserving installation.

## Reviewed changes and evidence

| Package                                          | Current reviewed resolution                    | Minimum proposed fix | Reason                                                          |
| ------------------------------------------------ | ---------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| Next.js                                          | `16.3.8`                                       | `16.4.1`             | Two critical RCE advisories and high server-action DoS          |
| Better Auth and coordinated core/Drizzle adapter | `1.7.6`                                        | `1.7.7`              | Critical Magic Link/OAuth-state and high OAuth Proxy advisories |
| Zod, all workspace consumers                     | API/web/tooling `4.6.5`; UI `4.4.3`            | `4.6.6`              | High oversized-collection validation memory exhaustion          |
| body-parser                                      | Existing 2.x resolution                        | `2.4.0`              | High compressed-body trailing-byte process crash                |
| multer                                           | `2.4.0` through Nest platform-express `12.1.0` | `2.5.0`              | High async file-filter teardown process crash                   |

Primary references:

- [Next.js 16.4.1 security release](https://github.com/vercel/next.js/releases/tag/v16.4.1),
  [image RCE advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
  [cache RCE advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr),
  [server-action DoS advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r).
- [Better Auth 1.7.7 release and upgrade guidance](https://github.com/better-auth/better-auth/releases/tag/v1.7.7),
  [critical advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm),
  [OAuth Proxy advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-r4xp-prcw-77qf).
- [Zod 4.6.6 release](https://github.com/colinhacks/zod/releases/tag/v4.6.6)
  includes checking collection bounds before parsing elements;
  [audit advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
- [body-parser advisory](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).
- [multer advisory](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m).

## Compatibility review and remaining work

Registry metadata was read before proposing changes. Next `16.4.1` supports the
existing Node 24 and React 19 versions. Better Auth `1.7.7` supports Next 16,
React 19, PostgreSQL 8 and the existing Drizzle `0.45.3`; it coordinates core and
adapters at `1.7.7` while retaining utils `0.4.2`. The existing infra `0.4.12`
accepts Better Auth/core versions `>=1.4.0` and Zod `>=4.1.12`. Its release says
no database migration is required. No live server or real pending sign-in is
being upgraded in Phase 1.

The independent pre-edit review confirmed necessity, compatibility and coverage
of the high/critical module set. It also identified the UI's separate old Zod
resolution: updating only the exact `4.6.5` manifests is insufficient. All four
direct consumers are therefore pinned to `4.6.6`. Final generated-lock review
and fresh behavioral verification remain distinct gates.

Verification sequence:

1. Finish the exact-version compatibility review. Keep the current Nest major;
   Express `5.2.1` permits body-parser `^2.2.1`, so `2.4.0` is compatible with
   that range. Nest's exact multer pin needs an explicitly reviewed, scoped
   same-major override or a reviewed parent patch. Do not silently upgrade the
   whole Nest graph.
2. Update the four workspace Zod consumers together. Update Better Auth/core/
   adapter pins together, retaining compatible utils/infra. Update Next and
   review its scoped sharp/baseline-browser overrides against `16.4.1`.
3. Generate the lockfile through pnpm, inspect every changed dependency edge,
   and reject unrelated refreshes. Never hand-edit the lockfile. Do not add
   audit suppression or change the audit threshold.
4. Record the new reviewed hash, then require a frozen installation to leave
   that new lockfile unchanged. Read the updated installed framework docs.
5. Run the complete baseline, all focused regressions and actual local API
   acceptance again. Earlier execution against the old graph becomes stale.
6. Complete independent technical and authenticated CodeRabbit review of the
   final changes, commit/publish on PR #4, and require fresh hosted checks.

Fastify, fast-uri, qs and the existing esbuild entries are low/moderate in this
audit. They remain visible for review; there is no blanket graph update in this
proposal. Final audit results may change the necessary patch set.

An earlier elevated metadata inspection and reviewer turn were interrupted by
an account usage limit. After the user's continuation instruction, tooling and
the independent review resumed. The exact pinned PostgreSQL image was inspected:
its declared volume is `/var/lib/postgresql`, matching the test tmpfs mount.
No volume-deletion flag is needed or permitted.

## Generated graph review

The pinned pnpm `10.16.1` install completed successfully. The generated lockfile
was independently reviewed: no actionable compatibility or graph defects were
found. Its SHA-256 is
`0103742d350a356ee6bbe09b4a33fd416764cbcf85e54a85bba25f0b407bbfff`.
The fresh patched production audit reports **0 high, 0 critical, 5 low and
6 moderate** findings. The audit threshold and suppression policy are unchanged.

Reviewed collateral changes are limited to body-parser's published iconv-lite
`0.7.3` and qs `6.17.1` dependencies, Browserslist's in-range deduplication of
baseline-browser-mapping `2.10.32` to the existing `2.11.27` resolution, and
optional Vitest/Vite peer-path flags. Existing Nest, Drizzle, Vite, Vitest and
React versions are unchanged. No new package family was introduced beyond the
necessary parent's dependencies. All four direct Zod consumers and re-evaluated
peer paths resolve the patched version.

The full verification must preserve this reviewed lockfile byte for byte.
The original failed audit and interrupted install attempts remain historical
evidence; they are not counted as successful verification.
