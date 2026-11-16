# Phase 5 staging deployment and rollback

Status: **proposed procedure; execution not authorized or performed**.
Use the [context register](agent.md) and [completion gates](README.md) first.
No command below creates, updates or deploys a provider resource.

## Artifact preparation

An operator must identify an independently accepted merged source SHA and the
actual image digest published from that SHA, with matching provenance, SBOM and
image verification. A tag, a local image ID, a synthetic digest or the current
dirty checkout is insufficient. Confirm self-service account deletion is disabled
in the exact artifact. Image publication and GitHub protected-environment/secret
configuration need their own authority; no publishing workflow is yet accepted.

The following PowerShell generates a candidate configuration locally. Both inputs
are public artifact identifiers, never secrets. It refuses mutable image tags,
unrelated registries and malformed source identities.

```powershell
Set-Location -LiteralPath 'C:/Users/USER/Desktop/Nthawi/Nthawi'
$env:Path = 'C:/Users/USER/AppData/Local/pnpm/nodejs/24.21.0;' + $env:Path
$phase5SourceSha = Read-Host 'Independently accepted merged source SHA (40 hex characters)'
$phase5ImageDigest = Read-Host 'Verified ghcr.io/tristan-x888/nthawi-api@sha256 digest'
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Source refresh failed.' }
git merge-base --is-ancestor $phase5SourceSha origin/master
if ($LASTEXITCODE -ne 0) { throw 'Source is not accepted on master.' }
$phase5Blueprint = node scripts/staging-render.mjs $phase5SourceSha $phase5ImageDigest
if ($LASTEXITCODE -ne 0) { throw 'Artifact configuration rejected.' }
$phase5Blueprint | ConvertFrom-Json | Out-Null
New-Item -ItemType Directory -Path 'infra/render' -Force | Out-Null
[System.IO.File]::WriteAllText(
    (Join-Path (Get-Location) 'infra/render/staging-api.generated.json'),
    ($phase5Blueprint -join [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
)
```

JSON is also a YAML document. Validate the candidate against the current
[Blueprint schema](https://render.com/schema/render.yaml.json), then run the
current Render CLI's read-only Blueprint validator before proposing sync:

```powershell
render blueprints validate infra/render/staging-api.generated.json
if ($LASTEXITCODE -ne 0) { throw 'Render validation failed; do not sync.' }
```

The Render CLI is not installed in the audited environment. The generator was
validated against the official schema using a synthetic artifact only. Do not
treat this as account-aware validation of a deployable artifact.

## Operation record required before execution

For each individual operation, provide the exact provider account/workspace,
resource identity, source/artifact, desired configuration diff, current quote,
maximum exposure, rollback and operator. Record the owner's explicit answer.
Existing resources or budget envelopes never authorize a new operation.

- **Neon staging only:** project `calm-math-03562419`, branch
  `br-tiny-hall-za0rrr1l`, endpoint `ep-super-frost-zawnips1` (current branch name
  `production` is inside the staging project). Proposed rename `staging`, explicit
  0.25–1 CU/300-second suspend and a separately decided history window. Review
  current default and endpoint settings separately. Bootstrap with distinct generated
  secrets using the existing password guard, then authorize rehearsal and restricted-role
  acceptance separately. No production SQL or test-target substitution.
- **Render:** dedicated Nthawi Pro workspace, not `tea-d33afq8dl3ps738n62g0`
  (“My Workspace”). Project `nthawi`, protected/isolated staging environment,
  digest-pinned API only when the artifact and secrets are ready. An image service's
  initial creation can deploy immediately even with automatic deployment disabled.
- **Netlify:** three distinct staging projects in the verified intended team,
  stopped builds, no build hooks, runtime-only proxy key on owner only, exact
  provider-issued signed site tuple. No admin/database/Resend/OpenAI secret in a
  build or browser scope. Deploy local reviewed artifacts explicitly while builds remain stopped.
- **Cloudflare/R2:** exact authenticated account/zone required before a DNS proposal.
  Obtain actual provider-issued targets first. Restrict changes to staging hostnames;
  keep HTTPS end-to-end and storage private. Recovery account and credentials must
  be independently protected and rehearsed. No production DNS, Flexible TLS or HSTS.
- **Resend:** domain `notify-staging.nthawi.io` only after a named monitored Reply-To
  and DMARC report destination. Use provider-issued records and a domain-restricted
  key, then authorize a synthetic-recipient delivery check. No mail has been sent.
- **VM/parser, workers, scanner, telemetry:** vendor/quote/preflight and actual executable
  artifacts are required. These components are not created by the API generator.

No current quotes or G-04/G-08 completion evidence were supplied. Proposed
spending remains unapproved. Provider authentication and these gates must be
resolved before a concrete creation operation can be approved.

## Deployment acceptance and rollback

Keep ingress closed until restricted-role database acceptance, valid TLS and all
secrets are confirmed. Record deployment IDs, the immutable digest, source SHA,
DNS targets/TTL/proxy settings, certificate issuers/expiry, credential IDs/scopes
and ownership (never values), UTC timestamps and results. Verify the custom API
host and provider hostname; unsigned owner requests must receive 401 before DB
work. Validate startup, graceful shutdown, cold readiness, sanitized telemetry,
operator access, isolation, headers/cache, CORS and secret boundaries through real
HTTPS. Recreate from configuration and produce a zero-drift report before completion.

Rollback only to a previously verified digest and matching frontend deploys if
schema compatibility is established. This slice adds no migration. Do not restore
or roll back a database as a routine application rollback. Keep failed services
closed, preserve evidence, revoke compromised credentials, and obtain separate
authority for provider state changes. DNS rollback restores the recorded prior
staging records only. Delete no bucket, recovery copy, database branch or VM
without explicit target-specific authority.
