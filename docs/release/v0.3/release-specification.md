# Nthawi release specification v0.3: approved Phase 2 release contract

Date: 4 November 2026 (Africa/Blantyre).
Status: **approved release contract**. The product owner approved the complete
edition 0.2 contract with the launch-plan amendments recorded below (U-09).
This edition satisfies the Phase 2 decision gate in documentation. It merges,
deploys, purchases and provisions nothing, and it does not claim that any
capability is implemented or any target is achieved.

This edition is a versioned addendum. With the documents it incorporates, it
forms the effective release contract:

- the [v0.1 specification](../v0.1/specification.md),
  [decision register](../v0.1/decisions.md) and
  [acceptance matrix](../v0.1/acceptance-matrix.md): scope, definitions,
  D-01 to D-23 and AC-01 to AC-32;
- the [v0.2 release specification](../v0.2/release-specification.md), exactly
  as published at commit `428f84722e42927bbdd534e202c08105bb30020f`: U-05 to
  U-08, the complete contract text, D-24 to D-28, C-01 to C-10 and AC-33 to
  AC-37.

This edition governs only where it explicitly amends or supersedes earlier
text: the catalogue cells marked "(amended)", and each v0.2 location listed in
the [superseded v0.2 text](#superseded-v02-text) map, which the section named
there replaces. Everywhere else the v0.2 wording governs exactly as written,
with its "Proposed" contract status read as "Approved" under U-09 unless the
decision table below says otherwise. Summaries elsewhere in this edition are
navigation aids, not amendments. Earlier editions remain unchanged dated
snapshots.

## Current authority

| Source | Authority                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-09   | Current chat answer, 3 November 2026, to the question whether the owner approves "the complete edition 0.2 release contract published in PR #5 at commit 428f84722e42927bbdd534e202c08105bb30020f": "Approve the complete v0.2 release contract but change the launch plan to MWK 20,000 gross per 30 days, 2 workspaces, 1GiB held storage and the rest." The question stated: "Approval selects these release decisions; it does not authorize a merge, purchase, deployment or claim that the targets are achieved." |
| U-10   | Current chat instruction, 4 November 2026: "Continue and provide the full commands in the chat". It answered the executor's question whether to apply the approved MWK 20,000 / 2-workspace amendment now, asked after the executor summarized the amendment as MWK 20,000 gross per 30 days, 2 workspaces, 1 GiB held storage and all other quotas as proposed in v0.2.                                                                                                                                                |

Recorded interpretation: U-09 amends only the price, currency and active
workspace count. "1GiB held storage" restates the unchanged v0.2 value, and
"the rest" retains every other v0.2 allowance, rate, term and rule. U-10, read
with U-01's publication authority and U-05's Phase 2 completion instruction,
covers recording, verifying and publishing this edition on the existing
Phase 2 branch and PR. None of them authorizes a merge or Phase 3 work. Any
correction requires a new dated source entry and edition.

## Superseded v0.2 text

| v0.2 location                                                                                                                                   | Superseded by                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status line; "Current authority and approval boundary" pending-approval statements                                                              | This edition's status and U-09/U-10.                                                                                                                                                          |
| "Commercial proposal" catalogue rows for price, money representation, tax/fee presentation and currency; the following USD-collection paragraph | [Approved launch catalogue](#approved-launch-catalogue) and [MWK collection dependencies](#mwk-collection-dependencies).                                                                      |
| Purchased-allowance row "Active workspaces: 3"                                                                                                  | Approved launch catalogue: 2.                                                                                                                                                                 |
| D-25 "USD49 is sustainable" qualification and the USD sensitivity paragraph                                                                     | [Restated D-25 commercial sensitivity](#restated-d-25-commercial-sensitivity).                                                                                                                |
| "Decision and acceptance delta" dispositions                                                                                                    | [Decision status after U-09](#decision-status-after-u-09) and [acceptance matrix delta](#acceptance-matrix-delta).                                                                            |
| "Completion gate and next phase"; the whole "Execution and verification" section, including "Commands and expected evidence"                    | [Explicit later dependencies](#explicit-later-dependencies) and [Phase 2 completion record](#phase-2-completion-record). The v0.2 commands are historical and are not rerun for this edition. |

## Approved launch catalogue

These two tables are the single reference for later catalogue, admission and
billing work. They reproduce v0.2's
[launch catalogue](../v0.2/release-specification.md#commercial-proposal-one-launch-catalogue)
and
[purchased-allowance](../v0.2/release-specification.md#proposed-purchased-allowances)
tables verbatim, with "Proposed" read as "Approved". Only the five cells marked
"(amended)" differ from v0.2.

| Catalogue field                    | Approved value                                                                                                                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue / plan                   | `launch-2026-01` / `launch`, display name Launch.                                                                                                                                                                                              |
| Gross customer price               | **MWK 20,000.00 per 30-day service period** (amended from USD 49.00).                                                                                                                                                                          |
| Money representation               | Integer 2,000,000 MWK minor units (tambala; ISO 4217 assigns MWK two minor-unit digits, C-12); exact decimal representation at provider boundary in the provider's proven amount unit; no binary-floating-point monetary arithmetic (amended). |
| Customer tax/fee presentation      | MWK 20,000.00 is the final checkout total. Applicable taxes, if due, are included within that total; Nthawi absorbs collection fees. No extra checkout surcharge. Tax jurisdiction/rate must be established before live billing (amended).     |
| Currency                           | MWK only. No USD or other-currency offer, automatic currency substitution, exchange conversion or exchange-rate promise (amended).                                                                                                             |
| Access term                        | Exactly 30 x 24 hours, measured by authoritative UTC instants; start inclusive and end exclusive.                                                                                                                                              |
| Trial / free processing            | None. No unpaid AI, ingestion or live visitor operation. Unpaid onboarding may collect setup intent; admission of active workspaces requires paid access.                                                                                      |
| Annual / top-up / additional tiers | None in the initial catalogue. Future changes require a new catalogue version and explicit approval.                                                                                                                                           |

All allowances belong to the owner account and are shared across its
workspaces. Independent limits apply together; none is described as unlimited.

| Dimension                 | Approved allowance / unit                             | Measurement                                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Active workspaces         | **2** (amended from 3)                                | Stock of non-deleted admitted workspaces; creation reserves a slot atomically.                                                                                                                                                                   |
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

### MWK collection dependencies

The currency change removes v0.2's USD-collection uncertainty but does not
prove merchant readiness. PayChangu's checkout reference (C-02, re-read for
this edition) lists `MWK` as a currency and types `amount` as `int32`, but does
not state whether that integer is kwacha or tambala. Before Phase 7 live
checkout:

1. Confirm the merchant entity and jurisdiction, MWK payment channels,
   settlement, actual fee schedule, tax treatment and mandatory notices.
2. Prove the provider amount unit with provider documentation or sandbox
   evidence. Grant access only after verification shows exactly
   MWK 20,000.00; never infer the unit.
3. If MWK cannot be collected as approved, return the price/currency decision
   to the owner. Do not invent a fallback currency or conversion.

## Decision status after U-09

| Decision           | Edition 0.3 status                                                                                                                                              | Acceptance trace             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| D-01               | Approved: U-01/U-05 work bounds; U-10 directs recording and publishing this edition (see the recorded interpretation). No merge or Phase 3 authorization.       | AC-01, AC-32                 |
| D-02               | Confirmed, unchanged.                                                                                                                                           | AC-02                        |
| D-03, D-05 to D-07 | Approved under U-02, unchanged.                                                                                                                                 | As in v0.1                   |
| D-04               | Approved (U-09): v0.2 actor and credential boundaries.                                                                                                          | AC-16                        |
| D-08               | Approved (U-09): immutable catalogue, order and grant snapshots and v0.2 transition rules.                                                                      | AC-18, AC-29                 |
| D-09               | Approved as amended (U-09): Launch catalogue at MWK 20,000.00 gross per 30-day term, MWK only, integer minor units, tax-inclusive total, fees absorbed.         | AC-18                        |
| D-10               | Approved as amended (U-09): 2 active workspaces under v0.2 stock, admission and release rules.                                                                  | AC-04, AC-19                 |
| D-11               | Approved (U-09): v0.2 allowances, rates and exhaustion rules, unchanged except D-10.                                                                            | AC-20                        |
| D-12 to D-16       | Approved (U-09): v0.2 term, measurement, renewal, cancellation, expiry/grace, notice and refund/reversal rules.                                                 | AC-21 to AC-25               |
| D-17, D-18         | Approved under U-07 and U-08, unchanged.                                                                                                                        | AC-26, AC-27, AC-35 to AC-37 |
| D-19               | Approved (U-09): v0.2 deletion and retention contract. Operator-approved financial/audit retention categories and periods remain a pre-Phase 7 gate.            | AC-28                        |
| D-20               | Approved (U-09): v0.2 extraction contract; numerical ceilings are selected in Phase 3 and validated in Phase 9.                                                 | AC-06, AC-30                 |
| D-21               | Approved (U-09): logical reservation, settlement and reconciliation contract. No schema or migration is authorized.                                             | AC-20, AC-21                 |
| D-22               | Disposition approved (U-09): the candidate ceilings remain unapproved values until Phase 3/9 benchmark evidence.                                                | AC-30                        |
| D-23               | Open, unchanged. U-09 approves its non-blocking disposition outside the manual prepaid launch.                                                                  | AC-31                        |
| D-24               | Deprecation Confirmed. Phase 11 replacement evaluation and per-answer token bounds approved as design assumptions; no model is selected and no default changes. | AC-33                        |
| D-25               | Observations Confirmed; sensitivity restated for MWK below. No merchant quote, exchange rate, budget or purchase is approved.                                   | AC-34                        |
| D-26 to D-28       | Approved (U-09): evaluation gates, measurement contract and language behavior. None is measured or met yet.                                                     | AC-35 to AC-37               |

## Restated D-25 commercial sensitivity

New observations, 4 November 2026:

| Source                                                                                                                              | Evidence / qualification                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-11 [Reserve Bank of Malawi major rates](https://www.rbm.mw/Statistics/MajorRates/)                                                | Table "Exchange Rates 03-November-2026", USD: buying 1717.0236, middle 1734.0118, selling 1751.0000 MWK. An official reference rate, not a bank quote or proof that USD is available at that rate. |
| C-12 [ISO 4217 list one](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml) | List published 2026-09-17: Malawi Kwacha, MWK, numeric 454, two minor-unit digits.                                                                                                                 |
| C-02, re-read                                                                                                                       | PayChangu checkout lists currencies `MWK` and `USD` and types `amount` as `int32`; the amount unit is not stated.                                                                                  |

Provider costs in C-04 to C-10 are USD-denominated, while approved revenue is
MWK. This illustration keeps v0.2's assumptions, uses the C-11 middle rate for
price orientation and the C-11 selling rate as an illustrative cost of buying
USD:

- MWK 20,000.00 is about USD 11.53 at the middle rate, less than a quarter of
  the superseded USD 49.00 proposal.
- An illustrative 3% collection fee (C-01) is MWK 600.00, leaving
  MWK 19,400.00 before any included tax.
- v0.2's fully consumed AI and embedding illustration of USD 2.70 per term is
  MWK 4,727.70 at MWK 1,751.0000 per USD. That leaves MWK 14,672.30, about
  USD 8.38 at the selling rate, per fully consumed term before tax, other
  variable costs and shared costs. v0.2 illustrated USD 44.83 at USD 49.00.
- v0.2's illustrative shared subtotal of USD 244.35-307.38 per month is
  MWK 427,856.85-538,222.38 at the same rate.

Covering only that subtotal would take about 30-37 fully consuming paid terms
per month, or 23-28 with no AI or embedding consumption. That excludes labour
and support, database storage and history, R2, staging, monitoring, taxes, FX
spreads and every other cost. This illustrates the scale of the dependency; it
is not a forecast, budget, break-even promise or approved customer target.

Kwacha depreciation or limited USD availability raises the MWK cost of every
USD-denominated provider. Before purchases or paid launch, the operator must
approve how and at what rate USD provider bills are funded, together with
customer-count assumptions and the operating budget. This sensitivity does not
reopen the approved price. If later evidence shows the catalogue cannot be
sustained, raise a new versioned owner decision; never change price or
allowances silently.

## Explicit later dependencies

None of these blocks starting Phase 3 design. Each returns to the owner if
later evidence cannot support the approved contract.

| Dependency                                                                                                                                                                                                                          | Gate                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Merchant entity/jurisdiction, MWK channels, settlement, fees, tax treatment, mandatory notices, financial/audit retention and the provider amount unit.                                                                             | Before Phase 7 live checkout.                       |
| USD-funding method and rate for USD-denominated providers, customer-count assumptions and operating budget.                                                                                                                         | Before purchases or paid launch.                    |
| Hostname map, Render/Netlify configuration, storage design, secrets matrix, parser feasibility and isolation; expected load/cohorts, probe deadlines, funded capacity; operational coverage, incident authority and evidence owner. | Phase 3 design (P-01 page 10; D-27).                |
| Numerical parser, archive, page and cell ceilings.                                                                                                                                                                                  | Phase 3 selection, Phase 9 validation (D-20, D-22). |
| Qualified English/Chichewa AI model, cost and latency.                                                                                                                                                                              | Phase 11 (D-24, D-26).                              |
| Heartbeat, replay and reconnect deadlines; inbox and support operations.                                                                                                                                                            | Phases 12 and 13.                                   |
| Device, network and load benchmark profiles; measured restoration, security and user acceptance.                                                                                                                                    | Phase 15.                                           |
| Named support responsibility.                                                                                                                                                                                                       | Before paid public launch.                          |
| Recurring payments.                                                                                                                                                                                                                 | Only if separately proposed (D-23).                 |

## Acceptance matrix delta

AC-01 to AC-37 remain incorporated. Rows that trace to decisions approved above
now record approved choices instead of Open or Proposed questions. Their future
evidence is unchanged, except:

| Row                          | Edition 0.3 change                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-18 Plans/pricing/currency | Documentary: D-08 and D-09 approved, with the exact MWK 20,000.00 = 2,000,000 minor-unit example. Future: add provider amount-unit evidence and exact-amount verification before Phase 7 live checkout. |
| AC-19 Workspace usage        | Documentary: D-10 approved at 2. Future: boundary cases at 2 active workspaces, including concurrent requests for a second and third workspace.                                                         |
| AC-32 Publication/review     | Documentary: this edition's diff, checks and reviews will be recorded in PR #5 after publication. Future: unchanged; independent approving review and the user's explicit merge instruction.            |
| AC-34 Provider economics     | Documentary: C-11, C-12 and the MWK sensitivity added. Future: add the operator-approved USD-funding method and rate.                                                                                   |

No row records a product test pass, a measured objective or a completed later
phase.

## Phase 2 completion record

| P-01 page 10 Phase 2 element                            | Evidence                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Bounded scope                                           | D-03 (U-02)                                                                                             |
| Account billing model                                   | D-05 to D-07 (U-02)                                                                                     |
| Prices                                                  | D-08, D-09 (U-09)                                                                                       |
| Quotas                                                  | D-10, D-11, D-21 (U-09)                                                                                 |
| Periods                                                 | D-12 to D-16 (U-09)                                                                                     |
| Languages                                               | D-17 (U-07), D-28 (U-09)                                                                                |
| Service objectives                                      | D-18 (U-08); D-26, D-27 and v0.2's other inherited-objective dispositions and later design gates (U-09) |
| Versioned specification and traceable acceptance matrix | Editions 0.1 to 0.3; AC-01 to AC-37 with the delta above                                                |

Phase 2's decision gate is satisfied in documentation. Repository acceptance
follows the existing policy: independent approving GitHub review of PR #5's
final head, resolved threads, current required checks and the user's explicit
merge instruction. Phase 3, domain and infrastructure design, begins only on
the user's next command (P-01 page 10). Phase 3 design does not itself
authorize provisioning, purchases, DNS, deployment, migrations, Neon lifecycle
actions or protection changes.

## Change log

| Edition | Date       | Change                                                                                                                                                                                                  |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-11-03 | Scope and billing foundations approved; commercial values, languages and objectives Open.                                                                                                               |
| 0.2     | 2026-11-03 | Languages and engineering targets approved; complete contract proposed.                                                                                                                                 |
| 0.3     | 2026-11-04 | U-09 recorded: complete v0.2 contract approved with MWK 20,000.00 per 30-day term and 2 active workspaces; MWK dependencies and sensitivity restated; Phase 2 decision gate satisfied in documentation. |

This edition changes documentation only. Publication evidence for this edition
belongs in PR #5 and the completion chat, not inside this file.
