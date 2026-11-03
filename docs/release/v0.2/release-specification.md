# Nthawi release specification v0.2: Phase 2 closure proposal

Date: 3 November 2026 (Africa/Blantyre).
Status: **partially approved; commercial package and detailed proposals await
the product owner's explicit approval**. Phase 2 is not complete.

This edition is a versioned addendum to the
[v0.1 specification](../v0.1/specification.md),
[v0.1 decision register](../v0.1/decisions.md) and
[v0.1 acceptance matrix](../v0.1/acceptance-matrix.md).
Those documents supply unchanged scope, definitions, source records, D-01
through D-23 and AC-01 through AC-32. The field-specific updates below supersede
their older status only where current authority is identified. This document
and those three fixed inputs together form edition 0.2; it creates no new
runtime catalogue, schema or product behavior.

## Current authority and approval boundary

| Source | Current authority                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U-05   | Current chat: fully complete Phase 2, make only necessary changes, provide commands and prepare progress to the next phase. This expands U-01's Step-2.1-only work boundary; it does not select missing commercial values or authorize a merge.  |
| U-06   | Current chat answer: "Prepare a complete commercial proposal for my review (Recommended)". Preparing and publishing proposals is authorized; their commercial values remain unapproved.                                                          |
| U-07   | Current chat answer: "English UI/email/docs/support; English and Chichewa knowledge/AI".                                                                                                                                                         |
| U-08   | Current chat answer: "Adopt these as engineering targets", for 99.9% monthly availability, RPO at most 1 hour, RTO at most 4 hours and at least 7 days usable recovery history, subject to later measured validation and without a customer SLA. |

U-02's scope, owner-account shared allowances, consumed-usage anti-reset rule,
and manual prepaid renewal remain Approved. U-03/U-04 accurately describe the
older deferrals; U-07/U-08 supersede the specified language/target deferrals.
No generic implementation request or automated review approves a price or policy.

The user/product owner remains the approver and accountable business owner.
Future engineers supply implementation and measurement evidence. No operational
staff, legal adviser, merchant eligibility or spending budget is invented.

## Approved language and objective updates

**D-17: Approved language sets, U-07.** Owner UI, widget interface, email,
receipts, API documentation and support are English. Knowledge extraction and
AI support English and Chichewa. This approves a launch requirement, not a
claim that either language is already implemented or evaluated.

**D-18: Approved engineering thresholds, U-08.**

| Objective               | Approved threshold | Current evidence status                                   |
| ----------------------- | ------------------ | --------------------------------------------------------- |
| Monthly availability    | At least 99.9%     | Not measured for production.                              |
| Recovery point          | At most 1 hour     | Not demonstrated for Nthawi data and objects.             |
| Recovery time           | At most 4 hours    | No timed Nthawi production recovery accepted.             |
| Usable recovery history | At least 7 days    | No Nthawi end-to-end recovery-history acceptance claimed. |

Measurement definitions are a separate proposal, D-27, below. These are
engineering design/acceptance targets, with no current-performance claim,
contractual uptime guarantee or automatic service credit.

## Commercial proposal: one launch catalogue

Everything in this section is **Proposed**, owned by the user/product owner
and pending explicit approval under U-06. A single paid plan reduces initial
catalogue, upgrade and entitlement-transition work. It is an engineering
commercial proposal, not evidence of market demand or financial viability.

| Catalogue field                    | Proposed value                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue / plan                   | `launch-2026-01` / `launch`, display name Launch.                                                                                                                                                                            |
| Gross customer price               | **USD 49.00 per 30-day service period**.                                                                                                                                                                                     |
| Money representation               | Integer 4,900 US cents; exact decimal representation at provider boundary; no binary-floating-point monetary arithmetic.                                                                                                     |
| Customer tax/fee presentation      | USD 49.00 is the final checkout total. Applicable taxes, if due, are included within that total; Nthawi absorbs collection fees. No extra checkout surcharge. Tax jurisdiction/rate must be established before live billing. |
| Currency                           | USD only in this candidate. No automatic MWK substitution, exchange conversion or exchange-rate promise.                                                                                                                     |
| Access term                        | Exactly 30 x 24 hours, measured by authoritative UTC instants; start inclusive and end exclusive.                                                                                                                            |
| Trial / free processing            | None. No unpaid AI, ingestion or live visitor operation. Unpaid onboarding may collect setup intent; admission of active workspaces requires paid access.                                                                    |
| Annual / top-up / additional tiers | None in the initial catalogue. Future changes require a new catalogue version and explicit approval.                                                                                                                         |

Public checkout documentation names MWK and USD; that is not proof that this
merchant can collect USD through its intended payment methods. Confirm merchant
entity/jurisdiction, currency, payment channels, amount representation, tax
treatment and the actual fee schedule before Phase 7 live checkout. If USD
cannot be collected as approved, return the currency/price decision to the
owner; do not invent an FX fallback.

### Proposed purchased allowances

All allowances belong to the owner account and are shared across its workspaces.
Independent limits apply together; none is described as unlimited.

| Dimension                 | Proposed allowance / unit                             | Measurement                                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Active workspaces         | 3                                                     | Stock of non-deleted admitted workspaces; creation reserves a slot atomically.                                                                                                                                                                   |
| Active knowledge sources  | 100                                                   | Stock of stable URL/file source identities. Each imported website URL is a source; versions of the same source do not create another identity.                                                                                                   |
| Held knowledge storage    | 1 GiB = 1,073,741,824 bytes                           | Stock of authoritative artifact bytes and outstanding reservations: quarantine, retained originals/versions, extracted text and derived/embedding payload. Physical database/index overhead and operator backups are not customer-metered bytes. |
| Retained source revisions | 3 per source, including published/in-review versions  | Do not remove the currently published revision automatically; require retiring an eligible older revision before admitting a fourth.                                                                                                             |
| Original uploaded file    | At most 10 MiB = 10,485,760 bytes                     | Per file, also subject to the explicitly approved format/safety contract before launch.                                                                                                                                                          |
| Completed AI answers      | 1,000                                                 | Consumed flow per paid term across preview, widget and supported API. A persisted/retrievable generated answer or grounded fallback counts once.                                                                                                 |
| External API requests     | 25,000                                                | Admitted authenticated calls using external API credentials per paid term. Owner UI/widget transport calls do not debit this dimension; their AI/message usage still counts.                                                                     |
| Conversation messages     | 10,000                                                | Durably accepted visitor, owner and AI messages per paid term; system events excluded. Preview outside a conversation consumes an AI answer, not a conversation message.                                                                         |
| Ingestion runs            | 100                                                   | Accepted import/upload/manual-refresh attempts per paid term. A refresh consumes a run but retains its source identity.                                                                                                                          |
| Embedding input           | 5,000,000 tokens                                      | Authoritatively billed embedding input per paid term, including refresh/reindex work.                                                                                                                                                            |
| Processing concurrency    | 2 running ingestion jobs per owner                    | Reservations cover all its workspaces; excess admitted work queues within remaining allowance.                                                                                                                                                   |
| External API rate         | 60 admitted requests per rolling 60 seconds per owner | In addition to the term allowance; no paid rate-limit bypass.                                                                                                                                                                                    |
| Visitor message rate      | 20 sends per rolling 60 seconds per visitor session   | In addition to owner aggregate message allowance and later abuse controls.                                                                                                                                                                       |

Full owner/workspace, reservation and concurrency enforcement remains future
Phase 6/7/9 implementation. Format safety limits are not validated by choosing
a commercial upload maximum. The PDF's other archive/page/cell/parser ceilings
remain D-22 benchmark candidates for Phase 3 feasibility and Phase 9 tests.

### Proposed accounting and exhaustion rules

- At term activation, consumed-flow balances start at zero. Active resource
  stock carries forward; it never resets merely because a new term begins.
  No unused-flow rollover or borrowing from a future term.
- Deletion never restores consumed answers, messages, requests, ingestion runs
  or embedding tokens. Logical workspace/source deletion frees its active
  identity slot once unavailable; storage capacity is released only after
  verified artifact purge. Repeated cleanup cannot release capacity twice.
- Reserve maximum required capacity transactionally before paid work. Successful
  settlement replaces the reservation; it does not add a second full charge.
  Reject work that cannot reserve capacity with a clear exhausted-dimension
  explanation and next possible renewal/activation information.
- Reusing an idempotency key for the same business operation produces no second
  answer, message, run or grant. An actually admitted external API retry still
  counts as an API call, even when its business result is replayed.
- Validation rejection before admission consumes no commercial allowance.
  Once an ingestion attempt starts processing, scan/parser/content rejection
  consumes that run because processing occurred. Internal retries of that run
  do not consume another run, including retries of an extraction already awaiting review.
- Failed answer generation with no persisted/retrievable result consumes no
  completed-answer credit. Billable failed/retried provider work remains
  Nthawi's operating cost. Hold uncertain reservations until reconciled;
  do not initiate another paid generation automatically while the first outcome
  is unknown. Put finite provider retry/cost controls in the later implementation.
- Embedding usage settles from authoritative token evidence once per attempt;
  no charge for work rejected before provider admission. Unknown provider
  outcomes keep reservations held until resolved. Corrections are auditable.
- Settle work against its originating term, even when bounded completion occurs
  after expiry. Unresolved reservations remain associated with that term until
  reconciliation; a new term never resets them or silently takes their charge.
- No automatic monetary overage. Reject new paid work when an allowance or
  admissible rate is exhausted; do not silently purchase more access or switch
  models/prices. Safety/abuse protection can still reject otherwise in-quota work.

## Proposed prepaid lifecycle

All rules in this section remain Proposed.

| Event                     | Proposed rule                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial payment           | A browser return or webhook alone grants nothing. After authoritative verification of order/reference/status/gross amount/currency/environment, create one grant exactly once.                                                                                                                                                                                                                                               |
| Term start                | Start at the later of first authoritative verification and the end of existing paid grants; end 30 x 24 hours later. Record exact UTC start/end and the purchased catalogue snapshot.                                                                                                                                                                                                                                        |
| Early renewal             | Permit one paid future term. Its flow allowances are unusable until activation and do not reset current consumption. Do not create more checkout intents once a future term is already funded.                                                                                                                                                                                                                               |
| Late successful renewal   | Start at verification if prior access has expired; do not consume paid days retroactively to cover an unpaid gap.                                                                                                                                                                                                                                                                                                            |
| Duplicate/racing payments | One payment/order cannot produce multiple grants. A distinct extra payment that cannot be admitted under the one-future-term rule becomes a refund obligation; it does not create hidden credits or disappear.                                                                                                                                                                                                               |
| Pending checkout          | Order admission expires after 24 hours. A verified payment received after order cancellation/expiry becomes a refund obligation; do not revive the cancelled order silently.                                                                                                                                                                                                                                                 |
| Cancellation              | Unpaid checkout may be cancelled. A funded future term cancelled before activation is fully refundable. An active prepaid term continues to expiry unless refunded/reversed or the account is deleted; there is no automatic charge to cancel.                                                                                                                                                                               |
| Catalogue change          | Preserve active and funded future order/grant snapshots. New checkout offers the currently published catalogue; no mid-term repricing, automatic migration, proration, upgrades or downgrades at initial launch.                                                                                                                                                                                                             |
| Expiry                    | At the end instant, stop new AI, ingestion, visitor conversation operation and external API operation. Show the actual expiry/renewal state; no silent truncation of an admitted answer already being settled.                                                                                                                                                                                                               |
| In-flight work            | Only operations already running before expiry may finish within their originating-term reservation and execution deadline. At that term end, cancel unstarted queued work and release its unused run/token reservations once; actual stored bytes remain held until purged. A new term requires new admission, never automatic transfer of the old charge. Results remain subject to the expired account's access policy.    |
| Grace                     | For 7 x 24 hours after expiry, permit authenticated owner read/export and billing/renewal only; no new processing or conversation replies.                                                                                                                                                                                                                                                                                   |
| After grace               | From day 7 to day 30 after expiry, only identity recovery and billing/renewal are available. Workspace content remains retained but unavailable.                                                                                                                                                                                                                                                                             |
| Reactivation              | At authoritative verification, lock/revalidate account lifecycle state. If retained data is eligible, atomically cancel pending abandonment purge by generation and activate the new grant. Every purge worker must recheck that generation and absence of an active or funded future grant before deletion. Existing stock still counts.                                                                                    |
| Abandoned expired data    | At 30 x 24 hours after access loss, with no active or funded future grant, revoke resource credentials and queue abandonment purge for the 7-day purge window. Once irreversible object/data purge starts, old-content reactivation is refused: refund a retained-data renewal payment unless the owner explicitly accepts a fresh empty account/workspace. Explicit owner-requested deletion is never cancelled by payment. |

Identity/security management, billing/history and deletion requests remain
available throughout expiry; the content-access restrictions above do not
remove those controls.

"No silent truncation" does not promise unbounded completion. Bound each admitted
operation and show its exact pending/success/failure state. If refund/reversal
or deletion occurs during work, check current authorization and reservation state
before making the result accessible.

### Proposed notices

Queue idempotent English email/dashboard notices within 5 minutes of the
relevant state transition: verified purchase/receipt, accepted cancellation,
approved refund obligation, provider-confirmed refund/reversal and completed
purge. Schedule expiry reminders 3 days and 1 day before term end, expiry at the
end instant, grace ending 1 day before its end, and abandonment-purge warning
7 days before its planned eligibility time. Recompute/cancel obsolete notices
when a grant or lifecycle generation changes.

These are proposed enqueue targets, not guaranteed inbox-delivery times.
Display actual state/deadlines in the owner dashboard; retry delivery durably
and record failed delivery. Missing or delayed email does not itself extend
paid access or prove a payment/refund. Mandatory notification rules for the
actual jurisdiction remain part of the pre-live policy review.

### Proposed voluntary refunds and reversals

- One full refund of the owner's first paid term may be requested within
  7 x 24 hours after activation. No automatic partial cancellation refund of
  an active term after that window; mandatory rights and operator-approved
  service-remedy adjustments take precedence.
- A never-activated funded future term, duplicate extra payment, or verified
  payment for a cancelled/expired order is fully refundable.
- Return the gross amount for a full refund; Nthawi absorbs unrecovered
  collection fees. Monetary partial adjustments require operator approval,
  an exact integer-minor-unit amount/reason and auditable tax/access effects;
  no automatic proration formula is offered at initial launch.
- Accepted funded-future-term cancellation or full-refund authorization has an
  exact recorded UTC instant and transaction order. That transaction immediately
  prevents the affected future grant activating or revokes its active grant;
  no wait for monetary return. An authoritative full reversal also revokes its
  affected grant. Ordinary active-term cancellation keeps its end-of-term
  effect; partial refunds use their explicitly recorded access adjustment. Grant activation and cancellation recheck the same state/generation:
  whichever commits first determines whether the term is still unstarted;
  stale workers cannot activate a cancelled grant. If activation committed first,
  apply the active-term refund policy instead of claiming an unstarted refund.
- Pending/failed monetary refunds remain an explicit amount owed and do not
  restore a revoked grant. If the adjustment leaves no other active grant,
  grace starts at that access-loss instant. Funded future grants keep their
  fixed start, prevent abandonment purge, and never activate early. Ordinary
  expiry remains anchored to its actual end.
- Initiate an approved refund within 5 calendar days. Only provider-confirmed
  evidence marks money returned. Provider settlement timing is not invented.
- A full refund/reversal revokes its grant and unactivated future capacity;
  prior consumed usage remains in history. Any still-valid separate grant
  retains its own access and counting state.
- Refund/reversal never automatically moves a funded future term earlier or
  exposes its quota before its fixed start. A never-started term may be cancelled
  and refunded; a different timeline requires a separately confirmed, auditable
  adjustment. Do not manufacture a reset by rewriting an existing grant.
- For partial refunds, explicitly record whether access changes; an operator
  adjustment cannot silently rewrite historical consumption. A dispute pending
  authoritative resolution does not itself prove a final reversal.
- Reserve pending/approved refund amounts once and prevent their cumulative
  amount exceeding the independently verified gross payment. If cumulative
  approved refunds reach that full gross, apply the full-refund access rule.
  Hold conflicting refund/reversal obligations for reconciliation before
  initiating another transfer; never assume an uncertain transfer failed.
- Account/workspace deletion does not automatically create a refund.
  Financial and refund records are separate from ordinary content deletion.

This is a proposed voluntary product policy, not legal advice or a compliance
finding. The merchant entity/jurisdiction and any mandatory tax, consumer and
financial-record obligations remain a pre-live-billing decision. Approval of
this specification cannot waive applicable mandatory rights.

## Additional proposed boundaries and later gates

**D-04, proposed:** billing administration belongs to the authenticated owner;
enforce cross-owner denial for all private resources. Visitor credentials cover
only their intended conversation/workspace actions; external API credentials
are scoped, revocable and never authorize another owner's billing. No new
operator privilege is granted by this specification.

**D-08/D-21, proposed:** use immutable catalogue/order/grant snapshots, stable
ledger event identity and auditable reservation/settlement/reconciliation.
This is a logical contract, not authorization to add tables or migrations now.

**D-19, proposed retention contract:** explicit deletion makes affected content
unavailable immediately; durable purge completes within 7 x 24 hours. Keep
restored systems closed to traffic until deletion records are replayed.
Recovered copies may retain deleted bytes only within their separately approved
backup window, at most 30 days in this proposal. The 7-day minimum usable history
target does not require retaining every deleted customer record for 30 days.
Before Phase 7 live billing, the operator must approve the legally required
financial/audit retention categories and periods for its actual entity and
jurisdiction. No arbitrary statutory duration is supplied here. Proposed
conversation-content retention is 90 x 24 hours from each message's creation,
without resetting its age on later conversation activity; earlier explicit
or abandoned-account deletion still applies. Offer export while permitted,
and show this retention limit. Minimal usage/accounting events follow the
separately approved financial/audit policy, without retaining message content.

**D-20, proposed extraction contract:** accept supported UTF-8 text; reject
binary/unsupported encoding and encrypted/malformed inputs with a clear reason.
Text-bearing PDFs only, no OCR; mixed PDFs require disclosure and explicit
acknowledgement of omitted image-only content. Office formats never execute
formulas/macros or fetch external content. Default to visible selected worksheets
and visible slides; label cached formula values; require explicit review opt-in
for hidden content and speaker notes. Scan failure is closed; only reviewed
exact revisions become answerable. Select feasible numerical safety ceilings
at Phase 3 design and validate them in Phase 9 before launch.

**D-22, still Proposed:** benchmark the PDF's archive/page/cell/time/memory
candidates during later parser feasibility. This evidence is not a prerequisite
to starting the phase whose job is to obtain that evidence.

**D-23:** recurring eligibility remains Open, unverified and outside the
approved manual-prepaid launch direction. It does not block Phase 3 design.

### D-24: AI lifecycle and cost assumption

Confirmed source fact: current repository default
`gpt-4.1-mini-2025-04-14` is deprecated, with shutdown scheduled for
14 January 2027. OpenAI's official replacement recommendation is `gpt-6-luna`.
This is a release dependency, not evidence of a current foundation test failure.

Proposed design assumption: evaluate `gpt-6-luna` in Phase 11, with the existing
1536-dimensional embedding contract retained unless deliberately migrated.
At most 16,000 total input tokens and 2,000 total billable output tokens per
answer are proposed, including system/context/history and any billable reasoning
within the applicable total. Exclude paid hosted model tools from this cost
illustration. Select/pin the actual supported model and provider budget only
after English/Chichewa grounding, fallback, citation and latency evaluation.
No default, dependency or test fixture is changed by this document.

### D-25: Public cost evidence and commercial sensitivity

Observed 3 November 2026. These are public provider facts and planning inputs,
not account quotes, approved purchases or a claim that USD49 is sustainable.

| Source                                                                                       | Evidence / qualification                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 [PayChangu pricing](https://paychangu.com/pricing)                                      | Advertises collection pricing as low as 3% per transaction; actual merchant/tax/channel terms need confirmation.                                                                                   |
| C-02 [PayChangu checkout](https://developer.paychangu.com/docs/html-checkout)                | Currency field documents MWK/USD. This does not prove this merchant's channel eligibility or exact money conversion.                                                                               |
| C-03 [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations)              | GPT-4.1-mini snapshot shutdown on 14 January 2027; recommended replacement gpt-6-luna.                                                                                                             |
| C-04 [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)                  | Standard rates USD0.10 input / USD0.50 output per million tokens; cached/write, regional and non-standard tiers have distinct charges.                                                             |
| C-05 [Embedding model](https://developers.openai.com/api/docs/models/text-embedding-3-small) | USD0.02 per million embedding input tokens.                                                                                                                                                        |
| C-06 [Render pricing](https://render.com/pricing.md)                                         | API25 + jobs25 + illustrative parser25 + 4GB scanner85 = USD160/month compute; Pro workspace adds USD25. Parser feasibility and actual memory needs are unresolved.                                |
| C-07 [Neon pricing](https://neon.com/pricing)                                                | Launch USD0.106/CU-hour, USD0.35/GB-month data, USD0.20/GB-month history. At 730 continuously active hours, 0.25-1CU costs about USD19.35-77.38 before storage/history.                            |
| C-08 [Netlify pricing](https://www.netlify.com/pricing/)                                     | Public page contains Pro USD20/25 price-test variants; actual dashboard quote unresolved. Shared team credits apply across projects. Do not charge one team subscription twice for web and widget. |
| C-09 [R2 pricing](https://developers.cloudflare.com/r2/pricing/)                             | Standard storage USD0.015/GB-month; Class A USD4.50/million, B USD0.36/million; free tier and operation rounding affect actual cost.                                                               |
| C-10 [Resend pricing](https://resend.com/pricing.md)                                         | Transactional Pro USD20/50,000 emails with USD0.90/1,000 additional; this is not a purchase or configured sending domain.                                                                          |

Illustrative shared subtotal:
USD185 Render + USD20-25 Netlify + USD20 Resend + USD19.35-77.38 Neon compute
= **USD244.35-307.38/month**. This excludes database/history storage, R2,
AI, staging, extra replicas/scanner capacity, monitoring, support/labour, taxes,
FX and payment fees. Queue activity may prevent database scale-to-zero.

Under the proposed token bounds and quoted Standard Luna rates, one answer's
uncached text inference is at most
16,000/1,000,000 x USD0.10 + 2,000/1,000,000 x USD0.50 = **USD0.0026**.
Thus 1,000 such successful calls plus 5 million embedding tokens illustrates
**USD2.70**, before failed/retried/extra work, non-standard/regional charges and
all other service costs. No token-budget/model-quality acceptance has passed.

At an illustrative 3% collection fee, USD49 minus USD1.47 minus USD2.70 leaves
USD44.83 **before** tax, other variable costs and all shared operating costs.
This is a sensitivity input, not profit or a break-even promise. Customer count,
merchant terms, actual workload, quality evidence and operating budget must be
approved before launch. Do not purchase providers to make this estimate true.

## Proposed language behavior and acceptance objectives

**D-28, proposed language behavior:** the interface stays English. Accept
English/Chichewa knowledge and answer in the visitor/owner's explicitly selected
supported language, otherwise the supported language of the question.
For mixed/uncertain input, request a supported-language choice in English.
An unsupported language gets an honest English unsupported-language response;
do not silently claim another language is supported. Bilingual/mixed content,
diacritics, code-switching and extraction must have representative evaluation.

**D-26, proposed evaluation gates:** at least 60 reviewed cases, 30 per supported
AI language, comprising 20 supported and 10 unsupported questions per language.
Require at least 90% grounded correctness and 95% appropriate fallback in each
language cohort; with ten unsupported cases that means all ten must pass.
Include citation validation, revoked/unpublished knowledge and cross-tenant
negative cases; zero observed tenant leakage in the defined suite. Record
dataset/version, rubric, reviewer and actual model/configuration. These are
proposals, not already-approved quality thresholds or measured results.

Proposed inherited web/accessibility gates: no serious/critical automated
accessibility issues plus keyboard/screen-reader checks; LCP at most 2.5s and
CLS at most 0.1 on representative owner/widget journeys at the agreed launch
dataset, mobile/desktop viewport and reported network/device profile; widget
loader at most 10KiB compressed. Define the exact benchmark profiles in Phase 15
before performance acceptance. No current performance pass is claimed.

### Proposed dispositions of other inherited objective questions

No numerical customer SLA, service credit or response-time guarantee is
proposed for support, AI latency, generic API latency, ingestion completion,
stream delivery or maximum concurrent users. Support is best effort; assign
responsibility before paid public launch. The catalogue limits are binding
candidate admission rules, not demonstrated capacity.

Explicit proposed later design gates: Phase 3 selects expected load/cohorts,
probe deadlines and funded capacity; Phase 9 defines bounded ingestion/queue
deadlines and resource ceilings; Phase 11 defines AI latency/cost acceptance;
Phase 12 defines heartbeat, replay, reconnect and delivery deadlines; Phase 13
defines inbox/support operations; Phase 15 approves exact device/network/load
benchmark profiles and verifies the candidate. Owner approval of these scoped
deferrals permits Phase 3 design, but no unresolved later threshold is falsely
marked approved or measured. Raise an owner decision before accepting the
corresponding implementation or publishing a new customer promise.

**D-27, proposed measurement contract for the approved operational targets:**

- Availability uses each UTC calendar month and minute-level synthetic owner
  page, API and widget journey outcomes from two independent external locations.
  A minute is good only when every monitored journey succeeds from both.
  Maintenance and critical-provider outages count; correct expected auth/quota
  rejection is not a service failure. Record absent probe evidence as unknown,
  not success. Define probe deadlines/fixtures in Phase 3 and implement in Phase 5.
- RPO measures the maximum gap between the last durable acknowledged record or
  original object and the latest consistent recovered point. Cover identities,
  billing/grants/usage, knowledge/originals, conversations and durable jobs.
- RTO runs continuously from the earlier of automatic incident detection and
  operator declaration to a consistent restored
  service passing the accepted critical journeys, including object recovery
  and deletion replay before traffic. Declaration cannot restart the clock;
  there is no office-hours clock.
- Usable recovery history requires reconstructable, tested database plus
  original-object points for at least seven rolling days, with independently
  protected backup/recovery access. A branch/history setting alone is insufficient.
- The user/product owner is accountable. Assign named operational coverage,
  incident authority and evidence ownership during Phase 3; prove the funded
  design and timed restoration in later acceptance. If feasibility cannot meet
  an approved target, request a versioned owner decision rather than calling it met.

## Decision and acceptance delta

All entries below inherit their full question/owner from v0.1 unless replaced.
"Proposed" still requires explicit owner approval of this packet.

| Decision | Edition 0.2 disposition                                                                                                                                | Acceptance trace    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| D-01     | Approved work expansion under U-05; full Phase 2 documentation/decision closure and next-phase readiness; no merge or resource-creation authorization. | AC-01, AC-32        |
| D-04     | Proposed actor boundaries above.                                                                                                                       | AC-16               |
| D-08     | Proposed immutable launch catalogue/purchase snapshots and transition rules above.                                                                     | AC-18, AC-29        |
| D-09     | Proposed single Launch catalogue, USD49 gross, money/tax/fee/currency rules above.                                                                     | AC-18               |
| D-10     | Proposed 3-workspace stock/admission/release rule.                                                                                                     | AC-04, AC-19        |
| D-11     | Proposed allowance, rate and exhaustion table above; no unlimited/automatic overage.                                                                   | AC-20               |
| D-12     | Proposed exact UTC term, stock/flow, activation/reset and settlement rules.                                                                            | AC-21               |
| D-13     | Proposed one-future-term renewal and duplicate/late payment rules.                                                                                     | AC-22               |
| D-14     | Proposed unpaid/future/active cancellation and unchanged paid-term rules.                                                                              | AC-23               |
| D-15     | Proposed expiry, 7-day read/export grace, retained-data reactivation and 30-day abandonment rules.                                                     | AC-24               |
| D-16     | Proposed voluntary refund/reversal/adjustment contract above.                                                                                          | AC-25               |
| D-17     | Approved language sets under U-07; detailed fallback behavior is separately Proposed in D-28.                                                          | AC-26, AC-37        |
| D-18     | Approved four engineering thresholds under U-08; definitions/evaluation rules separately Proposed in D-26/D-27.                                        | AC-27, AC-35, AC-36 |
| D-19     | Proposed content deletion/retention and explicit pre-live financial-retention decision gate.                                                           | AC-28               |
| D-20     | Proposed exact partial/hidden/encrypted/encoding content behavior above.                                                                               | AC-06, AC-30        |
| D-21     | Proposed reservation, once-only settlement and uncertain-outcome reconciliation rules.                                                                 | AC-20, AC-21        |
| D-22     | Proposed benchmark candidates; feasibility/values belong to Phase 3/9 and do not block starting Phase 3.                                               | AC-30               |
| D-23     | Open recurring eligibility; does not block approved manual-prepaid launch design.                                                                      | AC-31               |
| D-24     | Confirmed deprecation; proposed replacement/cost bounds, actual launch model qualification in Phase 11.                                                | AC-33               |
| D-25     | Confirmed public source observations plus explicit illustrative assumptions; no merchant quote or approved budget.                                     | AC-34               |
| D-26     | Proposed language-specific quality/accessibility/performance evaluation gates.                                                                         | AC-35               |
| D-27     | Proposed operational measurement/ownership definitions for Approved targets.                                                                           | AC-36               |
| D-28     | Proposed language selection/fallback behavior for Approved language sets.                                                                              | AC-37               |

D-02/D-03/D-05/D-06/D-07 retain their v0.1 Confirmed/Approved status.
All AC-01 through AC-32 remain incorporated, with changed decision status read
through the table above instead of the superseded v0.1 language/objective status.

| Added matrix row            | Documentary acceptance                                                                                                                     | Future evidence / owner gate                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| AC-33 AI lifecycle          | D-24 and C-03/C-04 distinguish current defaults, deprecation and a proposed replacement; no configuration change or qualified-model claim. | Phase 11 model availability, cost, both-language quality and compatibility evidence before actual selection.                    |
| AC-34 Provider economics    | D-25/C-01 through C-10 separate public facts, merchant/account quotes, illustrative subtotal and customer-price proposal.                  | Operator-approved merchant currency/tax/fee terms, actual service quotes, workload and budget before live collection/purchases. |
| AC-35 Evaluation gates      | D-26's thresholds/cohorts remain Proposed and distinguish future tests from present passes.                                                | Owner-approved rubric/profiles, actual bilingual AI, accessibility and performance measurements in the relevant later phases.   |
| AC-36 Objective measurement | D-18's Approved targets and D-27's Proposed definitions remain separate, with accountability and later operational assignment.             | Owner approves measurement contract; funded feasibility, probes and timed object/database restore prove attainment later.       |
| AC-37 Language behavior     | D-17's Approved surface/language sets and D-28's Proposed fallback behavior are separately traceable.                                      | Owner approval of behavior and evaluated English/Chichewa, mixed-content and unsupported-language cases.                        |

## Completion gate and next phase

**Already approved:** bounded scope/exclusions, owner-shared allowances and
anti-reset principle, manual prepaid direction, launch language sets and the
four operational target thresholds.

**Still required to close Phase 2:** explicit approval or corrections to the
commercial/lifecycle package and the proposed contract/measurement/language/
evaluation decisions above, with exact authority recorded in a new source entry.
The published proposal, its technical review and passing checks cannot approve
those product choices. No current schema or environment default becomes approved
merely because it already exists.

**Explicit later dependencies, not blanket Phase 3 blockers:** actual merchant
USD/fees/tax/entity readiness and financial retention before Phase 7 live billing;
parser isolation/benchmark ceilings in Phase 3/9; qualified bilingual AI model
and cost in Phase 11; operational staffing and feasible funded design in Phase 3;
measured restoration/security/UAT in Phase 15. A failed later feasibility gate
returns affected product promises to the owner for revision.

After Phase 2's contract gate is genuinely satisfied, Phase 3 prepares reviewed
hostname, Render/Netlify, storage/secrets and parser-isolation design. That
handoff does not authorize provisioning, purchases, DNS, deployment, migrations,
Neon lifecycle actions or protection changes. Merge of PR #5 still requires an
independent approving GitHub review, current repository gates and the user's
separate explicit merge instruction.

## Execution and verification

Use the existing Phase 2 branch/PR. Preserve v0.1 as its dated snapshot.
Required artifact changes for this proposal are this addendum and a release
index; product code, dependency manifests, lockfile, private configuration and
databases remain untouched.

- [x] Refresh clean starting checkout, effective rules and PR/review state.
- [x] Obtain explicit U-06/U-07/U-08 answers; verify current public sources.
- [ ] Verify the new documentation diff, links, identifiers, arithmetic and approval claims.
- [ ] Complete independent technical and authenticated CodeRabbit review.
- [ ] Commit/publish the reviewed proposal; require new candidate workflows.
- [ ] Obtain product-owner approval before Phase 2 completion or dependent work.

The proposal's exact publication SHA, review findings and hosted candidate URLs
are recorded in the actual PR and completion chat after publication. These
checkboxes describe this authoring checkpoint; they claim no future result.

### Commands and expected evidence

Run from PowerShell; stop at each failure. These commands read the current
checkout/rules or verify documentation; they do not merge or provision anything.

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'
$env:PATH = 'C:\Users\USER\AppData\Local\pnpm\nodejs\24.21.0;' + $env:PATH
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed.' }
git status --short --branch
$phase2LocalSha = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Local SHA lookup failed.' }
$phase2Pr = gh pr view 5 --repo Tristan-X888/Nthawi --json state,isDraft,headRefOid,baseRefOid,reviewDecision,reviews,mergeStateStatus | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'PR inspection failed.' }
if ($phase2Pr.headRefOid -ne $phase2LocalSha) { throw 'Local HEAD differs from published PR head; reconcile before review.' }
$phase2Pr | Select-Object state,isDraft,headRefOid,baseRefOid,reviewDecision,reviews,mergeStateStatus
gh api repos/Tristan-X888/Nthawi/rulesets/24955831
if ($LASTEXITCODE -ne 0) { throw 'Rules inspection failed.' }
$phase2NodeVersion = pnpm.cmd exec node --version
if ($LASTEXITCODE -ne 0 -or $phase2NodeVersion -ne 'v24.21.0') { throw 'Expected Node v24.21.0.' }
$phase2PnpmVersion = pnpm.cmd --version
if ($LASTEXITCODE -ne 0 -or $phase2PnpmVersion -ne '10.16.1') { throw 'Expected pnpm 10.16.1.' }
pnpm.cmd format:check
if ($LASTEXITCODE -ne 0) { throw 'Formatting failed.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed.' }
git diff --exit-code HEAD -- pnpm-lock.yaml
if ($LASTEXITCODE -ne 0) { throw 'Lockfile changed.' }
$phase2LockHash = (Get-FileHash pnpm-lock.yaml -Algorithm SHA256).Hash
if ($phase2LockHash -ne '0103742d350a356ee6bbe09b4a33fd416764cbcf85e54a85bba25f0b407bbfff') { throw 'Reviewed lockfile hash mismatch.' }
```

Expected toolchain: Node24.21.0/pnpm10.16.1. Reviewed lockfile SHA-256:
`0103742d350a356ee6bbe09b4a33fd416764cbcf85e54a85bba25f0b407bbfff`.

After the exact new diff exists, stage only reviewed documentation paths and
inspect the complete staged diff. Review before committing:

```powershell
git add -- docs/release/README.md docs/release/v0.2/release-specification.md
if ($LASTEXITCODE -ne 0) { throw 'Staging failed.' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace failed.' }
git diff --cached --stat
git diff --cached
coderabbit auth status --agent
if ($LASTEXITCODE -ne 0) { throw 'CodeRabbit authentication required.' }
coderabbit review --agent -t uncommitted -c AGENTS.md
if ($LASTEXITCODE -ne 0) { throw 'CodeRabbit review did not complete.' }
```

A technical reviewer must separately check approval provenance, allowance
arithmetic, lifecycle races and changed matrix references. After reviews and
necessary corrections pass, commit/push the reviewed docs, then inspect both
new workflows at the exact published SHA:

```powershell
git commit -m 'docs(release): propose complete Phase 2 contract and record approvals'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed.' }
git push origin docs/phase-2-step-2.1-release-specification
if ($LASTEXITCODE -ne 0) { throw 'Push failed.' }
gh pr checks 5 --repo Tristan-X888/Nthawi
if ($LASTEXITCODE -ne 0) { throw 'Checks missing, pending or failing.' }
git status --short --branch
$phase2PublishedSha = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Published SHA lookup failed.' }
# Assert this candidate retains the two accepted, reviewed workflow definitions.
git diff --exit-code 0dd234d2af9663f05d5c1ed69e6fd7f4668e3efe $phase2PublishedSha -- .github/workflows/verify.yml .github/workflows/neon-contract.yml
if ($LASTEXITCODE -ne 0) { throw 'Candidate workflow definitions changed; review them before accepting checks.' }
$phase2PublishedRuns = gh run list --repo Tristan-X888/Nthawi --commit $phase2PublishedSha --event pull_request --limit 20 --json workflowName,headSha,status,conclusion,url | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Candidate workflow lookup failed.' }
foreach ($phase2Workflow in @('Verify repository', 'Verify Neon contracts')) {
  $phase2Match = $phase2PublishedRuns | Where-Object { $_.workflowName -eq $phase2Workflow -and $_.headSha -eq $phase2PublishedSha } | Select-Object -First 1
  if (-not $phase2Match -or $phase2Match.status -ne 'completed' -or $phase2Match.conclusion -ne 'success') {
    throw "Missing, pending or failing candidate workflow: $phase2Workflow"
  }
  $phase2Match | Select-Object workflowName,headSha,status,conclusion,url
}
```

No merge or infrastructure execution command is part of this proposal.
