# Phase 3 capacity, funding and operational ownership

Part of the [Phase 3 design bundle](README.md). Status: **named coverage people,
cohorts and planning envelope approved within P3-U03/P3-U04; role assignments,
runbook details and calculations are selected design.** No capacity,
bill, availability or recovery result is demonstrated, and nothing is
purchased. The approved catalogue is unchanged.

## Owner decisions

| ID     | Decision                                                                                                                                                                                                                           | Boundary                                                                                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-U03 | The owner answered the coverage question with "Shane Viyazhi and Sherise Viyazhi". The selected interpretation assigns Shane primary operator, incident commander and evidence ownership, with Sherise as backup.                  | The answer names people; it does not prove agreement to each responsibility, continuous availability or access. The selected roles, independent access and alert delivery are rehearsed before Phase 5 creation (G-04).          |
| P3-U04 | Ten initial paying owners and qualification with 25 synthetic owners; USD 1,000 monthly planning envelope plus a separate USD 250 reserve. Funding uses a USD-capable account or card, with actual statement FX and fees recorded. | Planning only, with no spending authority. The launch cap is an operational admission control, not a new catalogue tier. Raising it needs capacity and funding review. The 100-owner stress test is selected engineering design. |

## Load cohorts

| Cohort        | Owners / active workspaces | Data                 | Purpose                                                                    |
| ------------- | -------------------------- | -------------------- | -------------------------------------------------------------------------- |
| Launch        | At most 10 paying / 20     | Real customers       | First paid operation inside the funded envelope.                           |
| Qualification | 25 synthetic / 50          | Synthetic, staging   | Load and recovery qualification before the cap is raised.                  |
| Stress        | 100 synthetic / 200        | Synthetic burst only | Find overload behavior and fairness; no promise to serve this many owners. |

The probe design below adds twelve operator-funded fixture owners on ordinary
Launch grants. Their actual CPU, memory, database connections and writes,
network, storage and monitoring traffic count toward total capacity and
provider budgets, in addition to the customer cohorts above. Load tests must
include that traffic alongside every customer cohort; separate reporting does
not remove its load. Their operator-funded payments are excluded from customer
revenue projections.

Contract maxima per 30-day term (approved allowances × cohort):

| Dimension             | Per owner | Launch (10) | Qualification (25) |
| --------------------- | --------- | ----------- | ------------------ |
| Completed AI answers  | 1,000     | 10,000      | 25,000             |
| External API requests | 25,000    | 250,000     | 625,000            |
| Conversation messages | 10,000    | 100,000     | 250,000            |
| Ingestion runs        | 100       | 1,000       | 2,500              |
| Embedding tokens      | 5,000,000 | 50,000,000  | 125,000,000        |
| Held storage (stock)  | 1 GiB     | 10 GiB      | 25 GiB             |
| Active sources        | 100       | 1,000       | 2,500              |
| Retained revisions    | 300       | 3,000       | 7,500              |

**Arrival assumptions** (selected for design, validated in Phases 5, 9, 11, 12
and 15):

- External API: the launch average is 0.096 requests per second. If every
  owner sits at 60 per rolling minute, the burst is 10 per second at launch
  and 25 per second at qualification, sustained for 60 seconds in tests.
- Visitor messages: average 0.039 per second at launch. Bursts assume 20
  concurrent visitor sessions at launch and 50 at qualification, each at 20
  sends per minute: about 6.7 and 16.7 sends per second.
- AI answers: about 14 per hour on average at launch; 10 concurrent streams
  at launch and 20 at qualification.
- Ingestion: about 33 runs per day at launch. Bursts are 20 documents at
  launch (two per owner) and 50 at qualification.
- Owner sessions: 10 concurrent at launch, 20 at qualification.

**Storage distribution.** Occupancy is 30% at launch (3 GiB held) and 60% at
qualification (15 GiB). Revisions per source: 50% one, 30% two, 20% three
(mean 1.7). Held bytes: 60% originals, 20% quarantine or in review, 20%
derived. These are independent ceilings: 7,500 files of 10 MiB would exceed
25 GiB, and the storage reservation must reject that combination. Physical
database size is planned at 5 GiB at launch with a 25 GiB ceiling at
qualification. A 1536-dimension float32 vector alone is 6,144 bytes before
overhead. Measure real distributions and write amplification before buying
larger storage.

## Queue, compute and connection budgets

**Ingestion.** Planning service time is 60 seconds of compute per document:
scan up to 15 seconds, parse up to 30, indexing work up to 15 excluding
provider latency. With two global parse slots that is two documents per
minute. A 20-document launch burst drains in about 10 minutes, and a
50-document qualification burst in about 25. A 25% retry allowance gives 1,250
effective runs per term at launch and 3,125 at qualification. Owners are
served round-robin, with at most two running each. These are calculations, not
deadlines; Phase 9 sets the ingestion deadlines.

| Resource        | Launch allocation                                                                                                                                                     | Scale trigger (review before acting)                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| API             | 2 × 1 CPU / 2 GB (Render)                                                                                                                                             | p95 CPU above 70% or memory above 80% for 15 minutes: add a replica after rechecking the connection budget.         |
| Jobs worker     | 1 × 1 CPU / 2 GB                                                                                                                                                      | Queue age above 15 minutes for admitted work, or lease renewals missing.                                            |
| Scanner         | 1 × 2 CPU / 4 GB, non-concurrent reload                                                                                                                               | Peak memory above 75% of the limit during reload: move to 2 CPU / 8 GB (USD 135, RDR-11).                           |
| Parser VM       | 2 vCPU / 4 GiB, 2 sandboxes of 512 MiB                                                                                                                                | Parse queue age above 15 minutes at the two-slot cap: add a VM or larger VM after preflight.                        |
| Recovery intake | 1 CPU / 2 GB public HTTPS web service `recovery-intake-{env}` in a separate recovery-only Render workspace, with independently scoped staging/production environments | Copy-receipt p95 above the upload budget, resource pressure above 75%, or rejected writes: qualify before resizing. |
| Recovery job    | 0.5 CPU / 512 MB, every 30 minutes, in the recovery-only workspace and matching environment                                                                           | A run over 15 minutes, or the dump size doubling: upsize before the 20-minute abort is reached.                     |
| Database        | Neon Launch, 0.25-1 CU autoscaling, always on                                                                                                                         | Sustained CPU at the maximum, or connections above 75% of the budget.                                               |
| Staging         | 1 API, worker and scanner suspended outside test windows, its own parser VM and Neon project                                                                          | Qualification runs bring every staging service up at production size first.                                         |

**Connections.** Peak 66 against 97 usable at 0.25 CU. The derivation is in
[data and recovery](data-and-recovery.md#connections).

**Recovery reachability and administration.** Intake is a public HTTPS web
service, not a private service across blocked workspace boundaries. The
application and recovery workspaces retain private isolation. Render's load
balancer terminates TLS, so the selected client authentication is an Ed25519
signature over a canonical create request binding environment, operation,
object identity, hash, byte length, lifecycle generation, timestamp and nonce.
The intake verifies freshness, immutable creation and durable nonce replay
protection, then returns a signed durable receipt. Raw recovery R2 keys reside
only in the recovery-only workspace, which belongs to a separate Render
organization/account. Pro allows one workspace per organization (RDR-11);
the application and recovery organizations therefore have separate Pro
subscriptions, USD 50 combined before compute. Recovery organization logins
and API tokens are independent
of application-workspace identities; neither identity set belongs to the other
workspace, even when the same people hold separate identities. G-04 verifies
this access boundary before creation. Each environment has separate intake,
cron configuration, signing keys, allowed sender scopes and recovery keys.

**Retry and provider outages.** At most three attempts per stage, with
exponential backoff and jitter. Each provider has a circuit breaker that opens
after 5 consecutive failures, or 50% failures in a minute, and half-opens after
60 seconds. Uncertain AI, payment and email outcomes stay held until
reconciled; no duplicate paid call is made. Retried AI work is Nthawi's cost
(v0.2), so the AI line below carries a 25% overhead. Every critical-provider
outage counts against availability.

## Funding worksheet

Monthly USD. "Public" means a dated public rate in the source ledger; it is
not an account quote or purchase approval. "Estimate" means no account quote
exists. Shared subscriptions are counted once. These are planning allocations,
subject to measured workload, current invoice terms and later spending authority.

| Category                                      | Production | Staging | Basis                                                                                                                                          |
| --------------------------------------------- | ---------: | ------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Render application workspace Pro              |         25 |  shared | Dated public rate (RDR-11); application workspace only                                                                                         |
| Render recovery-only workspace Pro            |         25 |  shared | Additional Pro subscription in a separate Render organization/account (one workspace per Pro organization, RDR-11); independent administration |
| Render API                                    |         50 |      25 | Public: USD 25 per 1 CPU / 2 GB instance                                                                                                       |
| Render jobs worker                            |         25 |      10 | Public; staging estimate suspended outside test windows                                                                                        |
| Render scanner                                |         85 |      30 | Public USD 85; staging estimate suspended outside test windows                                                                                 |
| Render recovery intake HTTPS web service      |         25 |      10 | Public USD 25 per 1 CPU / 2 GB (RDR-11); staging duty-cycle estimate, suspended outside tests                                                  |
| Render recovery cron job                      |          2 |       1 | Estimate: per-second billing, USD 1 minimum (RDR-12)                                                                                           |
| Parser VM (DigitalOcean Frankfurt proposal)   |         24 |      24 | Dated public price (DO-01); provider and size are engineering selections, not P3-U02 purchase approval                                         |
| Neon Launch                                   |         35 |      20 | Estimate from NEON-06 rates: always-on 0.25 CU is USD 19.35, plus autoscaling, storage and 7-day history                                       |
| Netlify Pro                                   |         20 |  shared | Public (NET-10)                                                                                                                                |
| Resend Pro                                    |         20 |  shared | Release source C-10 (3 November 2026), not re-read                                                                                             |
| R2, production account                        |          5 |       0 | Estimate at R2-07 rates                                                                                                                        |
| R2, recovery account                          |         40 |      10 | Estimate: checkpoint sizes and retained object-copy sensitivity below; staging assumes one eight-day qualification window per month            |
| Monitoring, two probe locations, errors, logs |         40 |       5 | Estimate; providers selected in Phase 5                                                                                                        |
| AI and embeddings                             |         40 |       5 | Estimate: 10 fully consuming owners about USD 27 at C-04/C-05 rates, plus 25% overhead (Phase 11 qualifies)                                    |
| Domain renewal, annualized                    |          5 |       0 | Estimate; renewal price not re-read                                                                                                            |
| Twelve paid Launch probe fixture owners       |        160 |       0 | Operator funding allocation for ordinary grants, fees and tax; cash-flow estimate, not a provider quote or customer revenue                    |
| **Subtotal**                                  |    **626** | **140** | **USD 766 per month**                                                                                                                          |
| Unallocated headroom in the planning envelope |            |         | USD 234, 23.4% of USD 1,000; separate USD 250 reserve untouched                                                                                |

Approved planning envelope: USD 1,000 per month, plus a separate USD 250
emergency reserve (P3-U04). The USD 766 subtotal is a provisional estimate,
not a bill or measured capacity claim. Excluded: labour, support staffing, tax on provider
invoices, card FX spread and fees, merchant collection fees, legal and
accounting, overages, dedicated outbound IPs, an 8 GB scanner, extra replicas
and AI use above the line. The fixture allocation includes an allowance for
its own fees and tax, subject to actual payment quotes. Other exclusions must
be covered by the headroom or a funded revision before they are incurred.

**Recovery and duty-cycle assumptions.** A dump-count bound is insufficient
to price storage. Use an estimate of 90 physical dump equivalents at 25 GiB
each, allowing for GC delay, incomplete runs and restore pins beyond the
nominal 63 usable checkpoints. Eight retained copy-generations of 25 GiB add
200 GiB: 2,450 GiB, about 2,630.67 decimal GB. At R2-07's USD 0.015 per
GB-month, that is about USD 39.46 for storage before operations, journals and
manifests. This is an estimate, not a proven physical-count ceiling. The USD 40 production line
has little margin before operations; allocate part of the USD 234 headroom or reforecast before this sensitivity becomes actual usage; it does not establish those byte bounds. Compression, logical
dump size, customer churn and copy amplification must be measured, and excess
retention must increase the forecast. Staging's USD 10 assumes no more than
one eight-day window at that footprint per month; persistent qualification
data or repeated windows require reforecasting. Expiring staging data must
still obey the eight-day recovery retention boundary.

The USD 2 production cron allocation corresponds to roughly 8.6 average
minutes per half-hour at the USD 7 monthly 0.5 CPU / 512 MB rate, excluding
ancillary charges. It needs measurement against the checkpoint's 20-minute
abort. Staging worker, scanner and intake estimates assume limited test
windows; a full-month production-sized staging allocation costs more. These
assumptions are review gates before funding, not proven savings.

**MWK and USD.** At the C-11 selling rate (MWK 1,751.0000 per USD, 3 November
2026), the envelope is MWK 1,751,000 per month and the reserve MWK 437,750.
This illustrates scale only; no rate is assumed for real bills. The USD 766
estimate is about MWK 1,341,266 at that dated rate. Launch customer revenue at
the ten-owner cap is MWK 200,000 gross per 30-day term, about USD 114.22:
11.4% of the planning envelope or 14.9% of the estimate. Operator-funded probe
payments are excluded from that revenue. The owner funds the remainder.
At an illustrative 3% fee, net customer revenue is MWK 19,400 per owner,
about USD 11.08 at the selling rate. A sensitivity against the full planning
ceiling would need:

- **No AI use:** 1,000 / 11.08 ≈ **91 paying owners**, rounded up.
  The numerator is the whole USD 1,000 planning ceiling, treated as the
  non-AI budget in this scenario; no unused AI allowance is deducted.
- **Full AI use:** 960 / (11.08 − 3.38) ≈ **125 paying owners**, rounded up
  (USD 1,000 minus the USD 40 production AI allowance gives the USD 960
  non-AI budget; deducting USD 3.38 marginal AI cost per owner, including
  overhead, from net revenue then accounts for AI once).

Both sensitivities are before tax, labour and the extra capacity those owners
would need. They are not forecasts or capacity promises, or break-even for
the smaller USD 766 estimate. The approved price does not change. For every
bill, the operator ledger records invoice currency and amount, MWK debited,
statement rate, fees and funding source.

**Spend controls.** Each provider line has budget alerts at 50%, 80% and 100%.
At 80% of the USD 1,000 planning envelope (USD 800) P notifies the owner.
At 90% (USD 900), expansion
freezes and P presents a funded remedy. Hard provider caps are used only where
they fail safe (for example an AI project limit). A cap that would cause an
outage is replaced by an alert. Nothing buys capacity automatically, changes
the catalogue, hides rejected work or passes costs to owners.

## Availability probes (D-27)

**Measurement.** Each UTC calendar month is divided into minute slots. Two
independently operated external probe locations on different networks and
providers run every journey in every minute: one in southern Africa and one in
Europe. Phase 5 selects the provider, which needs minute scheduling, a secret
store, raw result export and alerting. A minute is **good** only if every
journey passes from both locations within its deadline. Any failure makes it
**bad**. A missing result is **unknown**, never good. Reports show good, bad
and unknown counts, observed availability `good / (good + bad)`, measurement
coverage `(good + bad) / all minutes`, and conservative success
`good / all minutes`. A 99.9% claim needs complete evidence. Maintenance and
provider outages count. 99.9% allows 43.2 bad minutes in a 30-day month and
44.64 in a 31-day month.

| Journey | Assertions                                                                                                                                                                                                                                                                                 | Deadline                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Owner   | `GET https://app.nthawi.io/` returns 200 with the expected release marker. The synthetic owner session reads its fixture workspace through the same-origin proxy (200, expected ID, `no-store`). The same request without a session returns 401.                                           | 10 seconds in total; 5 seconds per request |
| API     | `/health/live` returns 200 `{"status":"ok"}` and `/health/ready` returns 200 `{"status":"ready"}`. The synthetic external credential reads its own fixture (200). A request for another owner's fixture is denied (403 or 404).                                                            | 10 seconds in total; 5 seconds per request |
| Widget  | A fixture page on a separate site loads the versioned loader; the iframe reports ready; a visitor capability is issued; an idempotent synthetic send is acknowledged and appears as an ordered persisted event. The fixture conversation stays in human-takeover mode, so no paid AI runs. | 15 seconds in total                        |

Expected denials pass only inside their explicit negative assertions.

**Fixtures and ordinary grants.** The selected design rotates probes across
twelve operator-funded fixture owners using ordinary paid Launch grants,
the normal price and payment path, and normal admission, reservation and
settlement. Their content is synthetic; their accounts, payments and grants
are real. No internal entitlement or allowance exemption is created. In a
31-day month, two locations sending once per minute produce 89,280 widget
messages, or 7,440 per fixture owner under balanced rotation, below the
10,000-message grant. Positive external API requests rotate across the same
owners; even two metered reads per send produce 14,880 per owner, below
25,000. Expected authorization denials occur before admission and do not
consume grants. Phase 5 verifies exact request counts and separate monitor
traffic in every load profile; the normal per-owner rate limit still applies.

Twelve grants cost MWK 240,000 gross per 30-day term at the unchanged
MWK 20,000 price, before real fees and tax. A 31-day monthly accrual is
MWK 248,000 before those charges. The worksheet reserves USD 160 monthly
for this operator funding, subject to actual statement FX, merchant terms,
tax and a payment quote before funding. These are circular operator-funded
cash flows, excluded from customer cohort revenue; the worksheet reserves the
gross outgoing amount conservatively. Actual receipts and fees reconcile in
the ledger rather than being counted again as independent customer income.
No purchase or payment is authorized by Phase 3. Future fixture funding and
payment execution are prerequisites in G-05.

Phase 5 builds scheduling, telemetry and checks for the foundations that
exist then. Full paid-grant, ingestion and owner/widget journeys depend on
the relevant later product phases, including payments in Phase 7 and inbox
behavior in Phase 13. Until those paths exist and pass, the probe report names
the missing journeys and cannot claim complete D-27 coverage or achieved
availability. Fixture conversations are deleted daily. Content-free raw minute
records are retained for 90 days, monthly summaries and incident evidence for
13 months; content deletion follows the approved recovery window.

**Alerting.** One failed journey from one location raises a warning. Two
consecutive bad or unknown minutes page P and B. Integrity or security alerts,
and a recovery checkpoint older than 45 minutes, page immediately. Detection
time is the first failing evidence, not the page acknowledgement. No alert or
message is sent in Phase 3.

## Incident authority and objective feasibility

The holders below implement the selected interpretation of P3-U03. Detailed
responsibilities, access and escalation times are runbook design, to be
confirmed and rehearsed through G-04 before later execution. Naming a person
does not establish their consent, access or continuous availability.

| Role                                    | Holder                                | Responsibility                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accountable owner                       | Product owner (the user)              | Approves spend, catalogue, policy, scope and any target revision.                                                                                                                                                      |
| Primary operator and incident commander | Shane Viyazhi (P)                     | Runs deployments and migrations on command; manages secrets, registrar and renewals; commands incidents; owns evidence (probe reports, restore drills, decision and incident records).                                 |
| Backup operator                         | Sherise Viyazhi (B)                   | Holds independent access to the registrar, every provider, the vault and the recovery account; is on the same alert routes; takes command if P has not acknowledged a page within 15 minutes; leads one restore drill. |
| Independent GitHub reviewer             | Per ruleset 24955831                  | Reviews code and documentation; separate from operations and from merge authority.                                                                                                                                     |
| Support                                 | To be named before paid launch (v0.3) | Best effort; Phase 13 defines inbox and support operations.                                                                                                                                                            |

For later operation, this selected runbook delegates containment to either
P or B: close traffic, suspend a service, revoke credentials or disable a
feature. It authorizes no such action in Phase 3. Restoring over production,
deleting data or cutting DNS over needs a recorded incident decision by the
incident commander, and the owner is informed. The RTO clock runs from the
earlier of automatic detection and declaration, with no office-hours pause.

**RTO budget, 240 minutes:**

| Minutes | Activity                                 |
| ------: | ---------------------------------------- |
|      15 | Detection and containment decision       |
|      30 | Access and environment preparation       |
|      75 | Database restore and object verification |
|      45 | Deletion replay and reconciliation       |
|      45 | Critical journeys                        |
|      30 | Controlled reopening                     |

RPO and history follow the
[recovery design](data-and-recovery.md#recovery-design). Phase 15 must measure
this budget with the qualification dataset and P unavailable. A miss requires
capacity or coverage changes, never a paused clock.

**Feasibility gaps.** Each has a named gate and none contradicts an approved
target today; [execution and acceptance](execution-and-acceptance.md#later-gates-and-stop-conditions)
lists the gates.

- The export path that bypasses row security is unproven (Phase 4).
- Database latency between Frankfurt and London is unmeasured (Phase 5).
- Netlify's support for Next.js 16.4.1 is unproven (Phase 5).
- Sherise's access and alert delivery are unrehearsed (G-04).
- Ordinary probe grants need later funding and real payment evidence (G-05).
- The Reply-To mailbox and DMARC report destination remain unconfirmed or unassigned (Phase 5/6).
- Restore timing at qualification scale is unmeasured (Phase 15).
- The full probe journeys depend on later product implementation; Phase 5
  foundation checks alone cannot establish D-27 availability.
- Launch customer revenue covers about 11.4% of the USD 1,000 planning
  envelope, or 14.9% of the USD 766 estimate; owner funding remains necessary.
- Recovery byte bounds, staging duty cycles, cron duration and fixture fees
  need measurement or quotes before the provisional funding model is relied on.

Two people can provide continuous coverage only with redundant paging and
agreed availability. A period when both are unavailable is a recorded risk,
reviewed quarterly.

**Later gates preserved.**

- Phase 9: ingestion deadlines and parser bound validation.
- Phase 11: AI model, latency and cost.
- Phase 12: stream heartbeat, replay and reconnect deadlines.
- Phase 13: inbox and support operations.
- Phase 15: benchmark profiles and measured recovery, security and
  performance.
- Before paid launch: named support.
