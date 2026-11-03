# Nthawi release specification v0.1

Edition: **0.1**, 3 November 2026 (Africa/Blantyre).
Status: **partially approved specification; commercial and service decisions open**.
This is a documentation edition, not a product release, plan version or launch approval.

Companion records: [decision register](decisions.md),
[acceptance matrix](acceptance-matrix.md), and
[Step 2.1 procedure and evidence](../../plans/2026-11-03-phase-2-step-2.1.md).

## RS-01 Authority and evidence

The user's current chat controls this work. The 30 October 2026
`Nthawi_io_Production_Implementation_Plan.pdf` supplies the intended delivery
sequence and reference proposals, not approval of every setting it contains.
Its SHA-256 is
`8a4368e2a68ae4f62d1cc5916ef456ba7f13a3025fcc07dc1f7a1cd5be27d5e9`.
Page 10 names Phase 2, Release specification; "Step 2.1" is the user's
documentation-only subdivision.

The [source register](decisions.md#source-register) identifies current user
approvals, the PDF pages and historical repository references. Only explicit
current user decisions are marked Approved. Confirmed repository facts are
separate from product approvals. Proposed and Open entries authorize no
implementation and supply no default value.

The accepted foundation is merge commit
`0dd234d2af9663f05d5c1ed69e6fd7f4668e3efe` on `master`.
[PR #4](https://github.com/Tristan-X888/Nthawi/pull/4) merged reviewed candidate
`6b1d27aba264e0cfdf0db311cc43247d01add319` after
[sviyazhi's independent approval](https://github.com/Tristan-X888/Nthawi/pull/4#pullrequestreview-5753135022).
Fresh baseline workflow attempts and applicable protections are recorded in
the Step 2.1 evidence record. Existing tables, starter screens, environment
defaults and historical passes do not prove release capabilities or approved
commercial terms.

## RS-02 Release boundary

The user approved the following scope on 3 November 2026 (D-03). These are
intended release capabilities; they are not implemented or accepted by this
documentation change.

| Capability                   | Bounded intended behavior                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Public self-service accounts | Registration, verification, sign-in, access recovery, session management and purchasing access.                                          |
| Owner-managed workspaces     | Create and manage workspaces within purchased limits.                                                                                    |
| Website knowledge            | Import selected public content; review revisions; publish, manually refresh and remove.                                                  |
| File knowledge               | Private originals and reviewed publication for `.md`, `.txt`, text-bearing `.pdf`, `.docx`, `.xlsx` and `.pptx`.                         |
| Grounded AI                  | Answer from approved workspace knowledge with validated citations and honest fallback.                                                   |
| Visitor conversations        | Durable history, reconnect, retries and bounded streaming.                                                                               |
| Human takeover               | Owner takeover suppresses stale AI responses.                                                                                            |
| Owner inbox                  | View conversations, reply, close/reopen and inspect delivery state.                                                                      |
| Dashboard                    | Actual setup, ingestion, usage, storage, installation and billing status.                                                                |
| Supported API                | Programmatic access bounded to the agreed product capabilities.                                                                          |
| PayChangu billing            | Verified payments, access periods, manual prepaid renewal, expiry, receipts/history and reconciliation, subject to the open terms below. |
| Production operation         | Monitoring, backup/recovery, deletion, support and controlled release.                                                                   |

Approved exclusions: teams, WhatsApp, scheduled website synchronization,
marketplace payments, inventory/order integrations and autonomous business
actions. Nthawi's own service charges are in scope; collecting payments on
behalf of other merchants is excluded. The API is not a general-purpose
automation or merchant-payment platform.

Format inclusion does not settle encoding, encrypted/mixed PDF handling,
hidden worksheet/slide content, formula-cache disclosure, speaker notes,
processing ceilings or retention. D-20 and D-22 keep those choices explicit.
No OCR capability is included in this text-bearing PDF scope.

## RS-03 Owner and account boundaries

The approved launch is owner-managed; team collaboration is excluded.
The approved billing unit is the **owner account**, with versioned allowances
shared across its workspaces (D-05).

Terminology for this specification:

- **Owner identity:** the authenticated person managing their own workspaces.
- **Billing account:** the commercial relationship attached to that owner;
  this is distinct from Better Auth's provider-credential `account` records.
- **Workspace:** the knowledge/conversation boundary managed by its owner,
  not a separate billing unit.
- **Visitor:** a participant in an installed widget conversation, not an owner
  billing administrator.
- **Supported API caller:** a programmatic caller constrained by the approved
  product and owner/workspace authorization boundary.
- **Operator:** a person performing separately authorized support or operation;
  this specification grants no new operator access.

The technical authorization/credential design in D-04 remains Proposed:
deny cross-owner access, constrain visitor/API credentials to their intended
resources, and keep billing administration tied to the authorized owner.
Existing restricted database roles remain foundation evidence, not a new
schema or permissions decision.

## RS-04 Approved commercial foundations

D-05, D-06 and D-07 approve:

1. One owner account purchases versioned allowances shared across its workspaces.
2. Deleting a workspace does not restore consumed allowances.
3. Begin with manually renewed prepaid PayChangu access.

Approval of manual prepaid renewal does not select a term length, payment
activation instant, expiry action, overlap calculation or refund policy.
Recurring payment eligibility remains unconfirmed and unapproved (D-23);
automatic charging/renewal must not be advertised as an approved capability.

D-08 proposes immutable order/entitlement snapshots referencing the applicable
catalog version, so later changes do not reinterpret historical purchases.
The exact catalog/version transition policy remains unapproved.

## RS-05 Commercial approval checklist

No launch tier, amount, currency, allowance or policy value is approved here.
"Open" means no selected value; it does not mean free, zero, unlimited,
disabled or an existing code default.

| Decision                        | Required approval fields                                                                                                                                                                                                                  | Status |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D-09 Plans/pricing/currency     | Available plan names/IDs and version; exact price; currency; monetary scale/rounding; tax inclusion; payer/provider fees; displayed versus charged versus settled amounts; availability/trial policy.                                     | Open   |
| D-10 Workspace usage            | Active-workspace count, counting states, create/delete/recreate behavior, reservations, concurrent admission, and any per-workspace versus owner aggregate allocation.                                                                    | Open   |
| D-11 Entitlements/quotas        | Knowledge sources/retained versions; stored original/derived/quarantine bytes; ingestion/refresh; AI; messages/conversations; API requests; processing/concurrency/rate limits; units, scope, allowance and exhaustion behavior for each. | Open   |
| D-12 Measurement/access periods | Service duration; activation event; start/end and boundary instant; clock/timezone; reset schedule; stock versus consumed-flow dimensions; success/failure/retry/uncertain-outcome accounting; reservation/settlement/release rules.      | Open   |
| D-13 Renewal                    | Checkout timing; pending/failed/late/duplicate payments; early/overlapping terms; extension anchoring; plan changes and unused allowance treatment.                                                                                       | Open   |
| D-14 Cancellation               | What can be cancelled; effective instant; pending order handling; notices; remaining prepaid access and data implications.                                                                                                                | Open   |
| D-15 Expiry/grace               | Actions allowed after expiry; grace eligibility/duration; new processing versus reads; in-flight jobs/conversations; reactivation and notification rules.                                                                                 | Open   |
| D-16 Refunds/reversals          | Eligibility/window; partial/full calculation; fee/tax effects; consumed allowance; granted access adjustment; disputes/reversals; approval and audit responsibility.                                                                      | Open   |

There is no approved fallback to October's fixed pilot quotas. Provider
subscription prices and infrastructure estimates are not Nthawi customer prices.
See the source register for the superseded historical material.

## RS-06 Accounting, retention and document policy

The anti-reset rule concerns **consumed usage**. Whether verified deletion frees
currently occupied storage or an active workspace slot is a separate stock
measurement decision (D-10 through D-12); no reset or retention rule is inferred.

D-21 proposes an owner-level reservation/consumption ledger with stable event
identity, once-only settlement and reconciliation of uncertain outcomes.
Retries, failures, refunds and workspace deletion need explicit accounting rules
before billing/admission implementation. This is a conceptual proposal, not a
database design or schema change.

D-19 keeps retention/deletion choices open for identities/sessions, workspace
data, private originals, revisions, derived data, conversations, queued work,
financial records, audit evidence and backups. Decide immediate access effects,
purge timing, retained legal/financial evidence, and restore-time deletion
handling without assuming a jurisdiction or retention duration.

D-20 keeps extraction policies open. The PDF's recommendations include no
formula/macro execution or remote content fetches; explicit warnings for
partial extraction; reviewed inclusion of hidden content; scanner failure
closed; bounded isolated parsing and reviewed publication. These recommendations
do not select commercial allowances.

D-22 records these PDF pages 14-15 safety candidates, all **Proposed,
unapproved and unbenchmarked**: 10 MiB original file; 2 concurrent processing
jobs per workspace; 50 MiB expanded archive; 2,000 archive members;
100:1 expansion ratio; 200 PDF pages; 100 slides; 20 sheets /
100,000 populated cells; 30-second parser wall time; 512 MiB parser memory.
Extracted bytes/blocks/tokens/chunks and aggregate limits also need values.
No candidate becomes a runtime default through this document.

## RS-07 Languages

D-17 is Open by explicit user deferral. Approve a language set separately for
owner UI, widget UI, imported knowledge/extraction, AI responses, transactional
email/receipts, API documentation and support. Also resolve fallback,
mixed-language content, encoding/locale, dates/numbers and evaluation coverage.
The location of the operator and the English text in this repository establish
no launch language or currency.

## RS-08 Service and evaluation objectives

D-18 is Open by explicit user deferral. PDF pages 11-12 propose, without approval
or demonstrated operation:

| Candidate        | Reference value        | Missing decision/evidence                                                                                         |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Availability     | 99.9% monthly          | Covered journeys/dependencies; numerator/denominator; exclusions; clock/window; measurement and escalation owner. |
| Recovery point   | At most 1 hour         | Data/object coverage, backup/history method, measurement point and restore evidence.                              |
| Recovery time    | At most 4 hours        | Incident declaration/start/end, dependency coverage and timed recovery rehearsal.                                 |
| Recovery history | At least 7 days usable | Database/object/deletion coverage, independent protection and tested recovery points.                             |

PDF page 18 additionally proposes at least 60 representative AI cases,
at least 90% grounded correctness on supported questions, at least 95%
appropriate fallback, zero observed tenant leakage in defined tests,
no serious/critical automated accessibility issues plus manual testing,
LCP at most 2.5 seconds, CLS at most 0.1, and a compressed widget loader at most
10 KiB. These are reference candidates, not approved thresholds, measured
results or service guarantees.

Approve metric definitions, environments, loads/cohorts, percentile/window
where relevant, exclusions, evidence method and responsible owner alongside any
threshold. Latency/capacity, streaming/delivery, ingestion, support response and
deletion objectives still require decisions; this edition invents none.

## RS-09 Dependencies and completion boundaries

The [acceptance matrix](acceptance-matrix.md) maps every requested category and
each included capability to decisions, source evidence, documentary acceptance
and future evidence. Future tests are candidate verification methods, not claims
that product acceptance has passed.

Step 2.1's artifact gate is reviewed, versioned, consistent documentation with
explicit decisions, owners, dependencies and verification, published through
normal repository review. Recording open decisions satisfies the register;
it does not satisfy the PDF's full Phase 2 approval gate.

The following remain blocked:

- Catalog/billing/admission implementation: D-08 through D-16, D-21 and any
  applicable D-23 evidence.
- Detailed identity/visitor/API boundaries: D-04 plus their relevant quotas,
  lifecycle and language decisions.
- Document/storage processing policy: D-10 through D-12 and D-19 through D-22.
- Language-sensitive journeys and release evaluation: D-17 and D-18.
- Full Phase 2 closure: all required release decisions explicitly approved.
- Merge: current repository gates and the user's separate explicit instruction.
- Any later step: the user's next command after its prerequisite gates.

There is no product implementation, billing integration, schema/migration,
infrastructure/deployment/DNS work, purchase, password reset, Neon lifecycle
change or protection bypass in Step 2.1. Preserve all checkouts, partial folders,
handoffs, private configuration and database volumes.

## RS-10 Version and decision control

Edition 0.1 records U-01 through U-04 and the accepted baseline. Future changes
increment the documentation edition and add a dated change entry. Keep decision
IDs stable, record approver/evidence and supersession, and update affected matrix
rows together. A Git commit or PR approval alone is not product-policy approval.
No plan/catalog identifier is allocated by this documentation version.

| Edition | Date       | Change                                                                                                                                    |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-11-03 | Initial bounded release specification; scope/billing foundations approved; commercial policies, languages and objectives explicitly open. |
