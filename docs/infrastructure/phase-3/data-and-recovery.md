# Phase 3 data and recovery design: Neon, R2, deletion and recovery

Part of the [Phase 3 design bundle](README.md). Status: **selected design**,
plus the approved eight-day recovery window (P3-U05). Nothing here creates,
unarchives, connects to, restores or modifies a Neon resource, and nothing
enables R2. Phase 4 owns Neon lifecycle and readiness; Phase 5 owns approved
creation. Evidence IDs refer to the
[data and isolation evidence](../../sources/phase-3-data-isolation-research-2026-11-04.md).

## Data categories

| Category                                                  | Store                                          | Access                               | Held-storage metering                                      | Retention rule (binding source)                                                                      | Recovery coverage                                  |
| --------------------------------------------------------- | ---------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Identities, sessions, OAuth accounts, verification tokens | PostgreSQL (`nthawi_auth`)                     | API only                             | No                                                         | Account lifetime; sessions expire; account deletion purges within 7 × 24 hours (D-19).               | Database checkpoints and native history.           |
| Workspaces, installations, sources, revisions, approvals  | PostgreSQL (`nthawi_business`, forced RLS)     | API; worker through job grants       | Extracted text and revision payload count (v0.3 catalogue) | Source, workspace or account deletion; unavailable immediately, purged within 7 × 24 hours.          | Checkpoints and native history.                    |
| Chunks and embeddings (1536 dimensions)                   | PostgreSQL                                     | API retrieval; worker indexing       | Derived and embedding payload count                        | Follows its revision.                                                                                | Checkpoints (regeneration would re-spend tokens).  |
| Conversations, messages, citations                        | PostgreSQL                                     | API                                  | No (counted as messages)                                   | 90 × 24 hours from each message's creation, with no reset on activity; earlier deletion wins (D-19). | Checkpoints and native history.                    |
| Catalogue, orders, payments, grants, usage ledger         | PostgreSQL                                     | API and worker (Phase 7 grants)      | No                                                         | Financial and audit periods need an operator-approved policy before Phase 7 (D-19 gate).             | Checkpoints and native history.                    |
| Jobs, leases, outbox                                      | PostgreSQL (`nthawi_jobs`, future)             | Worker                               | No                                                         | Transient; finished jobs pruned by policy (Phase 8).                                                 | Checkpoints; restored jobs re-fenced.              |
| Deletion and revocation journal                           | PostgreSQL plus a copy in the recovery account | Worker writes; restore tooling reads | No                                                         | Kept for the recovery window so restores can replay it.                                              | Independent copy is authoritative after a restore. |
| Quarantine objects (unscanned uploads)                    | R2 `*-quarantine`                              | API writes; worker reads and deletes | Yes, reserved before upload                                | Deleted after promotion or rejection; abandoned intents cleaned within 24 hours.                     | Copied before acknowledgement.                     |
| Clean originals                                           | R2 `*-originals`                               | Worker writes; API gateway reads     | Yes                                                        | Until deletion, then purged within 7 × 24 hours.                                                     | Copied before acknowledgement (same bytes).        |
| Derived artifacts (parser output payloads)                | R2 `*-derived`                                 | Worker writes; API gateway reads     | Yes                                                        | Follows its revision.                                                                                | Copied when written.                               |
| Recovery copies                                           | Separate Cloudflare recovery account           | Recovery writer; operators restore   | No (operator backups are not customer-metered)             | At most 8 days, including deleted bytes (P3-U05).                                                    | They are the recovery layer.                       |
| Logs, metrics, probe records                              | Render logs and monitoring provider            | Operators                            | No                                                         | No document or message content; raw probe records 90 days, monthly summaries 13 months.              | Not restored; evidence only.                       |

## Neon

**Production candidate.** Observed project `delicate-feather-83629956` in
London, PostgreSQL 18, with archived branches `production` and
`test/nthawi-database-bootstrap` (OBS-D01, OBS-D02). It is reused for
production only if Phase 4 accepts it. Selected design: the Launch plan,
because the Free plan is capped at six hours and seven-day history needs Launch
or Scale (NEON-01, NEON-06). History window 7 days, the Launch maximum.
Production compute autoscales from 0.25 to 1 CU with scale-to-zero disabled, so
queue polling and probes do not meet cold starts (NEON-03). The production
branch becomes protected, which Launch supports (NEON-06).

**Staging.** A separate Neon project, proposed name `nthawi-staging`, in the
same region as production so that latency measurements carry over. It is a
different project rather than a branch so that history, settings, roles and
project-scoped operator keys are separate. It holds synthetic data only and
never receives production rows.

**Rehearsal branches.** Migration rehearsals use a temporary branch with an
expiry and a named owner. When production holds customer data, rehearsals use
schema-only or sanitized data. Never reset an environment that contains
required evidence or customer data as a routine repair.

**Phase 4 boundary.** Connecting to, querying, viewing tables of, branching
from, restoring, resetting, protecting or calling branch-level APIs on an
archived branch unarchives it (NEON-05). Phase 3 therefore made metadata-only
project and branch-list reads. Phase 4 decides branch lifecycle, plan and
history, proves the export path below, re-establishes isolated acceptance, and
writes the production promotion procedure.

### Roles and privileges

| Role                                  | Purpose                                        | Consumer                       | Privileges                                                                                                                                                                                                                                                            |
| ------------------------------------- | ---------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nthawi_migrator`                     | DDL owner, migrations and runtime provisioning | Operator migration runner only | Owns schemas and objects; never configured on a runtime service.                                                                                                                                                                                                      |
| `nthawi_auth`                         | Identity and session tables                    | API                            | Existing restricted profile: LOGIN, NOINHERIT, no superuser, NOBYPASSRLS, no CREATEDB/CREATEROLE.                                                                                                                                                                     |
| `nthawi_business`                     | Tenant business tables under forced RLS        | API                            | Same profile; tenancy set transaction-locally by `withTenantTransaction`.                                                                                                                                                                                             |
| `nthawi_jobs`                         | Queue and lifecycle work                       | Jobs worker (Phase 8)          | Same profile; grants reviewed with the worker implementation.                                                                                                                                                                                                         |
| Export login (proposed)               | Complete consistent logical export             | Recovery cron job only         | Created through the Neon Console or API so that it is a `neon_superuser` member (NEON-04), and dumps with `pg_dump --role=neon_superuser` (PG-01). Phase 4 must prove the switch works and that the dump includes every forced-RLS table. Never a runtime credential. |
| Read-only inspection login (optional) | Operator diagnostics                           | Operators                      | Defined in Phase 4 if needed; no bypass of row security.                                                                                                                                                                                                              |

The export login is deliberately broad: it can read every tenant. It is
confined to the matching protected environment in the separate recovery-only
Render organization/workspace, audited per run and
rotated quarterly (policy R3 in [configuration](configuration.md#rotation-policies)).
Role attributes are not inherited through membership, so a membership grant on
its own would not bypass row security. Phase 4 must observe a complete export
succeed under default `row_security=off`. An error under the default (PG-01)
means the path is unproven. Never treat a partial `--enable-row-security` dump
as a backup. Roles and grants are captured separately, because `pg_dump` covers
one database (PG-01).

### Connections

Selected design: **direct, TLS `verify-full` connections for every consumer**,
as the existing guards require (OBS-D03). Pooling stays deferred, not
rejected. Neon's PgBouncer transaction mode drops session `SET`, advisory
session locks, `LISTEN`/`NOTIFY` and SQL `PREPARE` (NEON-02). The startup
`statement_timeout`, the queue library and the transaction-local tenancy have
not been proven compatible with it. Pooling for runtime consumers needs
compatibility tests and a reviewed change to the guards. Migrations, exports,
restores and session-dependent work stay direct permanently.

| Consumer                        | Steady connections | Peak during deploy overlap   |
| ------------------------------- | ------------------ | ---------------------------- |
| API, 2 replicas × 10 (OBS-D04)  | 20                 | 40 (old and new replicas)    |
| Jobs worker, cap 10 per process | 10                 | 20                           |
| Recovery export                 | 0                  | 2 (snapshot holder and dump) |
| Migration runner                | 0                  | 2                            |
| Operator inspection             | 0                  | 2                            |
| **Total**                       | **30**             | **66**                       |

At 0.25 CU, `max_connections` is 104 with 7 reserved, leaving 97 (NEON-02).
With autoscaling, the value depends on both ends of the range (NEON-03), so
Phase 4 records the actual `SHOW max_connections` for the configured range. The
budget must fit the minimum-size figure with at least 25% headroom. The worker
cap of 10 is a design value for Phase 8. Staging has its own project and
budget. Recompute before adding a replica or changing pool sizes; stop a deploy
that would exceed the budget.

## R2 private object storage

**Accounts.** The existing Cloudflare account (OBS-H04) holds staging and
production buckets once R2 is enabled. Enabling it is a subscription step
(OBS-D05). A **separate Cloudflare account** holds recovery copies. It is
administered through recovery-only logins for P and B, each with MFA, and those
logins are not members of the production account and vice versa. A
compromised production login therefore cannot remove recovery locks.

**Buckets** (proposed names): `nthawi-staging-quarantine`,
`nthawi-staging-originals`, `nthawi-staging-derived`,
`nthawi-production-quarantine`, `nthawi-production-originals`,
`nthawi-production-derived`; in the recovery account,
`nthawi-recovery-staging` and `nthawi-recovery-production`. Every bucket uses
location hint `weur` (R2-06). No jurisdiction is selected, because no
residency requirement is approved and a jurisdiction cannot be changed later.
On every customer bucket the `r2.dev` URL stays disabled and no custom domain
is attached (R2-04). No browser accesses R2 directly, so no bucket has CORS
rules.

**Tokens.** Tokens are bucket-scoped, one per consumer and permission (R2-05):

| Token (proposed)         | Permission and buckets                                                                     | Consumer                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `api-quarantine-write`   | Object Read & Write on `*-quarantine`                                                      | API upload gateway                                                        |
| `api-read`               | Object Read on `*-originals`, `*-derived`                                                  | API download gateway                                                      |
| `jobs-write`             | Object Read & Write on all three environment buckets                                       | Jobs worker                                                               |
| `recovery-intake-writer` | Object Read & Write on the environment's recovery bucket                                   | Independent recovery intake service only; API/jobs never receive this key |
| `recovery-job-writer`    | Object Read & Write on checkpoint prefixes, bucket-scoped if narrower scope is unavailable | Protected recovery cron job; never API/jobs                               |
| `recovery-admin`         | Administrator in the recovery account                                                      | Operators only; never a runtime                                           |

R2's standard long-lived Object Read & Write preset includes deletion (R2-05).
Its temporary credentials can instead restrict actions to `PutObject` and
prefixes; that delegation is an evaluated alternative, not the selected or
proven intake protocol. On customer buckets, the
API never receives delete rights to originals. For independent copies, API and
jobs call a separate authenticated **append-only recovery intake service** in
the protected recovery plane; they receive no raw recovery R2 credential.
Intake and checkpoints run in a separate Render organization/account and Pro
workspace under recovery-only provider identities, with their own isolated
staging/production environments. Public HTTPS crosses the workspace boundary;
Render terminates TLS, so canonical Ed25519 request signatures, timestamp and
durable nonce replay checks authenticate callers. Private isolation stays on.
Its narrow create interface accepts bounded immutable bytes or journal events,
checks caller/environment/job/lifecycle identity, computes size/hash, creates a
fresh non-overwritable key and returns a signed receipt. It has no application
list/read/overwrite/delete endpoint, arbitrary object URL or user-chosen key.
Retries with the same operation ID return the same receipt and cannot replace
bytes. Recovery storage keys, signing keys and operator GC/lock authority stay
outside the application plane. Bucket locks add protection while active; after
expiry, independent access separation remains the control, not a nonexistent
long-lived write-only preset. Compromise of the recovery plane itself is residual
risk and requires isolated credentials, audit and rehearsed recovery.

### Object identity and state

Keys are opaque and never derived from user filenames:
`{environment}/{ownerId}/{workspaceId}/{sourceId}/{fileVersionId}/{objectId}`.
For each object the database records bucket, key, exact byte length, a SHA-256
computed by Nthawi while streaming (a multipart ETag is not a content hash,
R2-03), detected type from content inspection, state and retention state.
Originals are at most 10 MiB, so every write is a single-part PUT with a
no-overwrite precondition. A frozen object is never rewritten; a replacement is
a new file version and key.

| Machine    | States (from P-01 page 13)                                                        | Rule                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Upload     | authorized > receiving > received/frozen > quarantined                            | Reservation precedes `authorized`; `frozen` records length and hash; `quarantined` requires a recovery-copy receipt.                  |
| Scan       | pending > scanning > clean, infected, failed or rejected                          | Only `clean` with a fresh signature, a matching hash and the current lifecycle generation may continue; everything else fails closed. |
| Extraction | queued > extracting > normalized > awaiting review, or a specific bounded failure | Parser output is bound to input hash, parser image digest and policy version.                                                         |
| Knowledge  | draft > approved > indexing > ready > published > superseded or revoked           | Approval binds the exact content hash; any edit invalidates it; the published pointer swaps atomically after `ready`.                 |
| Deletion   | requested > immediately unavailable > cleanup pending > verified purged           | Unavailability commits with the request; storage capacity is released only after verified purge, and only once.                       |

A generic "processed" flag never authorizes publication.

### Downloads, capabilities and CORS

Owners download originals and derived artifacts only through an authenticated
API gateway. The gateway rechecks session, resource and lifecycle state on
every request, including range requests, streams with `private, no-store`,
`Content-Disposition: attachment` with a sanitized name and `nosniff`. An
authorization failure never redirects to a bearer URL. Quarantine is never
downloadable. A presigned URL is a bearer capability until it expires and
cannot be revoked individually, so presigned URLs are not used for owner
downloads. Any internal use is bounded to 60 seconds and one object. Deletion
must deny new reads immediately; the gateway rechecks lifecycle generation
before serving each bounded chunk and aborts an in-flight transfer on
revocation. Already delivered bytes cannot be recalled. CORS only
limits what browsers may read across origins; it never authorizes a request,
and non-browser callers still need credentials.

### Cleanup

Upload intents expire after 24 hours. An hourly reconciler compares database
references, reservations, leases and bucket listings. It deletes expired
quarantine objects and releases their reservations exactly once. Unknown
objects go to operator review instead of deletion by prefix. Lifecycle rules
are only a backstop: quarantine objects expire after 7 days, and the default
7-day multipart abort stays (R2-02). They are never the deletion mechanism for
the 7 × 24-hour purge, because expiry is asynchronous. Each deletion is a
durable task that verifies the object is absent before it completes.

## Deletion and retention

This applies D-19 and the v0.2 lifecycle exactly. Approved decisions are
marked; the rest is how the design meets them.

| Event                           | Immediate effect                                                                                                                                                                                | Live purge deadline                                        | Recovery copies                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Source or file deletion         | Unanswerable, downloads refused, jobs cancelled and fenced, stock slot freed (approved).                                                                                                        | 7 × 24 hours (approved D-19)                               | Leave every copy by 8 days (approved P3-U05).                                                           |
| Workspace deletion              | As above, plus installation disabled and visitor capabilities revoked.                                                                                                                          | 7 × 24 hours                                               | 8 days.                                                                                                 |
| Account deletion                | Sessions and every credential revoked; content unavailable; billing records kept under the financial policy (Phase 7 gate).                                                                     | 7 × 24 hours                                               | 8 days.                                                                                                 |
| Message age                     | Unavailable at its creation-age expiry; never reset by activity.                                                                                                                                | 90 × 24 hours from creation, no activity reset (approved). | At most 8 days after logical expiry, not after physical purge.                                          |
| Expiry, grace and abandonment   | v0.2: processing stops at expiry; read/export days 0-7; identity and billing only days 7-30; at day 30 with no active or funded future grant, credentials revoked and abandonment purge queued. | Abandonment purge within the following 7 days.             | At most 8 days after the logical abandonment-deletion event; physical purge does not restart the clock. |
| Reactivation during abandonment | Lock lifecycle generation; cancel only purge work not yet irreversible; every purge worker rechecks generation and grants.                                                                      | Not applicable                                             | Not applicable.                                                                                         |
| Rejected or infected upload     | Never processed or served; evidence recorded without content.                                                                                                                                   | Quarantine object deleted at rejection; 7-day backstop.    | 8 days.                                                                                                 |
| Financial and audit evidence    | Separate from content deletion; minimal; no message bodies.                                                                                                                                     | Operator-approved categories and periods before Phase 7.   | As the approved policy says.                                                                            |

Explicit owner deletion is never cancelled by a payment. Once irreversible
purge starts, retained-data reactivation is refused under the v0.2 refund and
fresh-account rule. Account deletion is enabled in the Better Auth foundation,
but cross-product orchestration does not exist yet (P-01 page 11). Phase 6 must
keep public account deletion unavailable until this workflow exists.

**Database content cleanup and checkpoint barrier.** The approved seven-day
live-purge maximum is an upper bound. This design selects a tighter **15-minute
deadline** for removing logically deleted or expired content from visible
database rows, including message bodies, extracted text, vectors, derived
payloads and account PII covered by deletion. R2 physical-object cleanup can
still use the approved seven-day maximum. Preserve only the minimal financial
and audit metadata permitted by the separate policy, never message/document
bodies disguised as audit evidence. Source/workspace/account deletion,
90-day message expiry and logical abandonment deletion all use their actual
policy event time; delayed job discovery never restarts the clock. Generation
and funded-future-grant checks precede abandonment deletion.

Priority deletion work reserves two of the worker's existing ten database
connections and runs ahead of ingestion, without using owner ingestion-run
allowances or increasing the connection budget. It removes database content
within 15 minutes. Every
checkpoint checks the same exported snapshot, across all content-bearing
tables, for deletion/expiry candidates older than 15 minutes. If any content
remains, abort before `pg_dump` or any dump upload; do not merely withhold the
final manifest after storing a locked dump. Drain/purge, open a new snapshot and
retry within the slot deadline, or fail closed and page both operators. The
snapshot-holder uses the proven effective export role, so forced RLS cannot
hide overdue rows. A schema change must update this exhaustive classification
and its negative fixtures before export is allowed. Minimal metadata may
remain, but checkpoints must never include overdue content bytes. A deletion
that commits after the exported snapshot can appear in that earlier snapshot;
the time bound below explicitly accounts for the allowed cleanup lag.

Phases 4 and 6-9 prove this barrier and priority cleanup for every content
category as it is introduced. Phase 15 races deletion/expiry, snapshot start,
cleanup, stalled jobs and GC, including a row retained just below and just
above 15 minutes. A missed cleanup deadline invalidates checkpoint admission
and the recovery argument; it is an incident, never a reason to extend the
eight-day deleted-byte ceiling. Unavailability and the independent deletion
receipt still take effect at acceptance; neither waits for physical cleanup.

## Recovery design

Targets (D-18, approved): RPO at most 1 hour, RTO at most 4 hours, at least 7
days of usable history, independently protected. Measurement follows D-27.
Nothing here demonstrates them.

| Layer | Mechanism                                                                                                                                     | What it protects against                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| L1    | Neon native history, 7 days on Launch (NEON-01).                                                                                              | Bad migrations and logical errors inside Neon; fastest restore.          |
| L2    | Independent database checkpoints in the recovery account: every 30 minutes, kept 24 hours; at 00:00 and 12:00 UTC, kept 180 hours (7.5 days). | Loss or compromise of the Neon project or account; errors older than L1. |
| L3    | Independent object copies, written before an upload is acknowledged and when derived artifacts are written.                                   | Loss of R2 objects or of the production Cloudflare account.              |
| L4    | Independent deletion and revocation journal, durable signed receipt before accepting the database transition; outbox reconciles completion.   | Restoring deleted data into service.                                     |
| L5    | Reviewed configuration, runbooks and a vault that B can open without P.                                                                       | Losing a person, laptop or provider login.                               |

Scheduled Neon snapshots (NEON-06) may be added as an extra in-provider layer.
No target depends on them, because they share Neon's failure domain.

**Window and locks (P3-U05).** Recovery objects are protected by per-prefix
bucket lock rules (R2-01):

| Prefix / object class           | Lock duration                      | Rationale                                                                                         |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Half-hourly checkpoint dumps    | 28 hours (`maxAgeSeconds=100800`)  | Covers 24-hour usable retention plus four-hour restore; bounded GC follows.                       |
| 12-hourly checkpoint dumps      | 185 hours (`maxAgeSeconds=666000`) | Covers 180-hour usable history plus four-hour restore; bounded GC still fits eight days.          |
| Object copies                   | 7 days                             | Ensure every live object always has at least one locked copy.                                     |
| Deletion and revocation journal | 186 hours (`maxAgeSeconds=669600`) | Covers a 180-hour checkpoint plus four-hour restore; GC within six hours removes it by 192 hours. |

An age-based lock alone would leave older copies of still-live objects
deletable. Each 12-hourly checkpoint (the 00:00 and 12:00 UTC runs) therefore
re-copies any live object whose newest copy is at least 5.5 days old. Every
half-hourly checkpoint verifies a hash-matching copy no older than 6 days with
an active seven-day lock and at least 24 hours of lock protection remaining.
Only a checkpoint with complete fresh locked coverage can become usable;
missing, stale or unlocked coverage fails closed and pages both operators.
An independent hourly inventory pages when any live object's last protected
copy reaches 6 days, leaving a day before lock expiry; refresh failure pages
immediately. Test skipped refreshes and stalled checkpoint jobs. Manifests
reference the newest verified copy. A
garbage-collection run every 6 hours in the matching environment of the
recovery-only workspace deletes
copies that are both unlocked and unreferenced by any retained manifest, and
also deletes expired dumps and manifests, then verifies their absence. A
deleted object gets no new copies. Usable checkpoint retention is measured
from the exported snapshot's start, not upload completion. Its last referenced
object copy is needed for at most 180 hours after that snapshot, or 184 hours
with a restore pin; GC runs within the following six hours. Dump locks are
measured from object creation, which must finish within 20 minutes of the
scheduled slot. A 185-hour dump lock plus six-hour GC therefore keeps deleted
database bytes for at most 191 hours 20 minutes from the snapshot start,
below 192 hours from snapshot start. A later snapshot can contain a row for
at most 15 minutes after logical deletion under the cleanup barrier above.
The deleted database-byte bound is therefore 15 minutes + 191 hours
20 minutes = **191 hours 35 minutes after logical deletion**, below 192 hours.
An alarm pages before
a copy reaches its deletion deadline; lifecycle expiry alone may lag (R2-02).
At any moment the oldest usable 12-hourly checkpoint is between 7 and 7.5
days old, so at least 7 days of points exist. The nominal schedule references
up to 48 + 15 = 63 usable checkpoints; physical dump count can exceed that
during GC delay, bounded restore pins and incomplete runs. Price physical
retention amplification separately rather than treating 63 as a storage bound.

Expired locks do not authorize application deletion: raw keys are held only by
the independent recovery services. Recovery GC preserves every copy referenced
by a retained checkpoint, and refreshes live-object copies before their final
protected copy ages out. Immutable source hashes allow a verified replacement
copy of identical bytes to satisfy an older manifest; the signed copy catalog
records that mapping. A seven-day lock alone cannot guarantee seven-and-a-half
days of manifest usability. Gate checks require that every retained manifest
has complete verified object coverage, including deleted originals, until its
expiry. Never extend a deleted object's deadline by copying or rekeying it.

Before a restore begins, the recovery control plane atomically pins its chosen
manifest and verified copy catalog against GC for at most four hours. GC honors
only authenticated, bounded pins; operators cannot keep deleted content beyond
its 192-hour hard deadline. For object copies, 180 hours of usable retention
from snapshot start, four-hour restore pin and six-hour GC total 190 hours on
that same clock. The dump's independent age lock can retain its bytes until
191 hours 20 minutes as calculated above; both bounds stay below 192 hours.
Every retained dump remains locked through its possible restore need (28 hours for half-hourly points and 184 hours for 12-hourly points); Phase 15 must prove deletion attempts fail during those periods.
For 12-hourly points, the 185-hour lock covers the 184-hour restore
need.
If insufficient time remains, abort or select a newer complete
checkpoint; never reopen while copies can disappear mid-restore. Test GC racing
a restore, pin expiry and restart, and the deleted-byte deadline.

**Checkpoint protocol.** Each recovery run:

1. On the snapshot-holder connection, explicitly `SET ROLE neon_superuser`
   and verify its effective privilege before opening a `REPEATABLE READ READ ONLY` transaction; then exports its snapshot with
   `pg_export_snapshot()`, and in that same snapshot reads the referenced
   object identities, hashes, the deletion-journal high-water mark, and the
   schema and migration versions. Both this manifest reader and the separate
   dump connection must use the privileged role; membership alone does not
   inherit BYPASSRLS. Phase 4 must compare manifest and dump tenant coverage
   across forced-RLS tables, including negative restricted-role evidence.
   In this same exported snapshot, run the exhaustive 15-minute content
   cleanup barrier before starting `pg_dump` or uploading any dump bytes.
   An overdue candidate aborts the snapshot; retry only after cleanup with a
   new snapshot. An invalid export must never be uploaded under a retention lock.
2. Runs `pg_dump --snapshot=<id> --role=neon_superuser` in custom format over a
   direct TLS connection (PG-01), plus a catalog capture of roles and grants.
3. Verifies that every referenced object already has a recovery copy with a
   matching hash. For every live object, also verifies copy age at most six
   days, active lock and at least 24 hours until lock expiry; reference and hash
   checks still apply to deleted originals retained for older points. Missing
   or stale locked coverage makes the checkpoint unusable, blocks unprotected
   admissions and pages both operators before expiry.
4. Register each dump attempt's immutable identity, snapshot time and expiry in
   the recovery catalog before uploading it. GC and the hard deletion deadline
   cover complete, incomplete and failed attempts, not only published manifests.
   Writes the dump and a manifest (dump checksum, snapshot time, object hashes,
   journal mark, versions) signed with the recovery Ed25519 key, then marks
   the checkpoint complete. Partial or late runs are unusable, and the
   previous complete checkpoint stays current.
5. Ends the snapshot transaction. Completion must occur within 20 minutes of
   the UTC scheduled slot, including startup delay, export and upload; abort
   later work so a long-lived snapshot cannot bloat the primary. A missed slot
   remains missing evidence and never shifts the following scheduled start.

**Object copies.** The API acknowledges an upload only after the recovery
intake service has returned a signed receipt proving stored quarantine bytes,
hash and length match. The API holds only its environment-specific create-signing key, no R2
recovery key. The receipt binds the operation, environment, object identity,
hash/bytes and policy version. Intake checks lifecycle generations against its
own durable append-only receipt/fencing ledger, without a production database
credential. A committed deletion tombstone cannot be cleared by an application
caller submitting a larger generation. Replays and nonce/operation IDs are
durably idempotent across restarts; conditional writes and a serialized ledger
commit must prevent concurrent conflicting receipts. It independently refuses
stale/revoked identities it has recorded; the caller still checks current
database authorization and grants. It never trusts document paths or fetch URLs.
Promotion to originals reuses the same bytes, so no second copy is needed.
Derived payloads are copied when written. If the recovery account is
unavailable, uploads are refused with a clear state rather than accepted
unprotected.

**Deletion/revocation journal protocol.** Before accepting a deletion or
credential/grant revocation, the orchestrator obtains an idempotent signed
receipt for the intent from independent intake. It then locks/rechecks the
lifecycle generation and commits immediate unavailability plus the receipt ID
in the same database transaction, and only then acknowledges acceptance.
An external receipt followed by a failed/unknown DB commit is conservatively
deny-only during restore until reconciled; it cannot expose content or trigger
an unverified financial action. The outbox records completion/reconciliation,
not the only durable copy of the deletion. On intake failure, refuse acceptance
and surface explicit pending/failure; do not claim an accepted deletion has
independent evidence when it does not. Expiry and message-age rules are also
re-evaluated against current authoritative UTC after restore.

The independent journal tracks monotonic sequence and lifecycle generations,
signed receipts and checkpoint watermarks. Recovery must prove the contiguous
tail from its checkpoint through the latest accepted transition, including
unknown-commit intents, before reopening. A missing sequence/receipt, unavailable
tail or unprovable completeness keeps affected traffic closed. Exercise crashes
before/after receipt, before/after DB commit and before completion dispatch;
repeated requests and races must remain idempotent. An old checkpoint alone
cannot prove it contains every later deletion.

**Restore procedure (summary).** The RTO clock starts at the earlier of
automatic detection or declaration.

1. Close traffic.
2. Select the latest verified checkpoint, or a Neon point in time, that
   precedes the fault.
3. Restore into a new isolated target.
4. Verify hashes, roles, grants, RLS and versions.
5. Restore or verify objects.
6. Replay the deletion and revocation journal up to its latest mark,
   including events after the checkpoint.
7. Revoke all sessions and capabilities issued after the checkpoint.
8. Reconcile payments by re-querying the provider, usage reservations,
   jobs (re-fenced) and the outbox.
9. Run the accepted critical journeys, then reopen.

Replay honors every legitimate owner deletion. If the incident is a declared
compromise, the incident commander reviews journal events attributed to the
compromise window before replay, so an attacker's deletions are not applied
blindly. That review is recorded. Never re-run paid AI calls or payment
transfers as part of a restore. If no verified point exists within the window,
declare the target missed rather than reopening stale data.

**How the targets could be met.** RPO: at most 50 minutes under the bounded
schedule for the independent database path. UTC slots start at minute 00 and
30 (`*/30 * * * *`), a 30-minute start-to-start interval; never sleep 30 minutes
after completion. Each slot must finish by slot start plus 20 minutes, including
scheduler/startup delay. Slot identity, actual snapshot time and completion are
recorded; duplicate or overlapping slot attempts cannot publish twice. An
independent monitor detects missing starts or missed deadlines. With the
preceding slot's snapshot at or after its slot start, the next completed point
is available within 30 + 20 = 50 minutes. A missed bound invalidates this RPO
argument and pages; it is not a demonstrated guarantee. Acknowledged objects
are protected before acknowledgement; Neon L1 is finer still. Checkpoint age
is measured from the latest complete point's snapshot time; alert at 45 minutes
and declare RPO risk at 55. RTO: the 240-minute budget in
[capacity and operations](capacity-and-operations.md#incident-authority-and-objective-feasibility).
History: 12-hourly independent points of at least 7 days plus Neon's 7 days.
Independence: separate account/logins, active locks and an append-only intake
boundary. Application callers have no raw recovery-storage key; the independent
service's R2 Object Read & Write key does include delete permission and is a
protected trust boundary, not a falsely claimed write-only credential.

**Evidence still required.**

- Phase 4: the export path proof, roles and grants capture, plan and
  history.
- Phase 5: the recovery account, locks, job, alarms and B's independent
  access.
- Phase 15: timed full restores at the qualification dataset, a restore
  from a 7-day-old point, missing-object and corrupt-checkpoint cases,
  deletion replay, and a restore led by B with P unavailable.
