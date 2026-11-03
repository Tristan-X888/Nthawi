# Nthawi release decision register v0.1

Date: 3 November 2026 (Africa/Blantyre).
Applies to [specification v0.1](specification.md) and its
[acceptance matrix](acceptance-matrix.md).

## Status and ownership

**Approved** requires explicit current user authority. **Confirmed** is freshly
verified repository evidence, not a product choice. **Proposed** is a concrete
reference recommendation awaiting approval. **Open** has no selected answer.
Deferral is not rejection or approval of a default. A dependency may remain
unverified even when the related scope is approved.

The **user/product owner** is the decision owner and approver for all product,
commercial, language and service choices below. No named engineer, legal adviser
or operator has been appointed by this register. A future implementer may gather
evidence and propose answers; they cannot self-approve product policy.
Repository facts are recorded by the Step 2.1 executor and verified through
Git/GitHub. Required independent GitHub review remains a separate merge gate.

## Source register

| Source | Authority and locator                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-01   | Current chat, 3 November 2026: Step 2.1 only; accepted baseline; documentation publication authorized; no merge or product/infrastructure/database implementation.                                                                                                                                                                                                                                                                  |
| U-02   | Current chat answer, 3 November: "Approve this scope and billing model", responding to the full 12-capability/six-format scope, exclusions, owner-shared versioned allowances, no consumed-usage restoration on deletion, and manual prepaid renewal proposal.                                                                                                                                                                      |
| U-03   | Current chat answer, 3 November: "Keep all commercial values and policies open". Does not revoke the specifically approved billing foundations in U-02.                                                                                                                                                                                                                                                                             |
| U-04   | Current chat answer, 3 November: "Keep languages and service objectives open".                                                                                                                                                                                                                                                                                                                                                      |
| P-01   | `Nthawi_io_Production_Implementation_Plan.pdf`, production delivery v1.0, 30 October 2026; SHA-256 `8a4368e2a68ae4f62d1cc5916ef456ba7f13a3025fcc07dc1f7a1cd5be27d5e9`; supplied operator Downloads copy, not a repository/build dependency. Pages 4-5: scope/commercial proposals; 10: phase gate; 11-12: objective proposals; 14-15: format/safety candidates; 16-17: payment/renewal proposals; 18: release/evaluation proposals. |
| G-01   | [PR #4](https://github.com/Tristan-X888/Nthawi/pull/4), [review 5753135022](https://github.com/Tristan-X888/Nthawi/pull/4#pullrequestreview-5753135022), accepted merge `0dd234d2af9663f05d5c1ed69e6fd7f4668e3efe`; current refresh in the [Step 2.1 record](../../plans/2026-11-03-phase-2-step-2.1.md).                                                                                                                           |
| H-01   | [Phase 1 baseline](../../runbooks/phase-1-baseline.md) and [dependency review](../../runbooks/phase-1-dependency-review.md): accepted foundation context and reviewed lockfile; historical pre-merge wording is qualified by the dated closure record.                                                                                                                                                                              |
| H-02   | [8 October reconciliation plan](../../superpowers/plans/2026-10-08-nthawi-reconciled-implementation.md): explicitly historical/superseded fixed pilot quotas and no-customer-billing scope. These do not control this paid-release specification.                                                                                                                                                                                   |
| H-03   | [7 October premium implementation plan](../../superpowers/plans/2026-10-07-better-auth-premium-implementation.md): historical provider subscription estimates and proposed evaluation/processing values, not approved Nthawi prices or release policies.                                                                                                                                                                            |

Current source-of-authority summaries are intentionally recorded in the
repository without copying a private chat URL or private configuration.
U-02 through U-04 are distinct decisions; scope approval does not approve
the numerical examples in P-01.

## Decision register

| ID   | Status    | Decision or proposal                                                                                                                                                                    | Authority / owner                               | Dependencies and acceptance                                                                 |
| ---- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D-01 | Approved  | Limit work to Step 2.1 documentation, preserve existing assets, publish reviewed docs, stop before later work; no merge authorization.                                                  | U-01 / user                                     | AC-01, AC-32; later work needs a separate command.                                          |
| D-02 | Confirmed | Accepted foundation is `0dd234d2af9663f05d5c1ed69e6fd7f4668e3efe`; reviewed parent `6b1d27aba264e0cfdf0db311cc43247d01add319`.                                                          | U-01, G-01 / executor records fact              | AC-02; fresh attempts and effective rules in runbook.                                       |
| D-03 | Approved  | All 12 RS-02 capabilities, six file formats and stated exclusions form the bounded intended release.                                                                                    | U-02; P-01 p4 / user                            | AC-03 through AC-15; product implementation/acceptance remains future.                      |
| D-04 | Proposed  | Owner-only billing administration; cross-owner isolation; resource-scoped visitor/API credentials; no new operator privilege. Distinguish auth provider accounts from billing accounts. | P-01 pp12,17; RS-03 terminology / user          | AC-16; confirm detailed authorization and credential policy before relevant implementation. |
| D-05 | Approved  | Billing unit is the owner account; versioned purchased allowances are shared across its workspaces.                                                                                     | U-02 / user                                     | AC-17; no per-workspace price, tier or limit selected.                                      |
| D-06 | Approved  | Workspace deletion does not restore consumed allowances.                                                                                                                                | U-02 / user                                     | AC-19, AC-20, AC-21; stock-release/counting decisions remain open.                          |
| D-07 | Approved  | Start with manually renewed prepaid PayChangu access.                                                                                                                                   | U-02 / user                                     | AC-13, AC-22; no recurring eligibility or detailed term policy implied.                     |
| D-08 | Proposed  | Snapshot catalog version, exact price/currency, access period and entitlements per purchase; later versions do not reinterpret history.                                                 | P-01 pp4,16 / user                              | AC-18, AC-29; catalog/transition approval needed.                                           |
| D-09 | Open      | Plan catalogue, prices, currency and monetary/tax/fee rules.                                                                                                                            | U-03 / user                                     | AC-18; blocks catalog, checkout, receipt and billing implementation.                        |
| D-10 | Open      | Workspace-count allowance and stock counting/admission/release rules.                                                                                                                   | U-03 / user                                     | AC-04, AC-19; blocks purchased workspace admission.                                         |
| D-11 | Open      | Entitlement dimensions, units, amounts, allocation and exhaustion behavior.                                                                                                             | U-03 / user                                     | AC-20; blocks paid processing and quota enforcement.                                        |
| D-12 | Open      | Service/access and measurement periods, clocks, resets and accounting events.                                                                                                           | U-03 / user                                     | AC-21; blocks metering/access-period implementation.                                        |
| D-13 | Open      | Early/late/overlapping renewal, failed/pending/duplicate payment and plan-change behavior.                                                                                              | U-03 / user                                     | AC-22; blocks renewal/reconciliation rules.                                                 |
| D-14 | Open      | Cancellation subject, effective time, notices and remaining-access effects.                                                                                                             | U-03 / user                                     | AC-23; blocks cancellation behavior.                                                        |
| D-15 | Open      | Expiry/grace duration, permitted actions, in-flight work and reactivation.                                                                                                              | U-03 / user                                     | AC-24; blocks expiry/grace behavior.                                                        |
| D-16 | Open      | Refund/reversal eligibility, calculation, fees, used allowance, access and audit effects.                                                                                               | U-03 / user                                     | AC-25; blocks refund/reversal implementation.                                               |
| D-17 | Open      | Supported languages by product/communication surface and evaluation coverage.                                                                                                           | U-04 / user                                     | AC-26; blocks language-specific acceptance and full Phase 2 approval.                       |
| D-18 | Open      | Service/evaluation objectives and complete measurement definitions. PDF numerical candidates remain proposals.                                                                          | U-04; P-01 pp11-12,18 / user                    | AC-27; blocks objective-dependent sizing, recovery and release acceptance.                  |
| D-19 | Open      | Retention, deletion/purge timing, financial/audit evidence and backup/restore deletion handling.                                                                                        | P-01 pp14,18, no current policy approval / user | AC-28; blocks retention/deletion implementation.                                            |
| D-20 | Open      | Exact extraction/partial/hidden-content/encoding/encryption policies; PDF safety behavior remains recommended.                                                                          | P-01 pp14-15, no current policy approval / user | AC-06, AC-30; blocks detailed parser acceptance.                                            |
| D-21 | Proposed  | Owner-level usage reservations, stable event identity, once-only settlement and uncertain-outcome reconciliation.                                                                       | P-01 pp13,15-16 / user                          | AC-20, AC-21; requires D-10 through D-12 and D-16; no schema authorized.                    |
| D-22 | Proposed  | PDF's file/archive/parser ceiling candidates in RS-06; benchmark before numerical approval.                                                                                             | P-01 pp14-15 / user                             | AC-30; separate safety ceilings from commercial entitlements.                               |
| D-23 | Open      | Recurring eligibility is unverified/unapproved; any future change requires merchant-specific evidence and explicit approval.                                                            | U-02; P-01 p17 / user                           | AC-31; not a blocker to documenting approved manual prepaid direction.                      |

## Questions and required decision packages

These questions are recorded for their owners. Do not infer answers or proceed
with dependent implementation while they remain open. No due date is invented;
the trigger is the affected implementation/acceptance gate.

| Decisions  | Concrete answer/evidence required                                                                                                                                                           | Owner              | Work that waits                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| D-04       | Approve each actor's permitted resources/actions, billing authority, credential scope/revocation, and any operator-access exception.                                                        | User/product owner | Identity, visitor/API and billing authorization design.              |
| D-08, D-09 | Select catalogue/version transition; name each tier; exact price/currency and money representation/rounding; tax/fee responsibility; trial/availability; immutable purchase representation. | User/product owner | Catalog, checkout, receipts, historical plan changes.                |
| D-10, D-11 | State each allowance, unit, owner/workspace scope, counting states, allocation, reservations, concurrency and over-limit action.                                                            | User/product owner | Workspace admission, uploads, AI, messages and API limits.           |
| D-12, D-21 | Select access duration/activation, boundary/timezone/reset; define consumed versus held stock; charge/release/settlement events and retries/failures/uncertain outcomes.                    | User/product owner | Usage ledger, metering, access enforcement.                          |
| D-13, D-14 | Choose renewal anchoring/overlap/late-payment/plan-change rules and cancellation timing, notices and unused-access effects.                                                                 | User/product owner | Renewal/cancellation and reconciliation.                             |
| D-15, D-16 | Choose expiry/grace access and in-flight effects; refund/reversal eligibility/calculation and access/allowance adjustment.                                                                  | User/product owner | Expiry, reactivation, refunds and reversals.                         |
| D-17       | Select languages per RS-07 surface, fallback/locales and representative evaluation data.                                                                                                    | User/product owner | Language-specific journeys/evaluations.                              |
| D-18       | Approve thresholds with metric definitions, windows, loads, environment, owners and evidence; accept/change/decline each PDF candidate.                                                     | User/product owner | Objective-dependent design and launch acceptance.                    |
| D-19       | Select retained categories, access revocation/purge timing, finance/audit obligations and restore deletion behavior; obtain specialist input if needed.                                     | User/product owner | Retention, deletion and recovery policy.                             |
| D-20, D-22 | Resolve partial/encrypted/hidden-content behavior; approve ceiling values after feasible isolation and benchmark evidence.                                                                  | User/product owner | Detailed ingestion/parser implementation.                            |
| D-23       | Only if recurring is later proposed: merchant eligibility, authorization, charging, cancellation and failed-charge evidence, then explicit approval.                                        | User/product owner | Recurring payments; manual prepaid direction does not wait for this. |

## Dependencies and change log

External evidence dependencies include merchant-specific PayChangu capabilities,
safe parser feasibility/benchmarks and measured recovery/performance/provider
behavior. None is established by this documentation step. Consult official
current documentation and the relevant service tools when those later steps
are authorized; do not provision resources to close this register.

| Date       | Event                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-03 | U-01 authorized Step 2.1. U-02 approved scope and billing foundations. U-03 deferred commercial values/policies. U-04 deferred languages/objectives. Edition 0.1 records those decisions without invented defaults. |

An independent technical or CodeRabbit review checks document quality.
It cannot approve these product decisions or supply the independent approving
GitHub review required to merge the new PR.
