# Neon production promotion: readiness contract

Status: **tooling implemented and tested offline; no production execution**.
The readiness checker `scripts/neon-promotion-plan.mjs` does not connect to Neon,
apply SQL, provision grants, obtain credentials or authorize a release. A separate
executor, `scripts/neon-promote.mjs`, implements initial-empty production migration
only and requires a separately signed execution authorization and exact operator
confirmation. It has not been run against production. The existing test runner
and migration guard continue to refuse production. The production release remains
Phase 16 and requires the owner's separate instruction.

## Purpose and boundary

The checker binds a proposed promotion to exact checked-out source, deployment
artifact bytes, ordered migration checksums, schema and grant source hashes,
registered production identity, restricted role names, an operator confirmation,
and authenticated prerequisite attestations. A local one-use receipt prevents
concurrent or repeated acceptance of the same plan ID in one audit directory.
It is not a distributed database lock. A passed receipt means the offline
contract checked; it does not establish that a database observation is true.

Three Ed25519-signed attestations must come from a separately trusted operator
verification process. The public verification key is supplied independently of
the plan, using an already authenticated vault or operator key distribution
channel. Do not accept a public key bundled by the plan author as evidence of
independent approval. Do not generate a fresh key merely to make a plan pass.
Keep signing keys outside this repository, runtime services and browser builds.
No such production signing process or signing authority is claimed to be
deployed by Phase 4.

The operator must inspect the underlying command logs, exact-commit human
approval and CI, provider metadata, role and schema diagnostics, restore
comparison, and cleanup evidence before attesting. Signatures authenticate
those statements; they cannot make invented statements true. Existing local
unit fixtures and historical live results are not current attestations.

## Prepare a reviewable plan

1. Start from the final reviewed and accepted source commit. Use an isolated,
   clean checkout when necessary; tracked modifications cause refusal. Preserve
   `.anchor/` and private configuration. No environment file is read by this tool.
2. Build and retain the exact deployment artifact. The checker hashes its bytes
   by streaming the supplied local artifact file. A registry digest and an
   exported archive digest are different; record both in release evidence and
   place the archive's SHA-256 in this plan.
3. Run the database schema/manifest checks. `readPromotionSource()` derives
   ordered SQL SHA-256 values and timestamps from the Drizzle journal, hashes
   snapshots, schema source, compiled-manifest source, every built database `.js`
   file, role/provisioning scripts and the target registry, then emits a stable
   source-manifest SHA-256. Build the database package before preparing a plan;
   changed or missing compiled probe output invalidates the binding.
4. Assign a fresh UUID v4 plan ID. The plan's approval has the exact scope
   `production-promotion-readiness-only`, the operator's name, UTC ISO timestamps
   with milliseconds, and an expiry no more than one hour after issuance.
   This scope never permits execution.
5. Pin production exactly: environment `production`; project
   `delicate-feather-83629956`; branch `br-lively-darkness-zahxet6z`; host
   `ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech`; database `neondb`;
   port `5432`; PostgreSQL major `18`; TLS `verify-full`; `pooled: false`.
   URL overrides and additional target fields are refused. The role map is
   `migrator: nthawi_migrator`, `auth: nthawi_auth`,
   `business: nthawi_business`, `jobs: nthawi_jobs`.
6. Retain three signed JSON envelope files in the plan's directory, referenced
   by safe basenames only, in the order below. Hash the exact envelope file
   bytes into the plan. No credentials, customer rows or raw connection strings
   belong in a plan, evidence envelope, receipt or published review.

The complete plan fields are `version` (1), `id`, `sourceCommit` (40 lowercase
hex characters), `artifactSha256`, `sourceManifestSha256`, `target`, `roles`,
`migrations`, `approval`, and `evidence`. Each migration has `name`, `createdAt`
(the Drizzle journal's integer timestamp), and `sha256`. Each evidence reference
has `kind`, `file`, and `sha256`. Unknown fields fail closed.

Each envelope contains exactly `payload` and `signature`. The signature is the
base64 Ed25519 signature over UTF-8 `canonicalPromotionJson(payload)`, exported
by the checker. It is not a signature over ordinary pretty-printed JSON.
The payload contains exactly:

```text
version, kind, planId, sourceCommit, artifactSha256,
sourceManifestSha256, productionTarget, migrations, roles, approval,
issuedAt, expiresAt, result, details
```

All common values bind to this plan, including the full approval scope,
operator and timestamps. `result` must be `passed`. A trusted signer must
refuse that result until the associated live evidence actually passes.

## Required prerequisite observations

| Kind                   | Maximum observation age and signed lifetime | Required details                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isolated-rehearsal`   | 24 hours                                    | Exact registered test identity from `NEON_TARGETS.test`; `syntheticOnly: true`; `migrationChecksums`, `runtimeRoles`, `forcedRls`, `compiledApi`, and `cleanup` all `passed`.                                                                                                                                                                                    |
| `production-preflight` | 15 minutes                                  | Authorized read-only observation; PostgreSQL 18; applied migrations are an exact prefix of the reviewed ordered list; no schema drift; role profiles passed; verified direct TLS; protected branch; selected Launch entitlement; seven-day history; 0.25–1 CU; suspension disabled; usable connection capacity at least 88 for peak 66 with 25% unused headroom. |
| `recovery-round-trip`  | 24 hours                                    | Dump, same-snapshot manifest, and separate role/grant capture SHA-256 values; isolated restored branch ID distinct from production and the existing test branch; `twoTenantCoverage`, `sameSnapshotBarrier`, `restoredManifest`, and `cleanup` all `passed`.                                                                                                     |

The preflight detail keys are exactly `readOnly`, `postgresMajor`,
`appliedMigrations`, `schemaDrift`, `roleProfiles`, `tls`, `protected`, `plan`,
`historySeconds`, `minCu`, `maxCu`, `suspendTimeoutSeconds`, and
`usableConnections`. Normalize a provider-verified Launch subscription
(`launch` or `launch_v3`) to `plan: "Launch"` only after observing it; Free,
unknown or legacy entitlements are not accepted by this readiness contract.
The expected values are `true`, `18`, the observed ordered migration prefix,
`none`, `passed`, `verify-full`, `true`, `Launch`, `604800`, `0.25`, `1`,
`-1`, and the actual usable capacity, respectively.

Recovery detail keys are `dumpSha256`, `manifestSha256`,
`rolesCaptureSha256`, `restoredTargetId`, `twoTenantCoverage`,
`sameSnapshotBarrier`, `restoredManifest`, and `cleanup`. Retain the full
restore target's separately authorized project/host/database identity in
the underlying evidence; a branch ID alone cannot authorize a restore.

No production metadata, catalog read or connection is authorized by this
document. An archived target needs explicit connection/lifecycle authority
before collecting the preflight. A test source does not substitute for a
production preflight. Separate staging targets require a reviewed registry
extension; this checker currently accepts only the existing registered test
target for rehearsal.

## Run the offline check

Use Node 24.21.0 and pnpm 10.16.1. Replace paths and identity values with
reviewed non-secret artifacts. The confirmation string is exactly `CHECK`,
the UUID, the source SHA and the production branch ID, separated by spaces.

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
pnpm.cmd exec node --test scripts/neon-promotion-plan.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Promotion contract regressions failed.' }

pnpm.cmd exec node scripts/neon-promotion-plan.mjs --check 'C:\PRIVATE-EVIDENCE\promotion-plan.json' --trust-key 'C:\TRUSTED-KEYS\operator-verification-public.pem' --confirmation 'CHECK ACTUAL_UUID ACTUAL_REVIEWED_SOURCE_SHA br-lively-darkness-zahxet6z' --audit-directory 'C:\PRIVATE-EVIDENCE\promotion-audit' --artifact 'C:\PRIVATE-EVIDENCE\reviewed-api-image.tar'
if ($LASTEXITCODE -ne 0) { throw 'Offline promotion contract rejected.' }
```

A pass emits `NEON_PROMOTION_OFFLINE_CHECK_PASSED` and
`productionExecutionAvailable: false`, and writes the plan ID's receipt with
source/artifact/evidence hashes and UTC time. There is no `--execute` option.
Unknown arguments are rejected before reading configuration. Existing receipts
and lock files block reuse. Do not delete them to rerun; investigate an
interrupted check, preserve its evidence and issue a new reviewed plan ID.

## Separate initial-production executor

The executor's `--check` mode validates production configuration, all readiness
signatures and source/artifact hashes, a readiness receipt, and the separate
execution authority without opening a connection. `--execute` additionally
acquires a session advisory lock on the verified migrator client. It observes
PostgreSQL 18, exact login/database/ownership, restricted role attributes and
memberships, public-schema ownership/ACLs, no non-extension application objects,
no application namespaces or migration history, no large objects, publications,
subscriptions or DDL event triggers, the installed vector extension and
1536-dimensional vector capability. The resulting stable catalog hash must
match the separately signed authorization. `inspectInitialProduction(client)`
exports this same read-only observation for an explicitly authorized operator
preflight; it must never be invoked merely to obtain a missing signature.

The executor revalidates source, artifact and signatures after acquiring the
database lock, applies the Drizzle journal using that same client, provisions
the existing reviewed runtime grants in a transaction, compares actual applied
SQL hashes/timestamps, and connects as the actual auth/business runtime logins
to run the compiled schema/roles/RLS readiness probes. All four profiles were
checked before migration and by the existing role provisioner. The jobs schema
is not created. Runtime API HTTP acceptance and Linux shutdown remain the
separate accepted readiness/release checks, rather than a promise made by a
catalog-only executor.

Existing migrated targets are refused, even when their history is a valid prefix.
This deliberately bounds the supported production operation to first migration;
later upgrades need a separately reviewed path. Role bootstrap and database
ownership transfer are separate authorized administrator operations; the executor
does not create or reset logins. Any bootstrap uses `infra/neon/bootstrap.psql`,
whose included `bootstrap-password-guard.psql` refuses a missing secret or one
secret shared by two roles before any role change (P4-D08). Session locking
coordinates cooperating operators, not a database administrator making unrelated
DDL outside the lock.

The execution authorization uses the same signed-envelope format and a separately
trusted key. Its payload has exactly these fields:

```text
version (1), id (fresh UUID v4), scope (initial-production-migration),
planId, sourceCommit, artifactSha256, sourceManifestSha256, productionTarget,
offlineReceiptSha256, expectedEmptyCatalogSha256, operator, issuedAt, expiresAt
```

It binds the exact readiness plan, receipt bytes and preflight fingerprint, and
expires within 15 minutes of issuance. The readiness approval does not authorize
this scope. A trusted operator only signs it after the owner's separate concrete
execution instruction and exact-commit independent review/CI acceptance.

The operator supplies only the exact four production URLs and role names in a
private process environment, plus `NEON_TARGET=production`,
`NEON_EXPECTED_PROJECT_ID=delicate-feather-83629956` and
`NEON_EXPECTED_BRANCH_ID=br-lively-darkness-zahxet6z`. URLs must use the individual
restricted role, direct registered host, explicit port 5432, `neondb` and exactly
`sslmode=verify-full`. Every URL must carry a different password: the shared
connection reader refuses reuse, and the executor then reports only
`NEON_PRODUCTION_PROMOTION_REJECTED`. The executor builds explicit connection
fields with certificate verification; it rejects inherited `PG*`, Node
preload/custom-CA and OpenSSL overrides. Do not print or place URLs in command
arguments. The executor reads no `.env` file.

The complete future operator check command is:

```powershell
pnpm.cmd exec node scripts/neon-promote.mjs --check --plan 'C:\PRIVATE-EVIDENCE\promotion-plan.json' --trust-key 'C:\TRUSTED-KEYS\operator-verification-public.pem' --authorization 'C:\PRIVATE-EVIDENCE\separately-approved-execution.json' --receipt 'C:\PRIVATE-EVIDENCE\promotion-audit\ACTUAL_PLAN_UUID.json' --artifact 'C:\PRIVATE-EVIDENCE\reviewed-api-image.tar' --audit-directory 'C:\PRIVATE-EVIDENCE\execution-audit' --plan-confirmation 'CHECK ACTUAL_PLAN_UUID ACTUAL_REVIEWED_SOURCE_SHA br-lively-darkness-zahxet6z' --confirmation 'EXECUTE ACTUAL_EXECUTION_UUID ACTUAL_REVIEWED_SOURCE_SHA br-lively-darkness-zahxet6z'
if ($LASTEXITCODE -ne 0) { throw 'Production operator preflight contract rejected.' }
```

Only after the separate release instruction may the operator repeat that exact
command with `--execute` in place of `--check`. There is no implicit target or
execution mode. The audit directory must be the controlled durable operator
location; changing it to evade an existing receipt is prohibited. The executor
creates a fresh authorization-ID audit file exclusively, fsyncs started, preflight,
migration-applied and terminal records, and keeps the advisory lock until after
postchecks. Audit events contain identifiers and hashes, never exception text or
database rows. Failed or completed files block blind reruns. A connection cleanup
failure gets a separate failure record and a failed command result.

The implementation has injected connection/catalog/migration/grant/probe and
failure tests. This is offline evidence, not an authorized production execution
or a claim that the current candidate satisfies its preconditions. Production
signing authority, credentials, fresh metadata/catalog fingerprints, bootstrap,
account history, round-trip proof and release acceptance must actually exist
before a signed command can pass.

## Partial failure and incident procedure

Stop on drift, missing checksums, failed rehearsal, stale preflight,
insufficient capacity, missing recovery proof, incomplete journal tail,
expired approval, concurrent operation or any migration failure. Preserve
the exact last applied migration, database diagnostics and audit record.
Revoke execution admission and keep traffic closed. Do not reset a schema,
erase migration history, reapply bootstrap/grants blindly or retry the entire
batch without inspecting partial completion.

Prefer a reviewed forward fix where it preserves current deletion, grant and
accounting truth. Restoration is an explicit incident decision: isolate the
destination, restore database and credentials/roles separately, verify hashes,
replay the contiguous deletion/expiry/lifecycle journal with generation fencing
before reopening, and reconcile payments without replaying financial side
effects. Missing or corrupt recovery material keeps traffic closed. Shane
is the selected primary operator and Sherise the selected backup; their
independent access rehearsal remains a Phase 5 gate. Full database/object
independence and timed recovery qualification remain Phase 15.
