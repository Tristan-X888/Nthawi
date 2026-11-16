# Phase 5: reproducible staging

Status: **in progress; provider execution and HTTPS acceptance are blocked**.
Phase 4 is accepted, as recorded in the [dependency audit](../../evidence/phase-5-dependency-audit-2026-11-13.md).
The [execution context](agent.md) records identities, ownership, authority and open gates.

This first implementation slice supplies the signed owner ingress contract,
a local streaming signer, staging-only Netlify configurations and a pure Render
API Blueprint generator. It creates no provider resource, changes no DNS or secret,
opens no database connection, and publishes no image. No worker or scanner is
represented as working without an entrypoint. The widget remains a starter.

## Reviewable files

- `apps/api/src/proxy/signed-proxy.ts`: HS256 verification before authentication,
  exact site/context identity, expiry, forwarding-header handling and owner cache boundary.
- `packages/tooling/src/env.ts`: required deployed ingress configuration and bounded
  retiring-key configuration; errors expose field names only.
- `scripts/dev-signed-proxy.mjs`: loopback-only HTTP signer for local owner journeys.
- `apps/web/netlify.toml`, `apps/marketing/netlify.toml`, `apps/widget/netlify.toml`:
  separate staging surfaces, frozen builds and static response policies.
- `scripts/staging-render.mjs`: outputs a staging API Blueprint from a source SHA
  and a digest-pinned GHCR image. It has no provider client or apply command.
- `.github/workflows/verify.yml`: additive staging contract checks; existing checks retained.

The three TOML files are valid TOML. Generated Render configuration passed the
current official [Render JSON Schema](https://render.com/schema/render.yaml.json)
with a synthetic test digest; this is structural validation, not a deployment or
an attestation of an actual image. Render CLI/account-aware validation is still
required on the real reviewed artifact before creation.

Native Netlify JWS contains expiry but no issued-at claim. The verifier bounds
remaining lifetime to 300 seconds and rejects expiration; original token age
cannot be proven from that format. The JWS does not bind the method, URL or
body, so session, origin, CSRF and resource authorization remain mandatory.
Actual provider token lifetime and signed claims must pass staging conformance.
An optional `NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET` requires the paired epoch-second
`PROXY_PREVIOUS_KEY_VALID_UNTIL`, at most one hour ahead at configuration time;
the old key stops working at the cutoff. Record and approve the rotation window.

## Verification commands

Run from the authoritative workspace, checking every native command's exit code.
These commands require no provider credentials or connections.

```powershell
Set-Location -LiteralPath 'C:/Users/USER/Desktop/Nthawi/Nthawi'
$env:Path = 'C:/Users/USER/AppData/Local/pnpm/nodejs/24.21.0;' + $env:Path
if ((node --version) -ne 'v24.21.0') { throw 'Expected Node 24.21.0.' }
if ((pnpm.cmd --version) -ne '10.16.1') { throw 'Expected pnpm 10.16.1.' }

pnpm.cmd exec turbo run build --filter=@nthawi/api
if ($LASTEXITCODE -ne 0) { throw 'Compiled API build failed.' }
node --test scripts/dev-signed-proxy.test.mjs scripts/staging-config.test.mjs scripts/staging-render.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Staging contracts failed.' }
pnpm.cmd --filter @nthawi/tooling test
if ($LASTEXITCODE -ne 0) { throw 'Environment contracts failed.' }
pnpm.cmd --filter @nthawi/api test
if ($LASTEXITCODE -ne 0) { throw 'API regressions failed.' }
pnpm.cmd --filter @nthawi/api test:e2e
if ($LASTEXITCODE -ne 0) { throw 'API lifecycle checks failed.' }
pnpm.cmd exec turbo run typecheck --force
if ($LASTEXITCODE -ne 0) { throw 'Workspace typechecks failed.' }

$phase5Tests = @(Get-ChildItem -LiteralPath scripts -Filter '*.test.mjs' |
    Where-Object { $_.Name -notlike '*.integration.test.mjs' } |
    ForEach-Object { $_.FullName })
node --test --test-reporter=dot @phase5Tests
if ($LASTEXITCODE -ne 0) { throw 'Script regressions failed.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed.' }
```

The signer uses API port 4500, web port 3000 and signer port 8890 by default.
Tests bind ephemeral loopback ports and never start the existing Neon development
servers. The exported `createSignedProxy` returns an unbound HTTP server. CLI
configuration comes from process environment; it never reads private files.
`PROXY_EXPECTED_SITE_URL` must be the signer's loopback origin for local use,
and the API must receive the same tuple and signing secret. API and browser
origin configuration must agree with that single local origin. The signer
refuses production mode and WebSocket upgrades, so Next development HMR is
unavailable through this test proxy. Normal HTTP journeys work.

## Deployment restrictions

Netlify's `ignore = "exit 0"` skips repository-triggered builds, but
[build hooks bypass ignore](https://docs.netlify.com/build/configure-builds/ignore-builds/).
Every staging project must also have provider **Stopped builds** enabled
(`build_settings.stop_builds=true`) and no build hooks. Keep those settings
while an explicitly authorized operator builds locally and creates a manual
deploy; [Netlify documents this path](https://docs.netlify.com/build/configure-builds/stop-or-activate-builds/).
The TOML files alone cannot establish those provider settings.

The API Blueprint uses a prebuilt immutable image. Such services are manually
deployed; `autoDeployTrigger: off` also makes the intent explicit. Creating or
syncing a Blueprint can perform an initial deployment and incur charges. Generating
configuration is not authority to create/sync it. The `1c-2g` compute selection
is a proposed implementation of the accepted design, pending a current quote
and operation approval. No provider URL, image digest or site ID is invented.

Netlify static headers do not establish headers on Next server responses or
proxied API responses. The API owns its response boundary; Next nonce CSP,
authenticated HTML, adapter conformance and actual HTTPS checks remain gates.
The marketing package currently exists as prior uncommitted workspace work;
its review and availability in a merged source artifact must be established
before attempting its build or deployment.

## Remaining completion gates

1. Reconnect Netlify and Cloudflare; verify exact teams/accounts and staging resources.
2. Record G-04 independent operator/vault/recovery access and delivered alerts.
3. Record G-08 current quotes, funding readiness and exact authorized provider operations.
4. Reconcile and explicitly approve staging Neon settings, restricted roles, bootstrap
   and migration rehearsal. Never repoint the existing test runner or use production SQL.
5. Have the inherited self-service deletion-disable change independently accepted on
   master before publishing any internet-reachable API. Do not deploy a master image
   with Better Auth `deleteUser` enabled.
6. Finish the reviewed image publication workflow, API deployment, Netlify conformance,
   DNS/certificates, private storage/recovery prerequisites, email authentication,
   telemetry, parser feasibility and the genuine worker/scanner entrypoints or
   an explicit scope decision. No placeholder may satisfy these gates.
7. Verify actual HTTPS from the required networks, restricted database access,
   readiness/lifecycle, isolation, access, telemetry and recreation/drift behavior.
8. Obtain independent review and acceptance of each scoped change and artifact.

Phase 5 is not complete while these gates remain. Production recovery RPO/RTO
are not established. The [deployment procedure](deployment-and-rollback.md)
and [conditional Phase 6 handoff](phase-6-handoff.md) do not authorize deployment
or Phase 6 implementation.

On 16 November, [PR #8](https://github.com/Tristan-X888/Nthawi/pull/8) is still
open at `9e898267251d6516167f5ec44d8da66a8c3599f4`. The first Phase 5 review is
stacked on that existing P0 branch to keep its diff separate. Retarget the Phase 5
PR to `master` after #8 is independently accepted; then rerun the strict required
checks and obtain independent approval of the final Phase 5 head before any merge.
No automatic merge or deployment is enabled.
