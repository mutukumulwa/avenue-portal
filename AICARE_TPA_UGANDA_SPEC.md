# AiCare TPA Platform — Uganda (Medvec) Feature Specification

**Document type:** System feature specification for Antigravity execution
**Market:** Uganda
**Operating model:** AiCare operated as a licensed Third-Party Administrator (TPA) via the Medvec partnership
**Status convention used throughout:** `Covered` (exists in current AiCare corpus, reusable as-is) · `Partial` (exists but needs TPA/Uganda adaptation) · `New` (net-new build) · `Verify` (depends on an external fact or decision to be confirmed)
**Version:** 0.1 (draft for partner review)

---

## 0. Context, Pivot, and Build Orientation

### 0.1 The pivot

Avenue Healthcare has elected not to proceed with AiCare. The Medvec partnership replaces it as the route to market, and the commercial posture changes fundamentally:

- Under the **Avenue model**, AiCare was a white-label platform sold *to* a Provider-Sponsored Health Plan that was simultaneously payer and provider. We were a software vendor; Avenue bore the risk.
- Under the **Medvec model**, *we operate the platform ourselves as the TPA*. Medvec is the go-to-market vehicle into Uganda. AiCare becomes our production system, administering health benefit plans on behalf of multiple client payers (insurers, HMOs, and employer self-funded schemes). Our revenue is **administration fees**, not premiums or contributions.

This is the single most important framing for everything below: **the system is no longer a product we hand over — it is the operational backbone of our own regulated TPA business.** Reliability, auditability, and regulatory defensibility are now our own operational risk, not a client's.

### 0.2 What changes from PSHP to TPA

| Dimension | Avenue (PSHP) model | Medvec (TPA) model | Impact |
|---|---|---|---|
| Who bears risk | The tenant (single payer-provider) | Client payers (we administer, mostly don't underwrite) | `New` admin-fee revenue model |
| Tenancy | White-label, one primary tenant | Multi-**client**: many insurers / HMOs / employer schemes concurrently | `Partial` extend tenancy to true multi-client |
| Provider relationship | Mostly internal (hospital-owned) | Arm's-length contracted networks across many providers | `Partial` reframe parity/fraud logic |
| Conflict-of-interest vector | Internal clinician–administrator collusion | Provider–member collusion + internal staff collusion | `Partial` adapt fraud module |
| Currency | Single (KES) | Multi-currency (regional clients with subsidiaries) | `New` |
| Connectivity assumption | Kenyan mobile-first, reliable | Ugandan, intermittent — offline operation required | `New` (headline) |
| Identity registry | IPRS (Kenya) | NIRA / National ID (Uganda) | `Partial` swap integration |
| Regulator | IRA Kenya / SHA | IRA Uganda; Uganda DPPA 2019 | `Partial` swap compliance layer |

### 0.3 Relationship to the existing AiCare corpus

This specification **reuses** the five modules already specified in `AICARE_COMPETITIVE_HARDENING_SPEC.md` and the prior build/audit/gap documents wherever they apply, and layers TPA-and-Uganda-specific requirements on top. The reuse map:

| Existing module | Reuse in TPA context |
|---|---|
| Module 1 — Broker Command Center | `Covered`. Brokers/intermediaries drive ~95% employer-led demand in Uganda; this module is more central here, not less. |
| Module 2 — Configurable Terminology Engine | `Covered` and *more valuable*: each client payer can carry its own display vocabulary while canonical insurance enums stay constant in code. |
| Module 3 — Strategic Purchasing & Analytics | `Partial`. Re-orient toward the Ugandan **109% loss-ratio crisis** and per-client loss-ratio reporting. |
| Module 4 — PSHP-Aware Fraud Controls | `Partial`. Keep the immutable audit chain and rules engine; re-weight typologies for arm's-length provider collusion and add shared-fraud-database readiness. |
| Module 5 — Member Experience Hardening | `Partial`. Promote USSD/SMS and mobile money to *first-class* channels (not fallback); swap M-Pesa rails for MTN MoMo / Airtel Money. |

All inherited architectural conventions hold: Next.js 14 + TypeScript, PostgreSQL + Prisma 7+, tRPC, BullMQ + Redis, MinIO, Docker, never-delete (activate/deactivate with effective date ranges), maker-checker at binder level minimum, all user-facing strings via the terminology engine, all sensitive operations to the immutable audit chain.

> **Hosting note (`Verify`):** Supabase EU-Frankfurt was the Avenue default. For a Ugandan-regulated TPA, data-residency under the Uganda Data Protection and Privacy Act, 2019 must be confirmed before locking the region. See §1.3 and Open Decision OD-1.

### 0.4 The offline-first mandate (headline new capability)

Uganda's connectivity is materially less reliable than Kenya's, and a meaningful share of contracted providers will be semi-urban or rural. **The platform must remain operable at the point of care when connectivity is degraded or absent**, and reconcile cleanly when it returns. This is treated as a first-order architectural requirement, specified in full in §4, and it is the technical backbone of Medvec requirement #6 ("backup for online claims submission"). Every claims-path and eligibility-path feature in this document carries an offline behaviour.

---

## 1. Regulatory & Market Context (Uganda)

This section is normative: compliance items here are **features**, not background. The Ugandan winners treat compliance, data privacy, and support as product features rather than back-office obligations, and the regulator is tightening administrator-layer oversight.

### 1.1 TPA licensing under the IRA Uganda

Uganda is the clearest East African jurisdiction in defining a TPA in statute. The Insurance Act defines a third-party administrator as a person providing services to an HMO or licensed insurer in relation to administering health benefit plans or health insurance policies. Governance and fee obligations follow:

- **2021 Insurance (Intermediaries) Regulations** — governance obligations on TPAs: a minimum of three directors with a resident majority, a documented governance framework, and qualified senior finance staff.
- **2020 Fees Regulations** — a UGX 500,000 TPA licence fee and an annual compliance levy based partly on fees received.
- **Compliance circular** — no licence is issued to a broker or TPA that does not meet the **UGX 19 million security-deposit** requirement.

**Platform implications (`New`):**
- A **TPA compliance register** module: licence record, renewal calendar, security-deposit evidence, director register (with residency flag), indemnity cover, annual-compliance-levy computation tied to fees-received reporting.
- Because the compliance levy is partly a function of fees received, the **admin-fee ledger (§5.8) must be the system of record** for the levy computation and must produce the IRA-facing fee return.

> If Medvec also operates or fronts an **HMO** entity, note the separate HMO thresholds referenced in the market research (paid-up capital around UGX 1 billion; professional indemnity around UGX 100 million for errors and omissions) and the perpetual-licence-with-annual-compliance-review regime. See Open Decision OD-2.

### 1.2 Where AiCare wins the regulatory-defensibility argument

The terminology engine's **regulatory positioning artifact** (Module 2.8) generalises directly: for each client payer, the platform can emit a signed, hash-anchored PDF mapping canonical insurance terms to the client's chosen display vocabulary, plus the immutable audit chain (Module 4) for claims decisions. No incumbent in the market is documented as producing either. This is a procurement differentiator with insurer/HMO clients, the IRA, and corporate buyers alike.

### 1.3 Data protection (Uganda)

`New` / `Verify`. Uganda's **Data Protection and Privacy Act, 2019**, administered by the **Personal Data Protection Office (PDPO)** under NITA-U, governs processing of personal and sensitive data — and medical-administration data is squarely sensitive health data. Required platform postures:

- Lawful-basis and consent capture at member onboarding; purpose limitation on health data.
- Data-subject rights handling (access, correction, objection) — wire into the member portal and case management.
- Processor/sub-processor governance (the system itself, plus cloud host, SMS aggregator, mobile-money providers, identity provider).
- Data-residency / cross-border-transfer assessment before host-region lock (OD-1).
- Breach-notification workflow.

Treat this as the Ugandan analogue of the role Kenya's ODPC plays for Kenyan administrators, and verify each specific obligation against current PDPO guidance before go-live.

### 1.4 Market shape and what it dictates

From the market research:

- **Concentration:** the HMO market behaves as a duopoly-plus-fringe (AAR ~67% / Case Med ~33% by 2024 HMO GWP), with provider-network depth and brand trust as the moats.
- **Employer-led:** uptake is below ~1% of the population and roughly 95% corporate. The platform must be excellent at **employer/scheme administration and broker enablement**, and capable of low-cost group plans — retail mass-market is secondary.
- **The 109% loss-ratio crisis:** between 2013 and 2023 the medical sector loss ratio rose from ~74.7% to ~109% — insurers paying out more than they collect. A sustainable band is ~60–80%. **Loss-ratio containment is the product's reason to exist for client payers**, which is why fraud control (§5.11), strict pre-auth/gatekeeping (§5.5), and preventative care (§5.16) are not optional extras.

### 1.5 The four viable TPA "plays" — and our position

The research identifies four winning entrant plays: a white-label digital claims rail; a provider-network and payment orchestrator; a fraud/utilisation-management specialist; and a cross-border employee-benefits administrator. **AiCare is positioned to deliver all four from one codebase**, with claims-rail + fraud/utilisation as the spearhead and provider-payment orchestration as the stickiness moat. The strategic recommendation in the literature is **partnership-first entry rather than balance-sheet-heavy underwriting** — which fits the TPA model exactly: we embed in clients' claims flows without taking their risk.

---

## 2. The TPA Operating Model & Tenancy

### 2.1 Multi-client tenancy

`Partial → New`. The data model must promote the prior "tenant" concept to a true **Client** payer, each with isolated configuration:

```
Client (insurer | HMO | employer-self-funded)
 └─ Scheme (a benefit programme administered for that client)
     └─ Category (Directors, Managers, Staff … — shared product/rates/rules)
         └─ Family (M, M+1 … M+7, >M+7)
             └─ Member (principal | dependant)
```

Each Client carries: its own benefit structures, provider network (or a shared Medvec master network with per-client tariffs), currency, terminology dictionary, approval matrix, copay rules, fraud thresholds, branding, and report templates. Cross-client data isolation is a hard security boundary and an audit-chain assertion.

The `Category → Family → Member` taxonomy and the M…M+7 family-size convention are taken directly from the Rensoft underwriting model and are well understood by the market; retain them as canonical.

### 2.2 Division parameter

`New`. Carry the KCB "division" concept: business booked through general lines vs. medical falls under the corresponding division for production reporting and GL routing.

### 2.3 Admin-fee revenue model

`New`. The TPA earns fees, configured per Client/Scheme, supporting at least:
- **PMPM** (per-member-per-month) network-access/administration fee.
- **% of claims paid** (determinable only at period end — mirror the Rensoft self-funded admin-fee rule).
- **Flat fee per insured** (determinable at policy start).
- **Case-management / pre-auth / cross-border coordination** fees.
- **Card issuance / replacement** fees.

Admin fees must be invoiceable and receiptable (§5.8), feed the IRA compliance-levy computation (§1.1), and be reportable as an admin-fee statement (§7).

### 2.4 Terminology per client

`Covered`. Module 2 resolution order extends to: system default → Medvec house → **Client override** → locale. Each insurer/HMO client can present its own vocabulary (e.g. "Scheme/Member/Contribution" vs "Policy/Insured/Premium") while enums stay canonical in code. This is a genuine multi-client selling point.

---

## 3. Mapping the Medvec Partner Requirements

Traceability for the eight partner requirements. Each maps to one or more sections below.

| # | Partner requirement | Primary section(s) | Status |
|---|---|---|---|
| 1 | Approval Matrix (+ authorization levels) | §3.1, §6 | `New` |
| 2 | Pre-auth online management | §3.2, §5.5 | `Partial` |
| 3 | Active claims dashboard with alerts on incoming claims | §3.3, §5.6 | `New` |
| 4 | Copay management by AiCare | §3.4, §5.7 | `Partial` |
| 5 | Underwriting & claims for subsidiary clients (multi-currency) | §3.5, §5.3, §5.6, §5.8 | `New` |
| 6 | Backup for online claims submission | §3.6, §4 | `New` |
| 7 | Auto-registration & adjudication of claims | §3.7, §5.2, §5.6 | `Partial` |
| 8 | Integration with other systems | §3.8, §8 | `Partial` |

### 3.1 Approval Matrix & Authorization Levels (Req 1)

`New`. A configurable, client-scoped **approval matrix** that governs which roles may approve which actions at which monetary thresholds, with maker-checker and escalation. It is the generalisation of the existing binder-level maker-checker into a first-class, data-driven engine.

**Scope of actions governed:** claim authorisation and payment, pre-authorisation/GOP issuance, benefit-limit overrides and exceptions, scheme/binder activation, commission-rate changes, member endorsements (add/delete/transfer), provider tariff changes, fund top-up application, write-offs and refunds.

**Matrix dimensions:** Client → Scheme → action type → currency-normalised amount band → required approver role(s) → sequence (single or multi-level) → SLA timer → escalation target.

**Behaviours:**
- **Multi-level sequential approval** (e.g. ≤ X by Officer; X–Y by Supervisor; > Y by Manager + Medical Director).
- **Segregation of duties:** the maker can never be a checker on the same item; enforced and audit-chained.
- **Escalation on SLA breach** (ties to §5.5): an unactioned item escalates to the next level automatically.
- **Never-delete rules:** matrix versions are activated/deactivated with effective date ranges; historical decisions resolve against the matrix version in force at decision time.
- A **rights-and-roles report** (KCB R26) shows what each user can approve.

**Acceptance:** any approvable action resolves to exactly one matrix path; no action can be approved outside the matrix; every approval/rejection is on the audit chain with the resolved matrix-version id.

### 3.2 Pre-Authorization Online Management (Req 2)

See §5.5 for the full pre-auth/utilisation spec. Online management means: provider-initiated pre-auth requests, clinical and benefit checks, **20–30 minute target turnaround** (the market benchmark set by leading Kenyan administrators), GOP issuance within pre-approved financial limits, validity windows, and a live pre-auth queue with escalation. Offline behaviour: providers can queue pre-auth requests and receive provisional decisions against the cached benefit balance (§4), finalised on sync.

### 3.3 Active Claims Dashboard with Incoming-Claim Alerts (Req 3)

`New`. A real-time operational console for claims staff:

- **Incoming-claim alerts** (in-app + email + optional SMS) the moment a claim lands from any channel (online, provider EDI, offline sync, Excel import, USSD/SMS, smart-claim capture).
- Live **work queues** by state: received → registered → captured-awaiting-authorisation → authorised → paid (mirrors the KCB bill-lifecycle requirement R65).
- **SLA timers and escalations** per queue (KCB R59): an item idle beyond its configured window escalates to a manager.
- **Per-user productivity widgets** (claims booked per user — KCB R64) and a customisable dashboard per role (KCB R7).
- Drill-through to the **member claims history** (KCB R60) and the duplicate-claim guard (§5.6).
- Filters by client, scheme, provider, currency, and risk flag.

**Acceptance:** a claim arriving on any channel raises an alert and appears in the correct queue within seconds of receipt (online) or within seconds of sync (offline); every queue has a working SLA timer and escalation path.

### 3.4 Copay Management by AiCare (Req 4)

See §5.7. "By AiCare" means the platform is the system of record that **computes, applies, and reconciles copays/co-contributions on behalf of client payers** at the point of adjudication — percentage-of-limit or flat amount, tied to specific covers, configurable at setup, editable during underwriting (the Rensoft copay rule), and enforced at payment. Offline behaviour: copay is computed locally at capture against cached rules and re-validated on sync.

### 3.5 Underwriting & Claims for Subsidiary Clients — Multi-Currency (Req 5)

`New`. A regional client (e.g. an insurer with subsidiaries across markets) is modelled as a parent Client with subsidiary Clients, each potentially transacting in a different currency. Requirements:

- **Currency per Client/Scheme/policy** (the Rensoft policy-currency field, generalised), set at setup.
- **FX rate management:** rate tables with effective dating and source; activate/deactivate, never delete (consistent with the rule convention).
- **Currency-normalised approval bands:** the approval matrix (§3.1) evaluates thresholds on a normalised base currency so a single matrix governs multi-currency clients consistently.
- **Reporting in both transaction and base currency**, with FX-gain/loss visibility for finance.
- **Consolidated parent + per-subsidiary views** for claims experience, loss ratio, and admin fees.

**Acceptance:** a claim in any subsidiary currency is captured, adjudicated, copay-applied, approved against normalised bands, and paid in the correct currency; consolidated reporting reconciles to the sum of subsidiaries at the FX rates in force.

### 3.6 Backup for Online Claims Submission — Offline/Async (Req 6)

This is the offline-first architecture in §4. "Backup" is delivered as a layered set of channels so a claim is never lost when connectivity fails: **offline point-of-care capture with store-and-forward sync**, plus **Excel/CSV import** (KCB R50), **smart-claim capture** (KCB R51), and **USSD/SMS** initiation (§5.10). Each channel converges on the same claim model with idempotency and conflict resolution.

### 3.7 Auto-Registration & Auto-Adjudication of Claims (Req 7)

`Partial`. Two linked capabilities:

- **Auto-registration of members** (KCB R44): create members via pop-up, bulk import/spool from external systems, or self-service, with NIRA identity validation (§5.9) and de-duplication. Family-tree aware (KCB R85).
- **Auto-adjudication of claims** (the global straight-through-processing benchmark): low-risk claims that pass all deterministic checks (active membership, benefit available, within limit, valid tariff, no duplicate, no fraud flag, pre-auth satisfied where required) are **auto-approved without human touch**; everything else routes to the appropriate matrix path. The auto-approve list and validity windows are configurable per client. AI-assisted clinical/coding checks (§5.11) augment but never silently override the deterministic rules — every auto-decision is explainable and audit-chained.

**Acceptance:** a clean claim auto-adjudicates end-to-end; a claim failing any single gate routes to review with the failing gate named; the auto-approve criteria are client-configurable and versioned.

### 3.8 Integration with Other Systems (Req 8)

See §8 for the full catalogue. Anchor integrations for Uganda: **mobile money (MTN MoMo, Airtel Money)**, **provider/EMR/EDI** (Slade360, Smart, FHIR R4), **NIRA national identity**, **insurer/HMO core systems**, **SMS/USSD aggregators**, **accounting/GL and banking/EFT**, and **integration logging** (KCB R3) with a documented data dictionary (KCB R18) for every interface.

---

## 4. Offline-First & Asynchronous Architecture

The technical backbone of Medvec requirement #6 and a hard requirement for every claims/eligibility path.

### 4.1 Design principles

- **The point of care must keep working offline.** Provider-side capture of member verification, pre-auth requests, and claims continues with degraded or no connectivity, and reconciles on reconnect.
- **Server is source of truth; client is a durable buffer.** Offline-created records are provisional until accepted by the server's conflict-resolution and adjudication pipeline.
- **Every offline-creatable operation is idempotent.** Client-generated UUIDs + operation keys prevent duplicate server-side effects on retry.
- **Async by default.** Extend the existing BullMQ pipeline into a **sync-reconciliation engine** rather than inventing a parallel mechanism.

### 4.2 Provider point-of-care client

`New`. A resilient PWA (Serwist service worker, consistent with the prior PWA decision) for provider front desks and clinicians:

- Local store (IndexedDB) of: the provider's contracted members' **cached eligibility and benefit balances**, tariff/price list, copay rules, and pre-auth rules — refreshed on a schedule and on demand.
- Offline capture of: member check-in/verification, pre-auth request, claim/bill, supporting images (queued in local object cache, uploaded to MinIO on sync).
- Provisional decisions computed locally: eligibility (is the member active?), benefit-available check against cached balance, copay computation, duplicate-claim guard within the local queue.
- A visible **sync state** per record (pending / synced / conflict / rejected) and a manual "sync now."

### 4.3 Store-and-forward & sync-reconciliation engine

`New`. On reconnect, queued operations stream to the server and pass through:

1. **Idempotency check** (operation key) — drop exact replays.
2. **Authoritative re-validation** — re-run eligibility, benefit balance, limit, tariff, copay, duplicate, and fraud checks against current server state (the cached client values were provisional).
3. **Conflict resolution** — last-write-wins is *not* acceptable for financial/limit-sensitive records. Use deterministic rules: benefit-balance decrements are re-sequenced server-side by clinical event time; if the cached balance is now insufficient, the claim is flagged for review rather than silently rejected or over-paid.
4. **Adjudication** — feed accepted operations into auto-adjudication / the approval matrix exactly as online claims.
5. **Audit-chain entry** — every synced operation, including its provisional-vs-final decision delta, is appended to the immutable chain.

### 4.4 Eligibility cache integrity

`New`. The risk of an offline eligibility cache is **stale-balance over-spend** (two providers both seeing "limit available" while offline). Mitigations:

- **Soft-reservation model:** the cache holds an available balance net of a configurable safety buffer for high-frequency/high-limit covers.
- **Time-boxed cache validity** with forced re-sync windows; members flagged high-risk or near-limit get shorter validity.
- **Reconciliation flags, not silent failures:** any over-commitment surfaced at sync becomes a review item with full provenance.

### 4.5 First-class low-bandwidth channels

`Partial → New`. USSD and SMS are promoted from "fallback" to primary channels (the market precedent is the widely used USSD access patterns and OTP-based authorisation in Kenyan schemes). They run independently of smartphone/app availability for member verification, visit initiation, OTP authorisation, and benefit-balance queries (§5.10).

**Acceptance (offline):** with the provider client offline for a working day, all captured check-ins/pre-auths/claims are retained, decremented against cached balances with buffers, and on reconnect reconcile with zero data loss, correct final balances, and a complete audit trail; any over-commitment is flagged, never silently paid or dropped.

---

## 5. Core TPA Functional Modules

The feature catalogue. This section absorbs the KCB practitioner punch-list and the Rensoft underwriting taxonomy, and folds in the research-driven differentiators. Status tags indicate reuse vs. build.

### 5.1 Client & Scheme Setup (binder level)

`Partial`. Binder/product configuration with maker-checker (KCB R37) and a **progress bar + completeness report** (KCB R38, R39) showing products under development vs. complete. A **pricing reference at binder level**, keyed in or imported via Excel (KCB R55), drives agreed rates. Workflow customisation per client (KCB R14). Division parameter (KCB R71). Jobs-scheduling screen (KCB R11) and function prioritisation (KCB R12).

### 5.2 Membership Administration

`Partial`. 
- **Member creation** via pop-up, import/spool from external systems, or self-service (KCB R44); **bulk import of medical members** (KCB R13); **family tree** (KCB R85).
- **Endorsements**: add/delete members and categories, cancellation and reinstatement of covers (KCB R40), with approval-matrix governance.
- **Transfers**: member between schemes (KCB R45) and between categories within a policy (KCB R46).
- **Cards**: capture photo cards and smart cards (KCB R41); smart-card replacement and billing (KCB R42); card-type selection (Smart/Photo) at underwriting with configured fees (Rensoft). Biometric data saved from Smart (KCB R49).
- **Renewals**: medical renewal with renewal notices and SMS (KCB R43).
- **Identity**: NIRA validation and de-duplication at creation (§5.9).

### 5.3 Underwriting & Quotation

`Partial`. Carry the Rensoft underwriting model in full and add the intelligent layer:
- **Client creation** (corporate/scheme and individual) and **policy generation** (client, product, cover period full/short, payment mode/frequency, branch, division, **currency**, beneficiary).
- **Covers/sections** with riders — inpatient and outpatient main covers each with chargeable/free riders (IP-MAT, IP-DIALY, IP-EVAC, OP-DNTL, OP-OPTC, etc., per the Rensoft cover catalogue).
- **Benefit limits** per category, applied per family or per member; limits mandatory on every selected cover for claims-time enforcement.
- **Shared limit groups** (carry the net-new item from the prior system audit) — multiple covers drawing on one pooled limit.
- **Copayment** option tied to specific covers, percentage or flat, editable during underwriting (Rensoft) — see §5.7.
- **Taxes/levies** configurable at setup and applied at underwriting; **Uganda tax/levy schedule to be confirmed** (the Rensoft schedule — stamp duty, training levy, PHCF — is Kenyan; replace with the Ugandan equivalents). See OD-3.
- **Self-funded schemes**: fund-deposit capture, next-installment alerting, admin-fee calculation (flat per insured at start, or % of claims paid at period end) added to the debit note (Rensoft self-funded model). Carry as a configurable priority (prior open decision on self-funded scheme priority — now likely **in scope** given employer-led Ugandan demand; confirm via OD-4).
- **Policy authorisation** with **exception generation** wherever underwriting rules are breached, approved before authorisation (Rensoft) — implemented through the §6 exceptions framework and §3.1 approval matrix.
- **Intelligent medical quotation module** (KCB R84) — prior open decision on deferral; recommend Phase 3 (confirm OD-5).

### 5.4 Provider Network Management

`New` (with reuse of fraud scorecards from Module 4). This is the **stickiness moat** the research identifies — hospitals trust administrators with payment discipline and access volume.
- Provider **onboarding/KYC**, contracting, and digital directory (member-facing locator in §5.10).
- **Tariff/price-list management** per provider/client; agreed rate visible at claims level (KCB R56).
- **Automated reconciliation of provider statements** (KCB R58) and shortened settlement cycles (the market prize is moving settlement from ~60–77 days toward ~3 days).
- **Provider scorecards** (turnaround, leakage, anomaly rate) and **suspension/curation workflow** — leading administrators actively prune providers after fraud/ethics findings; activate/deactivate with timeframes, never delete.

### 5.5 Pre-Authorization & Utilization Management

`Partial`. Online pre-auth (Req 2) with clinical + benefit checks, **GOP issuance within pre-approved limits**, validity windows, and configurable auto-approve lists. **Email alerts on pre-auth** (KCB R57) and **escalation on SLA breach** (KCB R59). Target turnaround in the 20–30 minute band. Utilisation review and gatekeeping to counter the over-utilisation driver of the loss-ratio crisis. Offline: provisional pre-auth against cached balances (§4).

### 5.6 Claims Management

`Partial`. The operational heart, fed by the §3.3 dashboard.
- **Multi-channel capture**: online, provider EDI, offline sync, **Excel import** (KCB R50), **smart-claim capture** (KCB R51), USSD/SMS.
- **Documented vetting process** (KCB R52) and rules-based **auto-adjudication** (Req 7) with AI-assisted clinical/coding checks (§5.11).
- **Duplicate-claim guard** (KCB R61): block double-capture on the same provider + service/treatment + member + date; **unique claim/invoice number per provider** (KCB R62).
- **Member history link at capture** (KCB R60).
- **Bill lifecycle** (KCB R65): incurred → register received → captured-awaiting-authorisation → authorise → pay. **Requisitions** (KCB R66). **Payments** updated with cheque/EFT details (KCB R67).
- **Reimbursements** and claims payments processing (KCB R53); **member limit and validity monitoring** (KCB R54); **utilisation notifications** to members (KCB R69).
- **Copay applied at payment** (§5.7). **Allocation processing** (KCB R76) tested across the team.

### 5.7 Copay & Benefit-Limit Enforcement

`Partial`. Copay/co-contribution (Req 4): percentage-of-limit or flat, per-cover, configurable at setup, editable at underwriting, **deducted at payment** (Rensoft), reconciled and reportable. Benefit-limit enforcement at adjudication against per-family/per-member and shared-limit-group balances, with real-time decrement and the offline soft-reservation model (§4.4). Exceeded-limit reporting (§7).

### 5.8 Finance & Billing

`New` (TPA admin-fee centric).
- **Admin-fee invoicing and receipting** (KCB R70) across PMPM / %-claims / flat / case-management models (§2.3).
- **Fund deposits and top-ups** receipting (KCB R68); fund-administration fee invoicing/receipting; **utilisation notifications** on funds.
- **Receipting for medical policies** (KCB R47); commissions, card fees, and taxes captured correctly (KCB R73).
- **Payments**: cheque/EFT (KCB R67), bank integration (§8).
- **Debtors/creditors** (insurers and clients) (KCB R17/R72) and **allocation** (KCB R76).
- Feeds the **IRA compliance-levy computation** (§1.1) and the admin-fee statement (§7).
- **Multi-currency** throughout (§3.5).

### 5.9 Member & Provider Identity

`Partial`. The research is unambiguous: identity fraud is the heaviest anchor on emerging markets, and leaders have abandoned forgeable physical cards for biometric + virtual access. For Uganda:
- **NIRA national-identity integration** as the Ugandan analogue of Kenya's IPRS — validate member identity at onboarding and de-duplicate; cross-reference photo where available. (`Verify` API availability/commercial terms — OD-6.)
- **Biometric verification** (fingerprint/face) with **liveness detection** at the point of care (carry the face-match/liveness SDK item from the prior audit; Smile Identity was the recommended bundle in the Kenyan context — confirm Uganda coverage, OD-6).
- **OTP-based authorisation** to the principal member's phone for treatment authorisation (the prevailing market pattern).
- **Virtual/digital member card** replacing physical cards (the Smart Access precedent), with WebAuthn biometric check-in consistent with the prior decision.

### 5.10 Member Experience

`Partial`. Mobile app + responsive web + **USSD/SMS as first-class channels** (§4.5):
- **Real-time benefit utilisation** visible to members (Module 5.4 carries over).
- **Provider locator with cost transparency** (Module 5.7 carries over; geolocation of network providers).
- **Mobile-money co-contribution and payments** — replace M-Pesa rails with **MTN MoMo and Airtel Money** (Daraja-equivalent APIs). Carry forward the prior **fraud reframing**: focus controls on fake confirmation messages rather than automated reversals, since reversals require provider/aggregator authorisation. (`Verify` exact MoMo/Airtel reversal semantics in Uganda — OD-7.)
- USSD/SMS for verification, visit initiation, OTP authorisation, and balance queries without a smartphone.
- Renewal notices and utilisation alerts by SMS (KCB R43/R69).

### 5.11 Fraud, Waste & Abuse Controls

`Partial`. Reuse Module 4 (rules engine + cryptographically anchored audit chain) and re-weight for the arm's-length TPA and the Ugandan typologies the research documents: **phantom billing** (services not rendered), **dual invoicing**, **price manipulation/upcoding**, **fragmentation/unbundling**, **identity sharing**, **collusive provider–member networks**, and AI-enabled forgery (deepfaked documents, synthetic identities).
- **Provider scorecards and anomaly detection** (§5.4) as a differentiating entry point — the research explicitly flags FWA tooling as the richest differentiation lane.
- **AI-assisted clinical auditing** (IDP/OCR/NLP mapping unstructured notes to ICD-10/11; cross-checking procedure vs. diagnosis) layered on the deterministic rules — augment, never silently override; every AI recommendation is explainable and audit-chained (the documented failure mode is treating AI as a fragmented point solution).
- **Shared-fraud-database readiness:** the Uganda Insurers Association has mulled an industry shared fraud database; design the fraud model and provider/member fingerprints to be **contributable to and consumable from** a future syndicated blacklist, so we are first-mover-ready.
- **Conflict-of-interest register** (Module 4.5) retained — repurposed for internal staff–provider relationships rather than internal-provider parity.
- All rules **activate/deactivate with timeframes, never deleted** (KCB R10).

### 5.12 Strategic Purchasing & Analytics

`Partial`. Reuse Module 3, re-oriented to the loss-ratio crisis: **per-client and per-scheme loss ratio** with the ~60–80% sustainable band as a first-class KPI and alerting when a client trends toward the ~109% danger zone; case-mix-adjusted MLR; renewal intelligence; member risk stratification; alert engine. This is what lets us prove to client payers that we **bend their loss ratio**, which is the only argument that moves this market.

### 5.13 Broker / Intermediary Management

`Covered`. Reuse Module 1 (Broker Command Center) wholesale — broker onboarding/KYC, hierarchical structures, configurable commission schedules, real-time commission ledger, automated reconciliation against receipts, clawback, broker self-service portal, performance analytics, maker-checker on rate changes. Adapt statutory handling: replace Kenyan withholding/IRA-levy specifics with **Ugandan tax and IRA-Uganda agent levies** (`Verify` — OD-3). Given ~95% employer/broker-led demand, this module is central to distribution.

### 5.14 Case Management

`New`. Case-management screens (KCB R78) and reporting (KCB Reports R11): complex/chronic/high-cost case tracking, care navigation, and the data-subject-rights workflow hook (§1.3). Aligns with the research finding that better operators blend administration with care navigation.

### 5.15 Cross-Border / Overseas Care Coordination

`New` (optional play). A governance-controlled coordination layer for overseas/out-of-network cases that integrates into the client's pre-auth workflow, sources vetted facilities with upfront cost estimates, and commits no cost without a formal **GOP within pre-approved limits**, returning a single consolidated audit-ready invoice (the My1Health model). Enables the cross-border employee-benefits "play." Recommend Phase 5 (OD-8).

### 5.16 Preventative Care & Wellness

`New` (loss-ratio countermeasure). The research is explicit that the prevailing curative-only model drives the loss-ratio crisis. Provide: mandatory/funded wellness checks and chronic-disease-management protocols configurable into covers, and an incentivised wellness layer (activity tracking / gamification) of the kind market leaders use to bend long-run claims frequency. Recommend Phase 4+ (OD-9).

---

## 6. Platform & Non-Functional Requirements

Absorbs the KCB system-administration punch-list. All items below are platform-wide.

| Requirement | KCB ref | Status |
|---|---|---|
| Multi-currency functionality | R2 | `New` (§3.5) |
| Multi-lingual functionality | R3 | `Partial` (depth per OD-10) |
| Integration logs | R3(int) | `New` (§8) |
| Online help + helpdesk tool | R5, R27 | `New` |
| Immutable audit-trail logs + report generation | R6 | `Covered` (Module 4 chain) |
| Customisable user dashboards | R7 | `New` (§3.3) |
| Exceptions framework (system-wide) | R8 | `New` |
| Error management (defined messages + behaviours) | R9 | `New` |
| Activate/deactivate + timeframes; never delete rules | R10 | `Covered` (convention) |
| Jobs-scheduling screen | R11 | `New` |
| Function prioritisation | R12, R17 | `New` |
| Workflow customisation | R14 | `New` |
| Security design + patches + network + archiving docs | R16, R20, R21, R22 | `New` (documentation deliverables) |
| Data dictionary | R18 | `New` |
| Maintenance procedures under ongoing audit | R19 | `New` |
| Backup procedures in-system | R23 | `New` |
| Password reset via emailed code | R24 | `New` |
| Single-session control parameter | R25 | `New` |
| Rights-and-roles report | R26 | `New` (§3.1) |
| Log file: size/retention/archival + Word/Excel/SIEM export | R29, R30 | `New` |
| Log fields: date, time, event type, IP, user | R31 | `Covered` (extend chain) |
| Authorized-users-only banner | R32 | `New` |
| High-availability documentation | R33 | `New` |
| Disaster-management documentation | R34 | `New` |
| Data migration / data upload | R35 | `New` (§5.2 import) |
| Production change logs | R36 | `New` |
| Two-factor authentication | R81 | `New` |
| Password policies | R28 | `New` |
| Redundant-design assessment | R83 | `Verify` |
| WebLogic deployment test | R79 | `Verify` — note: AiCare runs Node/Next.js containers, not a Java app server; confirm whether a client mandates WebLogic (OD-11) |
| Performance-monitoring tools | R80 | `New` |
| Password-protected reports | R82 | `New` (§7) |

> **R79 flag:** "Test deployment on WebLogic" originates from a Java-stack reference system (KCB/Rensoft). AiCare is a Node/Next.js containerised stack; WebLogic is not applicable to our architecture. If a Ugandan client mandates a Java application server, that is a material architecture decision — escalate via OD-11 rather than absorbing silently.

---

## 7. Reporting & Analytics

Absorbs the KCB Reports sheet and the 25-report tranche from `AICARE_COMPETITIVE_HARDENING_SPEC.md` Module 3.6. All reports are client-scoped, multi-currency aware, exportable, and individually permissionable (password-protected where flagged — KCB R82).

**Core report catalogue (KCB Reports + practitioner items):**
Claims experience; Exceeded limits; **Loss ratio** (the headline KPI, §5.12); Fund utilisation; Admin-fee statement (§5.8); Ageing analysis; Outstanding bills; Membership lists; Case management; Organic growth; Provider statements; Commission statements; Fees statements; Levies and taxes statements; Debtors and creditors (insurer/client); Financial analysis/reports/statements; Exclusions and rejected claims; Admissions list; Admission visits; Claims booked per user (KCB R64); Statement to members (KCB R77); Debtors listing per category (KCB R72); Rights-and-roles (KCB R26); Product completeness (KCB R39); Services comparison (KCB R75).

**Regulatory exports (`New` / `Verify`):** IRA-Uganda-facing returns including the **annual compliance-levy / fees-received return** (§1.1), and any HMO/insurer-client statutory submissions the IRA requires. Carry the prior corpus's "IRA regulatory export tranches" concept, swapping IRA-Kenya schemas for IRA-Uganda (OD-12).

---

## 8. Integrations Catalogue (Req 8 expanded)

Every interface carries an **integration log** (KCB R3), a documented **data dictionary** entry (KCB R18), retry/idempotency, and where it touches personal data, a processor record (§1.3).

| Integration | Purpose | Uganda specifics | Status |
|---|---|---|---|
| **Mobile money** | Co-contribution, fund top-ups, payouts | **MTN MoMo, Airtel Money** (replaces M-Pesa/Daraja) | `New` |
| **Provider / EMR / EDI** | Real-time e-claims, eligibility, billing | Slade360/Savannah, Smart, **FHIR R4** resource adaptors | `Partial` |
| **National identity** | Member identity validation + de-dup | **NIRA** (replaces IPRS) | `Partial` |
| **Identity / liveness SDK** | Biometric + liveness at point of care | Smile Identity bundle — confirm UG coverage | `Partial` |
| **Insurer / HMO core systems** | Member/scheme sync, claims hand-off, settlement | Per-client adaptors | `New` |
| **SMS / USSD aggregator** | First-class member channel | Ugandan aggregator/shortcode | `New` |
| **Accounting / GL** | Admin-fee, fund, settlement postings | Per finance stack | `New` |
| **Banking / EFT** | Provider and client settlement | Ugandan banks/EFT | `New` |
| **National scheme (NHIS)** | Top-up administration / connectivity readiness | Uganda's emerging National Health Insurance Scheme | `Verify` (OD-13) |

---

## 9. Phased Build Order

Sequenced so the offline-capable claims rail (our spearhead) and approval matrix land early, with revenue-critical finance and the loss-ratio analytics following.

**Phase 0 — Foundation**
Multi-client tenancy (§2); offline/sync scaffolding (§4) — service worker, local store, idempotency, sync engine skeleton; terminology engine multi-client (Module 2); immutable audit chain (Module 4) wired globally; exceptions + error-management + never-delete-rule frameworks (§6); approval-matrix engine (§3.1).

**Phase 1 — Membership + Provider + Claims core (offline-capable)**
Membership administration + import + family tree + NIRA validation (§5.2, §5.9); provider network + tariffs (§5.4); claims capture across channels with duplicate guard and bill lifecycle (§5.6); the active claims dashboard with incoming-claim alerts (§3.3); offline point-of-care client end-to-end (§4.2–§4.4).

**Phase 2 — Pre-auth + Copay + Adjudication**
Online pre-auth with GOP + escalation (§5.5); copay/co-contribution computation and enforcement (§5.7); auto-adjudication + auto-registration (§3.7); benefit-limit + shared-limit-group enforcement.

**Phase 3 — Finance + Reporting + Multi-currency**
Admin-fee invoicing/receipting, funds, debtors/creditors, allocation, payments (§5.8); multi-currency + FX + subsidiary consolidation (§3.5); core report catalogue + password-protected reports (§7); intelligent quotation (§5.3, if confirmed); IRA compliance-levy return (§1.1).

**Phase 4 — Fraud + Analytics + Member Experience**
PSHP→TPA-adapted fraud controls + provider scorecards + AI clinical auditing + shared-DB readiness (§5.11); strategic purchasing + loss-ratio analytics (§5.12); member app + USSD/SMS first-class + mobile-money rails + provider locator (§5.10); preventative-care/wellness (§5.16, if confirmed).

**Phase 5 — Integrations depth + Cross-border + Platform hardening**
Insurer/HMO core-system adaptors, GL/banking, NHIS readiness (§8); cross-border care coordination (§5.15, if confirmed); HA/DR/SIEM/perf-monitoring + full documentation deliverables (§6); broker statutory localisation (§5.13).

---

## 10. Open Decisions (for Mutuku)

Tracked in the corpus's open-decision style; resolve rather than assume.

| ID | Decision | Recommendation |
|---|---|---|
| OD-1 | Cloud host / data residency under Uganda DPPA 2019 — keep Supabase EU-Frankfurt or move in-region? | Confirm DPPA cross-border-transfer position before lock; default EU-Frankfurt only if compliant. |
| OD-2 | Does Medvec operate/front an HMO entity, or pure TPA? | Pure TPA for licensing simplicity; model HMO thresholds only if confirmed. |
| OD-3 | Ugandan tax/levy schedule (underwriting taxes, broker withholding, IRA-UG agent levy) | Obtain current IRA-UG/URA schedule; replace all Kenyan tax constants. |
| OD-4 | Self-funded scheme priority | In scope (employer-led market) — Phase 3. |
| OD-5 | Intelligent quotation module — defer or include? | Include, Phase 3. |
| OD-6 | NIRA + liveness SDK availability and commercial terms in Uganda | Verify NIRA API access and Smile Identity (or alternative) UG coverage. |
| OD-7 | MoMo/Airtel reversal + confirmation-message semantics in Uganda | Verify; carry the "fake-confirmation-not-reversal" fraud reframing if it holds. |
| OD-8 | Cross-border care coordination — in scope? | Phase 5, optional; gate on client demand. |
| OD-9 | Preventative-care/wellness depth | Phase 4+; minimum: funded checks + CDM protocols. |
| OD-10 | Multilingual depth (which languages beyond English) | Confirm; English baseline, add on client need. |
| OD-11 | Any client mandate for a Java app server (WebLogic, KCB R79)? | Resist; AiCare is Node/Next.js. Escalate if mandated. |
| OD-12 | IRA-Uganda regulatory export schemas | Obtain current IRA-UG return formats for the export tranche. |
| OD-13 | Uganda NHIS connectivity readiness | Monitor; build to a connectivity-ready posture, not a live integration, until scheme rules firm up. |
| OD-14 | Legal entity holding the IRA-UG TPA licence (Medvec vs. our co.) and brand identity | Confirm; drives the compliance register and default terminology/brand. |

---

## 11. Acceptance Criteria (capability level)

- **Offline:** a provider client offline for a full working day loses zero captured records; on reconnect all reconcile with correct final balances and a complete audit trail; over-commitments are flagged, never silently paid or dropped (§4).
- **Approval matrix:** every approvable action resolves to exactly one matrix path; no approval is possible outside the matrix; segregation of duties is enforced; every decision is audit-chained with the resolved matrix-version id (§3.1).
- **Claims dashboard:** any-channel claim raises an alert and lands in the correct queue within seconds (online) or seconds-of-sync (offline); every queue has a working SLA timer and escalation (§3.3).
- **Copay:** computed and enforced per client rules, percentage or flat, deducted at payment, reconciled and reported; offline-computed copays re-validate on sync (§5.7).
- **Multi-currency:** claims in any subsidiary currency are captured, adjudicated, copay-applied, approved on normalised bands, and paid in the correct currency; consolidated reporting reconciles to subsidiaries at in-force FX (§3.5).
- **Auto-adjudication:** clean claims auto-approve end-to-end; any gate failure routes to review with the failing gate named; criteria are client-configurable and versioned (§3.7).
- **Duplicate guard:** no double capture on same provider + service + member + date; invoice numbers unique per provider (§5.6).
- **Audit chain:** every sensitive operation (claim decision, pre-auth/GOP, limit override, commission change, endorsement, payment) is on the tamper-evident chain and verifiable (Module 4).
- **Compliance:** the admin-fee ledger reconciles to the IRA-UG fees-received return; the TPA compliance register tracks licence, deposit, directors, and renewals (§1.1).

## 12. Scope Exclusions (this specification)

- Underwriting of risk on our own balance sheet (we administer; we do not insure unless OD-2 changes this).
- A live Uganda NHIS integration (readiness only — OD-13).
- Java application-server deployment (architecture is Node/Next.js — OD-11).
- Final tax/levy constants, IRA-UG return schemas, and brand assets (pending OD-3/OD-12/OD-14).
- Native iOS/Android beyond the responsive PWA in early phases (carry the prior corpus's native-app deferral).

---

## Appendix A — Requirement Traceability (condensed)

**Medvec partner requirements (8):** fully mapped in §3.
**KCB practitioner punch-list (84 functionalities):** mapped across §3.3, §5.1–§5.8, §6, §7 (every R-item referenced in those sections).
**KCB Reports (19):** mapped in §7.
**Rensoft underwriting taxonomy:** mapped in §2.1, §5.3, §5.7.
**Research differentiators** (biometrics/identity, real-time EDI adjudication, AI auditing, FWA, mobile money, USSD/SMS, preventative care, cross-border, loss-ratio focus): mapped in §5.9–§5.16, §1.4.

## Appendix B — Uganda ⇄ Kenya delta (what changes from the Avenue corpus)

| Area | Kenya/Avenue | Uganda/Medvec |
|---|---|---|
| Regulator | IRA Kenya, SHA | IRA Uganda |
| Data protection | ODPC (Kenya DPA) | PDPO (Uganda DPPA 2019) |
| National identity | IPRS | NIRA |
| Mobile money | M-Pesa (Daraja) | MTN MoMo, Airtel Money |
| Connectivity assumption | Reliable, mobile-first | Intermittent — offline-first required |
| Risk posture | Tenant bears risk (PSHP) | We administer; clients bear risk (TPA) |
| Currency | KES single | Multi-currency (subsidiary clients) |
| Tax/levy constants | Stamp duty / training levy / PHCF | Ugandan equivalents (TBC) |
| Headline market problem | Competitive RFP differentiation | 109% loss-ratio crisis + concentration |

## Appendix C — Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | (draft) | Initial TPA-Uganda specification; reuses AiCare modules 1–5; absorbs KCB punch-list + Rensoft taxonomy; adds offline-first architecture, multi-client tenancy, multi-currency, approval matrix, and Uganda regulatory/identity/payment swaps. |
