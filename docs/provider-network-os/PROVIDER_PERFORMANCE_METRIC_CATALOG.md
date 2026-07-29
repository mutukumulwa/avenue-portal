# Provider Performance Metric Catalog

**Artifact:** PNOS F8.1 deliverable — the versioned launch metric catalog (§8.13).
**Definition version:** `PNMC-1.0` (Provider Network Metric Catalog, version 1.0).
**Status:** SPEC COMPLETE · **APPROVAL PENDING** — this catalog does not activate any calculation until the §7 multi-stakeholder sign-off (product, claims, clinical, finance, network, analytics) is recorded. **F8.1 delivers definitions only — NO calculations** (F8.1 stop).
**Governing decisions:** D21 (scorecards are versioned and advisory); §0 prohibited (a scorecard NEVER auto-suspends a provider, changes a rate, or alters network tiering); §8.13 ("cost is not a proxy for quality").

Every metric below is grounded in a **real schema field** cited as `Model.field @ prisma/schema.prisma:line` (verified on the `feat/provider-network-os` branch). Nothing here is computed from an invented field. Where a fact does not exist yet, the metric family is marked **DEFERRED** in §6 rather than fabricated.

This catalog is the input to **F8.2** (the versioned score schema — numerators/denominators/definition version/completeness/cohort/watermark) and **F8.3** (the deterministic refresh of one metric family). It is NOT a calculator.

---

## 0. Scope, framing, and non-goals

- **Advisory only.** These metrics inform human conversations (F7.7 improvement plans, F8.6 network workspace). No metric drives an automated action. A published score carries an explicit "advisory — not a sanction" warning (F8.5 step 6).
- **Own-provider, own-branch.** A provider sees only its own values + anonymized cohort benchmarks above the minimum sample; a TPA network manager sees named providers only where their role permits (§8.13 view rules; §9.1 authorization order).
- **Cost is not quality.** Utilization/cost measures (already produced by the legacy `ProviderScorecard @ 5652`, unchanged) are presented alongside access/quality/experience context, never as a single punitive score.
- **Canonical facts only.** Every numerator/denominator reads the canonical Claim / ClaimProcessingRun / PreAuthorization / settlement / reconsideration facts — never a re-derivation or a second engine.
- **Non-goals for F8.1:** no calculation, no schema, no refresh, no UI, no scoring engine.

---

## 1. Core definitions (F8.1 steps 1–6)

### 1.1 Clean claim — from the INITIAL canonical run (step 1)

A claim is **clean** when its **initial** canonical processing run completes with a decision and **no exception route**. Grounded in the F5.7 canonical run:

- The initial run = `ClaimProcessingRun.sequence = 1 @ 6918` AND `ClaimProcessingRun.trigger = INITIAL @ 6919` (`ClaimProcessingTrigger @ 6862`). A `MANUAL_REPROCESS` / `DOCUMENTS_UPDATED` / `DUPLICATE_CLEARED` re-run is NOT the initial run and never makes a claim retroactively "clean".
- **Clean** = that initial run reached `ClaimProcessingRun.state = AUTO_DECIDED @ 6923` (`ClaimProcessingState @ 6871`) with no stage routed: no `ClaimProcessingStage.state = ROUTED @ 6947/6898` and `ClaimProcessingRun.routeCode @ 6925` is null. Equivalent claim-level signals: `Claim.hasException = false @ 2396` and `Claim.autoAdjDecision = AUTO_APPROVE @ 2344`.
- **Not clean** = the initial run `state = ROUTED` (any stage routed to a queue) OR `Claim.hasException = true`. A later clean re-run does not change the clean-claim metric for the period the claim was received in.
- **Shadow caveat:** only `ClaimProcessingRun.modeResolved = "LIVE" @ 6921` runs count; `SHADOW`/`OFF` runs are excluded (they are not real decisions).

### 1.2 Provider-controlled time vs TPA-controlled time (step 2)

The two clocks are kept separate so a provider is never charged for TPA latency and vice-versa.

- **Provider-controlled** (the provider owns the clock): information-request response time = `PreauthInfoRequest.respondedAt − openedAt @ 3095/3092`; the analogous claim-side info response uses the same satellite pattern where present. Correction/resubmission latency (`Claim.submissionType @ 2420` CORRECTION/RESUBMISSION chains) is provider-controlled.
- **TPA-controlled** (the TPA owns the clock): PA turnaround (`PreAuthorization.approvedAt/declinedAt − createdAt @ 2642/2659/2692`), claim first-decision turnaround (`Claim.decidedAt − receivedAt @ 2370/2368`, mirrored by `Claim.turnaroundDays @ 2372`), decision-to-payment (`ProviderDisbursement.confirmedAt − Claim.decidedAt @ 7178/2370`).
- **The clock stops** on the controlling party while the OTHER party holds the item: TPA turnaround pauses while an information request is `OPEN` awaiting the provider (`PreauthInfoRequest.status = OPEN @ 3086`), and provider response time pauses once `respondedAt` is set.

### 1.3 Initial vs final / overturned decisions (step 3)

- **Initial decision** = the first `Claim.decidedAt @ 2370` and the first terminal `AdjudicationLog.action ∈ {APPROVED, DECLINED} @ 2588` (`fromStatus/toStatus @ 2589/2590`). Turnaround/first-pass metrics use the INITIAL decision only.
- **Final decision** = the initial decision as modified by a reconsideration: a `ClaimReconsideration @ 7034` reaching `status = ACCEPTED` or `PARTIALLY_ACCEPTED @ 7052` (`ReconsiderationStatus @ 7020`) is an **overturn**; `UPHELD` means the original stands. Overturn rate uses the final outcome; it never rewrites the initial-decision metrics.
- Reversals via correction (`Claim.supersededByClaimId @ 2422`) are lineage events, not decision overturns.

### 1.4 Suspected vs confirmed duplicate — kept SEPARATE (step 4)

There is **no `DUPLICATE` claim status and no `isDuplicate` flag** (`ClaimStatus @ 2212` has no such value). The two are derived and must never be merged:

- **Suspected duplicate** = a fuzzy content match: `Claim.suspectedDuplicateFingerprint @ 2355` matched at intake/adjudication (fingerprint in `claim-intake/fingerprint.ts`; `stageDuplicate` in `claim-autopilot/evaluate.ts`) AND the initial run routed with `ClaimProcessingRun.routeCode = "DUPLICATE_REVIEW" @ 6925` → queue `DUPLICATE_REVIEW`. A suspected duplicate is ROUTED for human review, never auto-linked.
- **Confirmed duplicate** = a reviewer terminally declined/voided the claim (`Claim.status ∈ {DECLINED, VOID} @ 2365`) carrying an `AdjudicationReasonCode` of `category = "Duplicate"` (DUP-prefixed) `@ 2510`. (An authoritative/exact duplicate never becomes a claim at all — `Claim.strongEventFingerprint` is unique `@ 2354/2435` — so it is out of scope of both rates.)
- Cleared suspicions (override `DUPLICATE_CLEAR` → re-run `trigger = DUPLICATE_CLEARED @ 6862`) are excluded from the confirmed rate.

### 1.5 Event timestamps (step 5)

| Event | Field | Note |
|---|---|---|
| **Service** | `Claim.dateOfService @ 2285` | clinical encounter date; the period-assignment default. |
| **Receipt / submission** | `ClaimIntakeReceipt.createdAt @ 6845` | **`Claim.submittedAt` does not exist** — the canonical intake receipt's create instant is the submission time; `Claim.receivedAt @ 2368` is the fallback when no receipt row exists (legacy). |
| **Decision** | `Claim.decidedAt @ 2370` | first decision; `AdjudicationLog @ 2583` gives the audit trail. |
| **Payment** | `ProviderDisbursement.confirmedAt @ 7178` | the SUCCEEDED/channel-confirmed **bank** fact (D16); fallbacks in order: `PaymentVoucher.processedAt @ 4679`, then `ProviderSettlementBatch.settledAt @ 6301` (authorization, not payment). `Claim.paidAt @ 2371` is the legacy claim mirror. |

**Timezone:** all event times are bucketed in **Africa/Kampala (UTC+3)**; a period boundary is the local-midnight of the tenant's operating timezone. (Recorded so F8.3 buckets deterministically.)

### 1.6 Late arrival, freeze, minimum sample, cohort (step 6)

- **Late-arrival handling:** a fact whose event time falls in an already-computed period but arrives after the period's first computation triggers a **re-run** of that period's affected metrics (F8.3 "late arrival rerun"); the score's `definitionVersion` + a `completeness` fraction record how much of the expected denominator was present.
- **Freeze / period rule:** a period is **open** for `LATE_WINDOW_DAYS = 45` after period end, then **frozen**; a frozen period is only re-opened by an explicit corrected republish (F8.4 new publication version), never silently.
- **Minimum sample:** a metric is suppressed for a provider/branch/cohort when the denominator `< MIN_SAMPLE`. Defaults: **per-provider `MIN_SAMPLE = 20`** eligible units; **cohort `MIN_COHORT_PROVIDERS = 5`** distinct providers (anonymity). Below threshold → shown as "insufficient sample", never a number.
- **Cohort:** the anonymized peer set = same tenant + same `Provider.type` + same `Provider.tier` (+ optional `serviceType`/region facet), excluding the subject provider, computed only above `MIN_COHORT_PROVIDERS`; benchmarks are percentile/median/range with **no named peer** (F8.4).

---

## 2. The metric catalog

**Shared defaults** (apply unless a metric overrides): event timezone Africa/Kampala; late-arrival = period re-run within the 45-day window (§1.6); period = calendar month (`YYYY-MM`), frozen at +45d; minimum sample = 20; definition version `PNMC-1.0`; drilldown permission = `provider.performance.read` (own records only) for the provider view + the F8.6 network-analytics permission for the TPA view. Owners named per metric.

Each metric lists the §8.13 template fields that are metric-specific; unstated fields take the shared defaults.

### Family A — Submission quality (owner: Claims Ops + Analytics)

**A1 · Digital submission rate**
- Business question: what share of a provider's claims arrive through a digital rail rather than manual capture?
- Numerator: claims whose `ClaimIntakeReceipt.channel @ 6824` ∈ {`PROVIDER_PORTAL`, `API_V1`, `SMART`, `SLADE360`, `OFFLINE_SYNC`, `CSV_IMPORT`} (equivalently `Claim.source @ 2283 ≠ MANUAL`).
- Denominator: all claims received in the period for the provider (by `ClaimIntakeReceipt.createdAt`).
- Inclusions: original submissions. Exclusions: `submissionType ∈ {CORRECTION, RESUBMISSION, RECONSIDERATION} @ 2420` (counted once at the chain root); superseded/void claims.
- Event time: receipt (`ClaimIntakeReceipt.createdAt @ 6845`). Drilldown: own claims list.

**A2 · Clean-claim rate**
- Business question: what share of claims are decided on the initial canonical run with no exception route?
- Numerator: claims **clean** per §1.1 (initial `ClaimProcessingRun.state = AUTO_DECIDED @ 6923`, no `routeCode`, LIVE mode).
- Denominator: claims whose initial LIVE run completed in the period (`ClaimProcessingRun.sequence = 1`, `trigger = INITIAL`, `completedAt` in period).
- Exclusions: shadow/off runs (`modeResolved ≠ LIVE @ 6921`); claims still `PENDING/RUNNING`.
- Event time: initial run `completedAt @ 6933`. Owner: Claims Ops. Drilldown: own claims + the routed stage.

**A3 · First-pass autopilot eligibility**
- Business question: what share of claims passed the eligibility stage on the first pass without routing?
- Numerator: initial runs whose `ClaimProcessingStage(stage = ELIGIBILITY).state = PASSED @ 6947/6881/6898`.
- Denominator: initial LIVE runs that reached the eligibility stage in the period.
- Event time: stage `completedAt`. Drilldown: own claims + eligibility stage trace (`ClaimProcessingStage.reasonCode @ 6954`).

**A4 · Missing-document rate**
- Business question: how often are claims routed for missing/insufficient documents?
- Numerator: initial runs routed with `routeCode = "DOCUMENTS_INCOMPLETE"` (queue `PROVIDER_QUERY`) — equivalently a line/claim reason of `AdjudicationReasonCode.category = "Documents" @ 2510` (DOC-prefixed, `defaultSeverity ∈ {PEND, REJECT}`).
- Denominator: initial LIVE runs in the period.
- Event time: initial run `completedAt`. Owner: Claims Ops. Drilldown: own claims + the documents stage.

**A5 · Coding / mapping exception rate**
- Business question: how often can a service not be deterministically coded/mapped/priced?
- Numerator: initial runs routed with `routeCode ∈ {"SERVICE_NOT_MAPPED", "PRICING_INCOMPLETE", "RATE_MISSING", "NO_CONTRACT"}` (reason-catalog); line signal `ClaimLine.matchedRuleType ∈ {UNLISTED_*, NO_CONTRACT} @ 2562` or `AdjudicationReasonCode.category ∈ {"Service", "Submission", "Pricing"}`.
- Denominator: initial LIVE runs in the period.
- Event time: initial run `completedAt`. Drilldown: own claim lines + `matchedRuleType`.

**A6 · Suspected duplicate rate** *(kept separate from A7)*
- Business question: how often are the provider's claims flagged as possible duplicates for review?
- Numerator: initial runs routed `routeCode = "DUPLICATE_REVIEW"` on a `suspectedDuplicateFingerprint @ 2355` match (§1.4 suspected).
- Denominator: initial LIVE runs in the period. Event time: initial run `completedAt`.
- Note: suspected ≠ confirmed; a suspicion cleared to `trigger = DUPLICATE_CLEARED` is excluded from A7.

**A7 · Confirmed duplicate rate** *(kept separate from A6)*
- Business question: how often is a claim finally rejected as a genuine duplicate?
- Numerator: claims terminally `status ∈ {DECLINED, VOID} @ 2365` carrying a `category = "Duplicate"` reason (§1.4 confirmed).
- Denominator: claims decided in the period. Event time: `Claim.decidedAt @ 2370`. Owner: Claims Ops.

### Family B — Response / SLA time (owner: Claims Ops for TPA clocks; Network for provider clocks)

**B1 · Provider information-response time (p50 / p90)** — *provider-controlled (§1.2)*
- Business question: how quickly does the provider answer an information request?
- Measure: distribution of `PreauthInfoRequest.respondedAt − openedAt @ 3095/3092` (hours) for requests responded in the period; report p50 and p90.
- Denominator (sample): info requests with a `respondedAt` in the period. Exclusions: `status ∈ {CANCELLED} @ 3086`; still-`OPEN` requests contribute to a separate "overdue" count, not the response distribution.
- Event time: `respondedAt`. Owner: Network. Drilldown: own info requests.

**B2 · TPA PA turnaround (p50 / p90)** — *TPA-controlled*
- Business question: how quickly does the TPA decide the provider's pre-authorizations? (informational to the provider; owned by TPA)
- Measure: `PreAuthorization.(approvedAt|declinedAt) − createdAt @ 2642/2659/2692` (hours) for PAs decided in the period, minus any provider-hold time while an info request was `OPEN`.
- Denominator: PAs reaching `status ∈ {APPROVED, DECLINED} @ 2621` in the period. Event time: decision instant. Owner: Claims Ops. SLA reference: `PreAuthorization.slaDeadlineAt @ 2681`, breach `slaBreachedAt @ 2682`.

**B3 · TPA first-decision turnaround (p50 / p90)** — *TPA-controlled*
- Business question: how quickly does the TPA make the FIRST decision on a submitted claim?
- Measure: `Claim.decidedAt − ClaimIntakeReceipt.createdAt @ 2370/6845` (days) for the **initial** decision (§1.3) of claims decided in the period; `Claim.turnaroundDays @ 2372` is the stored mirror.
- Denominator: claims with an initial `decidedAt` in the period. Exclusions: superseded/withdrawn before decision. Owner: Claims Ops.

### Family C — Pre-authorization discipline (owner: Clinical + Claims Ops)

**C1 · PA compliance rate**
- Business question: for services that require pre-authorization, how often was a valid PA in place?
- Numerator: claims requiring PA that carry an attached PA (`Claim.preAuthorizationId`-equivalent link via `PreAuthorization.claimId @ 2669` / `Claim.status` path `PREAUTH`; PA `status ∈ {APPROVED, ATTACHED, UTILISED, CONVERTED_TO_CLAIM} @ 2599`).
- Denominator: claims whose services required PA (contract `PreauthRule @ 4061` triggered) in the period.
- Event time: `Claim.dateOfService`. Owner: Clinical. Drilldown: own claim ↔ PA linkage.

**C2 · PA-to-claim match rate**
- Business question: of approved PAs, how many converted into a matching claim within validity?
- Numerator: PAs with `status = CONVERTED_TO_CLAIM @ 2599` or a linked `claimId @ 2669` where the claim's service matches within `validFrom/validUntil @ 2643/2644`.
- Denominator: PAs `APPROVED` in the period. Event time: PA `approvedAt @ 2642`. Owner: Clinical.

### Family D — Payment timeliness (owner: Finance)

**D1 · Decision-to-payment days (p50 / p90)** — *TPA-controlled*
- Business question: how quickly is an approved claim actually paid?
- Measure: `ProviderDisbursement.confirmedAt − Claim.decidedAt @ 7178/2370` (days) for claims whose disbursement `status = SUCCEEDED @ 7161` confirmed in the period; fallback payment instant per §1.5.
- Denominator: approved claims paid in the period. Exclusions: reversed disbursements (`status = REVERSED @ 7145`) net out. Owner: Finance. Drilldown: own claim → settlement batch → disbursement.

### Family E — Correction, resubmission, reconsideration (owner: Claims Ops + Network)

**E1 · Correction + resubmission rate**
- Business question: how often do the provider's claims require a correction or resubmission?
- Numerator: claims with `submissionType ∈ {CORRECTION, RESUBMISSION} @ 2420` filed in the period (counted against their chain root `chainRootClaimId @ 2421`).
- Denominator: original claims (`submissionType = ORIGINAL`) received by the provider in the period. Event time: child claim `createdAt`. Owner: Claims Ops.

**E2 · Reconsideration filing rate**
- Business question: how often does the provider formally dispute a decision?
- Numerator: `ClaimReconsideration` rows with `filedAt @ 7051` in the period (`status ≠ DRAFT @ 7052`).
- Denominator: the provider's decided claims in the period. Event time: `filedAt`. Owner: Network.

**E3 · Reconsideration overturn rate**
- Business question: of decisions the provider disputed, how often was the TPA's original decision overturned?
- Numerator: reconsiderations reaching `status ∈ {ACCEPTED, PARTIALLY_ACCEPTED} @ 7052` (§1.3 overturn), closed in the period.
- Denominator: reconsiderations reaching a terminal outcome (`ACCEPTED | PARTIALLY_ACCEPTED | UPHELD`) in the period. Event time: outcome instant. Owner: Claims Ops. Note: a high overturn rate is a signal about **TPA** decision quality, surfaced to both sides — never a provider penalty.

### Family F — Contract variance (owner: Finance + Network)

**F1 · Contract variance / write-off rate**
- Business question: how much of billed value is absorbed as provider write-off against the contracted rate?
- Numerator: Σ `ClaimLine.providerWriteOff @ 2572` (+ `shortfallAmount @ 2568`) over the provider's lines paid in the period.
- Denominator: Σ `ClaimLine.billedAmount @ 2545` over the same lines. Claim-level cross-check: `Claim.contractedVariancePct @ 2322`.
- Event time: `Claim.decidedAt`. Owner: Finance. Drilldown: own claim lines (contracted vs billed vs approved).

### Family G — HMS delivery (owner: Integration) — **DEFERRED**

**G1 · HMS delivery success / retry / quarantine rate** — **DEFERRED to F9/F7.11.**
There is **no per-message integration-delivery model** (no `ProviderIntegrationDelivery`); only `IntegrationConfig @ 5205` (connector config) and `ProviderApiKey.lastSuccessAt/lastFailureAt @ 2966` (inbound key health) exist. This metric cannot be grounded and is **not part of `PNMC-1.0`** — it is added when the F9 HMS integration control plane lands its delivery record. Documented here so it is not silently dropped.

**Member-experience metrics** — **DEFERRED.** §8.13 admits these "only when methodology exists"; no validated member-experience data source exists, so none is defined in `PNMC-1.0`.

---

## 3. Worked edge cases (F8.1 evidence)

1. **Late clean re-run does not launder A2.** A claim received in `2026-07` routes on its initial run (not clean), then a `DOCUMENTS_UPDATED` re-run (`sequence = 2`) auto-decides. A2 for `2026-07` still counts the claim as NOT clean (§1.1 uses the initial run only); the re-run improves nothing retroactively. If the re-run's `completedAt` is within the 45-day window it triggers a period re-run that recomputes completeness, not the clean flag.
2. **Suspected ≠ confirmed.** A `2026-07` claim matches `suspectedDuplicateFingerprint`, routes `DUPLICATE_REVIEW` (counts in **A6**), then a reviewer clears it (`DUPLICATE_CLEARED`). It contributes **0** to **A7** (confirmed). A different claim declined with a DUP reason contributes to A7 but, if never routed on suspicion, may not be in A6 — the two rates are independent by construction.
3. **Overturn does not rewrite turnaround.** A claim's initial decision at `receivedAt + 2d` fixes **B3** at 2 days. A later reconsideration ACCEPTED at day 40 counts in **E3** (overturn) for the reconsideration's outcome period; B3 for the claim's decision period is untouched (§1.3 initial vs final).
4. **Zero denominator suppresses, never divides.** A provider with 4 decided claims in a period (< `MIN_SAMPLE = 20`) shows every rate metric as "insufficient sample", not `0%` or `100%`.
5. **Payment fallback order.** A claim decided `2026-07`, batch `SETTLED` `2026-07-30`, disbursement `SUCCEEDED confirmedAt 2026-08-02`. **D1** uses `confirmedAt` (Aug 2) — the bank fact — not the batch `settledAt` (authorization). If no disbursement row exists (legacy), the voucher `processedAt` is used; the substitution is recorded in completeness.
6. **Provider clock excludes TPA hold.** A PA created day 0, an info request opened day 1 answered day 3, decided day 5. **B2** (TPA turnaround) = 5 − 2 (provider-hold days 1→3) = 3 days; **B1** (provider response) = 2 days. Neither party is charged the other's time.

---

## 4. Cohort & anonymity rules (feeds F8.4)

- Cohort dimension = tenant + `Provider.type` + `Provider.tier` (+ optional `serviceType` facet). A provider is **excluded from a published cohort benchmark** when the cohort has `< MIN_COHORT_PROVIDERS = 5` distinct providers OR the provider's own denominator `< MIN_SAMPLE = 20`.
- Published cohort figures are **percentile / median / range only** — never a named-peer value, never a value a single peer could be reverse-derived from (a cohort of exactly the minimum with one dominant peer is additionally suppressed at F8.4).
- The provider view shows own value + own percentile band; the TPA view (F8.6) may show named providers only where the network-analytics permission is held.

---

## 5. Definition version, owners, and drilldown permissions

- **Definition version:** `PNMC-1.0`. Any change to a numerator/denominator/inclusion/exclusion mints a new version (`PNMC-1.1`, …); a score row always records the version it was computed under (F8.2), and F8.5 shows the version to the provider.
- **Owners (accountable for each definition):** Submission quality → Claims Ops + Analytics; SLA/response → Claims Ops (TPA clocks) / Network (provider clocks); PA → Clinical; payment → Finance; correction/reconsideration → Claims Ops + Network; contract variance → Finance + Network; HMS → Integration (deferred).
- **Drilldown permission:** provider view = `provider.performance.read` (own records only, own/authorized branches — §8.13 provider view); TPA view = the explicit network-analytics permission introduced in F8.6. A drilldown never crosses the provider boundary (§9.1: same not-found for absent vs out-of-scope).

---

## 6. Data-gap register

| # | Gap | Impact | Resolution |
|---|---|---|---|
| G-1 | `Claim.submittedAt` does not exist | submission instant must come from `ClaimIntakeReceipt.createdAt @ 6845` (fallback `Claim.receivedAt @ 2368`) | documented; F8.3 uses the receipt time. |
| G-2 | `Claim.declineReasonCode @ 2375`, `PaymentVoucher.status @ 4678`, `AdjudicationReasonCode.category @ 2510`, `AdjudicationLog.action @ 2588` are free `String`s (not enums) | metrics keying on these rely on convention/seed values | F8.3 pins the accepted value sets from the seed; a future enum migration is out of scope. |
| G-3 | No auto-vs-manual flag on `AdjudicationLog` | first-pass/auto metrics derive the auto path from `Claim.autoAdjDecision @ 2344` + `ClaimProcessingRun.state = AUTO_DECIDED @ 6923` + `modeResolved = LIVE` | documented derivation; A2/A3 use the run state. |
| G-4 | No "confirmed duplicate" status/flag | A7 derives confirmed from a DUP-category terminal decline (§1.4) | documented; A6/A7 kept separate. |
| G-5 | No HMS/integration delivery model (`ProviderIntegrationDelivery` absent) | G1 cannot be grounded | **DEFERRED** to F9/F7.11; not in `PNMC-1.0`. |
| G-6 | No validated member-experience source | member-experience metrics undefined | **DEFERRED** per §8.13 ("only when methodology exists"). |

---

## 7. Multi-stakeholder sign-off (F8.1 step 7) — **PENDING**

This catalog activates no calculation until every owner ratifies the definitions. Each signer confirms the numerators/denominators/inclusions/exclusions/timestamps for their family are correct and launch-ready.

| Stakeholder | Question | Status |
|---|---|---|
| **Product** | Is the launch metric set (Families A–F) the right set for v1, with HMS/member-experience correctly deferred? | ☐ PENDING |
| **Claims** | Are clean-claim (§1.1), first-decision turnaround (B3), and the duplicate split (§1.4) operationally correct? | ☐ PENDING |
| **Clinical** | Are PA compliance/match (C1/C2) and the provider-vs-TPA clock split (§1.2) clinically sound and non-punitive? | ☐ PENDING |
| **Finance** | Are decision-to-payment (D1, using `ProviderDisbursement.confirmedAt`) and contract-variance (F1) definitions correct? | ☐ PENDING |
| **Network** | Are the cohort/anonymity thresholds (§4) and the advisory framing (§0) acceptable for provider-facing publication? | ☐ PENDING |
| **Analytics** | Are the event timestamps (§1.5), timezone, late-arrival/freeze/min-sample rules (§1.6), and the versioning approach implementable deterministically? | ☐ PENDING |

**Until all six are ✅, F8.2+ build against this catalog as internal evidence only and no provider-facing performance score is published.**
