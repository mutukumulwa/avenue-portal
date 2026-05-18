# AiCare — Gap Analysis & Antigravity Action Plan (Rensoft + KCB)

**Prepared:** 27 April 2026
**Scope:** Reconciling `Rensoft_Medical_System_Requirements_Doc.pdf` and `KCB_Medical_System_1.xlsx` against the AiCare Antigravity build specification, the Avenue Healthcare style guide, and prior project decisions. The fraud-detection research has already been processed into the build separately and is not revisited here.

> **Caveat on "what's built":** This treats "built" as "specified in the Antigravity build specification, Prisma schema, AGENTS.md, GEMINI.md, or already coded." Where I'm uncertain whether something is in the spec, I mark it **VERIFY** rather than asserting coverage either way. Every **VERIFY** item should be checked against the actual spec before being promoted to "Covered" or "Missing."

---

## 1. What each source gives us

### 1.1 Rensoft Requirements — the canonical operational shape

This 2017 document captures the standard Kenyan medical-insurance domain model. The structural ideas that matter:

- **Two client types**: Corporate (Scheme) and Individual. The data model has to support both natively, not as variants of one another.
- **Three-tier insured taxonomy**: Category → Family → Member. Categories share a product, covers, rates, and rule-of-calculation (e.g. Directors, Managers, Supervisors, Other Staff). Families are sized M, M+1, ..., M+7, and "More than M+7." Members are individual lives.
- **Two cover modes**:
  - **Insured** — premium-paying, traditional risk-bearing
  - **Self-Funded** — client deposits a fund, broker administers, admin fee charged either as flat-per-insured or % of claims paid
    Self-funded is critically different from insured: it has fund top-ups, installment alerts, and post-period reconciliation — not premium underwriting.
- **Cover hierarchy** with a specific Kenyan rider taxonomy (the IP-_ and OP-_ codes are not arbitrary — they're how brokers and insurers in this market communicate about what's covered):
  - **Inpatient riders**: IP-HIV, IP-DIALY, IP-EVAC, IP-CONG, IP-PC, IP-GYNA, IP-MAT, IP-OPTH, IP-PERNATL, IP-PHSP, IP-CA, IP-PSYC, IP-CS
  - **Outpatient riders**: OP-DNTL, OP-OPTC, OP-GYNA, OP-HIV, OP-CA, OP-CONG, OP-EVAC, OP-MAT, OP-MER, OP-PC, OP-PSYC, OP-VACC, OP-FUNERAL
- **Three taxes always**: Stamp Duty (KES 40 flat per policy), Training Levy (0.2% of basic premium), PHCF (0.25% of basic premium). Not optional — they appear on every debit note.
- **Medical cards** as a billable artifact: Smart vs. Photo, with fees applied to both insured and self-funded schemes.
- **Premium computation by lookup**: corporate premiums are matrixed by family size × cover limit; individual premiums are matrixed by age band × cover limit (with separate rows for Principal / Spouse / Child × age range). Rate tables are uploadable, versionable, and tied to a binder.
- **Authorization with exceptions**: every underwriting rule violation generates an exception, and exceptions can be approved before authorization. This is a pattern, not a single feature.

### 1.2 KCB Punch-List — the "everything you forgot" layer

This is a working file from a real implementation team. Its value isn't strategic — it surfaces **the operational realities of running this kind of system in production** that requirements documents tend to skip:

- Cross-cutting infra: SIEM export, log retention/archival, single-session control, helpdesk tooling, performance monitoring, weblogic-grade deployment, redundant design, HA/DR documentation, patch documentation, password policies + email-reset, 2FA, password-protected reports
- Workflow ergonomics: maker-checker at binder level, escalations on unactioned pre-auths, progress bars on long binder creation, % completion reporting on in-flight products
- Member-management edge cases: transfer between schemes, category change within a policy, smart-card replacement _with_ billing, family-tree visualization, member history surfaced at claim capture, member utilization auto-notifications, renewal notices + SMS
- Anti-abuse at the data-entry layer: enforce uniqueness on (provider, service, member, date) tuples; require unique invoice numbers per provider; agreed-upon rate column visible at claim level
- Reports: 19 distinct reports listed plus several more scattered in the system-functionalities sheet — this is the explicit reporting backlog
- Process patterns: rules with activate/deactivate timeframes (never delete), exception engine, jobs scheduling screen, customizable dashboards, letters and memos, importation framework

KCB items that already appear to align with the AiCare spec (per memory): endorsements, excel-uploadable pricing references, biometric saving from SMART, claims importation, automated provider statement reconciliation. **These need spec-level confirmation but appear conceptually covered.**

---

## 2. Strategic insights to treat as load-bearing

Before the gap matrix, four things that should change how the build proceeds:

**S1. The Rensoft data model is more granular than the current AiCare schema (likely).** Specifically: the Category → Family → Member hierarchy with M+N family sizes; Insured vs. Self-Funded as a first-class cover mode (with fund management on top); the IP-/OP- rider taxonomy; the per-tax line items on debit notes; rate-table-by-binder versioning. **VERIFY** what the current Prisma schema models here — if it's modeling members as a flat list under a policy, that's a structural gap that breaks every premium lookup, every limit application, and every endorsement at scale.

**S2. The "never delete rules — activate/deactivate with timeframes" pattern from KCB is a system-wide convention.** This applies to underwriting rules, claim adjudication rules, escalation rules, approval matrices — anywhere business logic is configurable. It means rule entities need `effectiveFrom`, `effectiveTo`, `isActive`, and audit history rather than hard deletes. Worth a line in AGENTS.md if it isn't already there.

**S3. Double-capture prevention is a hard database constraint, not a soft check.** KCB explicitly calls out the four-tuple (provider, service, member, date) as the uniqueness constraint, plus invoice-number uniqueness per provider. These should be enforced at the schema level (composite unique indexes), not at the application layer where they can be bypassed.

**S4. Self-funded schemes need their own lifecycle, not shared screens with insured schemes.** Fund deposit, installment scheduling, top-up alerts, fund-balance ledger, fund-admin-fee invoicing (with two distinct calc methods: flat-per-insured at policy start, or %-of-claims-paid at policy end) — these are operationally distinct from premium underwriting. Treating them as variants of the insured flow will produce a confusing UI.

---

## 3. Gap Analysis Matrix

Status legend:

- **Covered** — present in the spec and aligned with the source requirement
- **Partial** — concept exists but the source document expects more
- **Missing** — not in the current spec
- **Verify** — uncertain from memory; check the actual build spec

### 3.1 Underwriting & Membership Domain

| Capability                                                                                                            | Source                 | Status               | Notes                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Corporate (Scheme) and Individual client types                                                                        | Rensoft 1.1            | **Verify**           | Confirm Prisma `Client` model supports both natively                                                                         |
| Policy with full attribute set (product, insurer, period, payment mode/freq, branch, division, currency, beneficiary) | Rensoft 1.2            | **Verify**           | Confirm `Policy` (or `Membership`) model has all fields including division and branch                                        |
| Category → Family → Member taxonomy                                                                                   | Rensoft 1.3            | **Partial / Verify** | If schema is flat, this is a structural gap                                                                                  |
| Family sizes M through M+7 plus "More than M+7"                                                                       | Rensoft 1.3            | **Verify**           | Critical for premium lookup — confirm enum/lookup table exists                                                               |
| Family tree visualization                                                                                             | KCB                    | **Missing**          | UI component, not currently called out                                                                                       |
| IP-_ and OP-_ rider taxonomy (full Kenyan list)                                                                       | Rensoft 1.4            | **Verify**           | Confirm `BenefitRider` / `Cover` seed data includes all 27 standard riders                                                   |
| Insured Cover mode (premium-bearing)                                                                                  | Rensoft 1.4(a)         | **Verify**           | Likely covered; confirm                                                                                                      |
| Self-Funded Cover mode (fund-deposit, broker-admin)                                                                   | Rensoft 1.4(b), 1.8(b) | **Partial / Verify** | Different lifecycle from insured; likely a gap                                                                               |
| Per-family vs. per-member benefit limits                                                                              | Rensoft 1.5            | **Verify**           | Configurability at limit-application level                                                                                   |
| Copayment (% or flat) tied to specific covers                                                                         | Rensoft 1.5            | **Verify**           |                                                                                                                              |
| Policy clauses + limits of liability                                                                                  | Rensoft 1.6            | **Verify**           |                                                                                                                              |
| Stamp Duty / Training Levy / PHCF tax computation                                                                     | Rensoft 1.7            | **Missing / Verify** | Confirm these three specific Kenyan taxes are wired into the debit-note pipeline                                             |
| Medical cards (Smart/Photo) issuance                                                                                  | Rensoft 1.7, KCB       | **Partial**          | Memory says "biometric saving from SMART"; confirm the full lifecycle (issue/replace/bill)                                   |
| **Smart card replacement workflow with billing**                                                                      | KCB                    | **Missing**          | Lost-card replacement is a specific flow with its own fee                                                                    |
| Premium rate table (corporate: family-size × limit)                                                                   | Rensoft 1.8(a)         | **Verify**           | Memory says uploadable Excel pricing exists — confirm this matches the matrix shape                                          |
| Premium rate table (individual: age × limit, principal/spouse/child rows)                                             | Rensoft 1.8(a)         | **Verify**           | Same as above                                                                                                                |
| Fund management screen (deposit, top-up, installment date, admin fee)                                                 | Rensoft 1.8(b)         | **Missing / Verify** | Self-funded scheme management — separate UI from premium-bearing                                                             |
| Admin fee calc: flat-per-insured OR %-of-claims-paid                                                                  | Rensoft 1.8(b)         | **Missing / Verify** | The %-based variant requires post-period computation                                                                         |
| Policy authorization with exception-approval gate                                                                     | Rensoft 1.9            | **Verify**           | Generic "approval" likely exists; the specific "exception-when-rule-violated, approve-to-proceed" pattern needs confirmation |
| Endorsements (member add/delete, category change, cancel/reinstate)                                                   | KCB                    | **Covered**          | Per memory, this is one of the highest-priority modules already specified                                                    |
| Member transfer between schemes                                                                                       | KCB                    | **Missing / Verify** | Cross-policy member movement                                                                                                 |
| Category transfer within a policy                                                                                     | KCB                    | **Missing / Verify** | Different from member-transfer; member moves from "Other Staff" to "Managers"                                                |
| Member creation: popup, import, external-system spool                                                                 | KCB                    | **Partial**          | Excel import for membership is mentioned in memory; confirm popup + external-spool both exist                                |
| Medical renewal (renewal notices + SMS)                                                                               | KCB                    | **Verify**           |                                                                                                                              |
| Receipting for medical policies                                                                                       | KCB                    | **Verify**           |                                                                                                                              |
| Letters and memos functionality                                                                                       | KCB                    | **Missing / Verify** | Templated correspondence to clients/members                                                                                  |
| Member utilization notifications (auto)                                                                               | KCB                    | **Verify**           | Member SMS/email when limit thresholds crossed                                                                               |

### 3.2 Quotation & Pricing Domain

| Capability                                                                       | Source               | Status               | Notes                                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Quoting accessible to admin and broker users                                     | Project memory       | **Covered**          | Already specified                                                                                                          |
| Excel-uploadable rate tables                                                     | Project memory + KCB | **Covered**          | Already in spec                                                                                                            |
| Python-uploadable pricing models                                                 | Project memory       | **Verify**           | Memory says yes; confirm sandboxing approach                                                                               |
| Rate-card binder-level versioning                                                | KCB                  | **Missing / Verify** | Rates tied to a binder, with effective dates, never deleted (KCB rule: never delete — activate/deactivate with timeframes) |
| Intelligent quotation module (auto-suggest cover/limits based on client profile) | KCB                  | **Missing**          | Likely v2 — flag and defer                                                                                                 |
| Agreed-upon rate column at claim level                                           | KCB                  | **Missing / Verify** | Show contracted rate vs. billed amount when a claim hits — variance detection                                              |

### 3.3 Claims, Adjudication & Pre-Authorization Domain

| Capability                                                              | Source               | Status               | Notes                                                            |
| ----------------------------------------------------------------------- | -------------------- | -------------------- | ---------------------------------------------------------------- |
| Pre-authorization lifecycle                                             | Project memory       | **Covered**          | Already specified as priority module                             |
| Claims adjudication workflow                                            | Project memory       | **Covered**          | Already specified                                                |
| Bill state machine: incurred → received → captured → authorized → paid  | KCB                  | **Verify**           | Confirm the explicit state machine exists with these transitions |
| Smart claims capture (SMART integration)                                | KCB + Project memory | **Covered**          | SMART integration is in scope                                    |
| Slade360 EDI integration                                                | Project memory       | **Covered**          |                                                                  |
| HMS (HL7 FHIR) integration                                              | Project memory       | **Covered**          |                                                                  |
| SHA integration                                                         | Project memory       | **Covered**          |                                                                  |
| Excel claims importation                                                | KCB                  | **Verify**           | Confirm UI + parser exists                                       |
| **Double-capture prevention rule** (provider + service + member + date) | KCB                  | **Missing**          | Hard DB constraint, not a soft check                             |
| **Unique invoice number per provider**                                  | KCB                  | **Missing**          | Composite uniqueness on `provider_id` + `invoice_number`         |
| Email alerts on pre-auth submission/decision                            | KCB                  | **Verify**           |                                                                  |
| **Pre-auth escalation to manager on inaction**                          | KCB                  | **Missing**          | Time-bound escalation engine — needs BullMQ scheduled jobs       |
| Member history link surfaced at claim capture                           | KCB                  | **Verify**           | UX detail — confirm                                              |
| Members' limits and validity monitoring                                 | KCB                  | **Verify**           | Real-time limit ledger                                           |
| Approval matrix configurability                                         | KCB                  | **Verify**           | Different claim values → different approver chains               |
| Vetting process documentation + workflow                                | KCB                  | **Verify**           |                                                                  |
| Provider statement automated reconciliation                             | KCB + Project memory | **Verify**           | Memory suggests this exists; confirm                             |
| Case management screens                                                 | KCB                  | **Missing / Verify** | Long-running case files for complex/disputed claims              |
| Reimbursement workflow (member-paid claims)                             | KCB                  | **Verify**           | Distinct from provider-paid                                      |

### 3.4 Financial / Payments Domain

| Capability                                                        | Source        | Status               | Notes                                                      |
| ----------------------------------------------------------------- | ------------- | -------------------- | ---------------------------------------------------------- |
| Fund deposit and top-up receipting                                | Rensoft + KCB | **Missing / Verify** | Self-funded scheme cash-flow                               |
| Payment update with cheque/EFT details                            | KCB           | **Verify**           |                                                            |
| Fund admin fee invoicing & receipting                             | KCB + Rensoft | **Missing / Verify** | Both calc methods                                          |
| Commissions, card fees, taxes capture on debit notes              | KCB + Rensoft | **Verify**           |                                                            |
| Debtors / creditors ledger (insurer or client)                    | KCB           | **Missing / Verify** |                                                            |
| Requisition raising                                               | KCB           | **Missing / Verify** | Internal-spend requisition (not claims)                    |
| Bill workflow: incurred → received → captured → authorized → paid | KCB           | **Verify**           | Same state machine as in 3.3 — verify both surfaces use it |

### 3.5 Reporting & Analytics Domain

The KCB list provides a 19-report backlog plus several more in the System Functionalities sheet. Most are likely **Missing** as named reports — they require specific schemas and aggregation pipelines.

| Report                                         | Status      | Notes                                                 |
| ---------------------------------------------- | ----------- | ----------------------------------------------------- |
| Claims experience (per scheme/category)        | **Missing** | Loss ratios, paid/incurred, by member/family/category |
| Exceeded limits                                | **Missing** |                                                       |
| Loss ratio                                     | **Missing** |                                                       |
| Fund utilization (self-funded)                 | **Missing** |                                                       |
| Admin fee statement                            | **Missing** |                                                       |
| Ageing analysis                                | **Missing** |                                                       |
| Outstanding bills                              | **Missing** |                                                       |
| Membership lists                               | **Verify**  |                                                       |
| Case management report                         | **Missing** |                                                       |
| Organic growth                                 | **Missing** |                                                       |
| Provider statements                            | **Verify**  |                                                       |
| Commission statements                          | **Missing** |                                                       |
| Fees statements                                | **Missing** |                                                       |
| Levies and taxes statements                    | **Missing** |                                                       |
| Debtors and creditors                          | **Missing** |                                                       |
| Financial analysis / general financial reports | **Missing** |                                                       |
| Exclusion and rejected claims                  | **Missing** |                                                       |
| Admissions list                                | **Missing** |                                                       |
| Admission visits                               | **Missing** |                                                       |
| Statement to members                           | **Missing** |                                                       |
| Claims-per-user (operator)                     | **Missing** |                                                       |
| User rights/roles report                       | **Missing** |                                                       |
| Completed-vs-in-progress products report       | **Missing** |                                                       |
| Comparison report on services                  | **Missing** |                                                       |
| Debtors listing per category                   | **Missing** |                                                       |

### 3.6 Cross-Cutting / System Domain

| Capability                                                                   | Source         | Status               | Notes                                                         |
| ---------------------------------------------------------------------------- | -------------- | -------------------- | ------------------------------------------------------------- |
| Audit trail (logs)                                                           | Project memory | **Verify**           |                                                               |
| Audit trail **reports** (queryable, not just log files)                      | KCB            | **Missing / Verify** |                                                               |
| Customizable user dashboards                                                 | KCB            | **Missing**          | Per-role + per-user widget config                             |
| Exceptions engine (rules with activate/deactivate timeframes — never delete) | KCB            | **Verify**           | Critical pattern; confirm rules-engine respects this          |
| Error message catalog                                                        | KCB            | **Missing / Verify** |                                                               |
| Job scheduling UI (BullMQ admin)                                             | KCB            | **Missing**          | BullMQ is in stack; admin UI for scheduling/monitoring jobs   |
| Workflow customization (approval matrices)                                   | KCB            | **Verify**           |                                                               |
| Multi-currency                                                               | KCB            | **Verify**           |                                                               |
| Multi-lingual                                                                | KCB            | **Missing**          | i18n scaffolding — Swahili/English minimum                    |
| Online help                                                                  | KCB            | **Missing**          |                                                               |
| Helpdesk tool                                                                | KCB            | **Missing**          |                                                               |
| 2FA                                                                          | KCB            | **Missing / Verify** |                                                               |
| Password policies + reset code via email                                     | KCB            | **Verify**           |                                                               |
| Single-session control (parameterized)                                       | KCB            | **Missing**          | Concurrent-session lockout                                    |
| User rights/roles report                                                     | KCB            | **Missing**          | RBAC introspection report                                     |
| Authorized-access notification (login banner)                                | KCB            | **Missing**          |                                                               |
| Maker-checker at binder level                                                | KCB            | **Missing / Verify** | Two-person rule on binder creation                            |
| Progress bar on long binder creation                                         | KCB            | **Missing**          | UX polish but explicitly requested                            |
| % completion report on in-flight products                                    | KCB            | **Missing**          |                                                               |
| Importation framework (members, claims, rates)                               | KCB            | **Partial**          | Some importers exist per memory; consolidate into a framework |
| SIEM-compatible log export                                                   | KCB            | **Missing**          |                                                               |
| Log file fields: Date / Time / Event / IP / User                             | KCB            | **Verify**           |                                                               |
| Log retention/archival policy                                                | KCB            | **Missing**          |                                                               |
| Production change logs                                                       | KCB            | **Missing**          |                                                               |
| HA documentation                                                             | KCB            | **Missing**          |                                                               |
| DR documentation                                                             | KCB            | **Missing**          |                                                               |
| Data dictionary                                                              | KCB            | **Missing**          | Auto-generate from Prisma schema                              |
| Performance monitoring                                                       | KCB            | **Verify**           | Likely OpenTelemetry or similar in spec                       |
| Password-protected reports                                                   | KCB            | **Missing**          | PDF reports with passwords                                    |

---

## 4. Action Plan for Antigravity

### 4.1 Pre-flight (do before starting any new phase work)

**P-1. Spec verification pass.** Walk every **Verify** row above against the actual Antigravity build spec and Prisma schema. Convert each to either **Covered** or **Missing**. Half a day of focused reading. Output: an updated copy of this matrix where everything is binary.

**P-2. Confirm the data model handles Category → Family → Member.** This is the single highest structural risk. If `Membership` is currently a flat list of members tied to a `Policy`, we need a refactor before claims-adjudication work proceeds, because every limit, every premium lookup, and every endorsement hinges on the family-level grouping. One-hour Prisma audit.

**P-3. Confirm Insured vs. Self-Funded as first-class cover modes.** If self-funded is currently modeled as "insured cover with weird fields," refactor to a discriminated union. The fund lifecycle is genuinely different from premium underwriting.

### 4.2 Insertions into existing phases

These slot into phases that almost certainly already exist in the build order.

**Into the Schema/Foundation phase:**

- Add `BenefitRider` seed data with the full IP-_ and OP-_ taxonomy from Rensoft §1.4 (27 riders)
- Add `FamilySize` lookup (M, M+1, ..., M+7, M+7+)
- Add `Tax` lookup with Stamp Duty (KES 40 flat), Training Levy (0.2%), PHCF (0.25%) wired to the debit-note generator
- Add `ContractedRate` model for per-provider, per-service rates so the agreed-rate-vs-billed-rate variance is computable
- Add `effectiveFrom` / `effectiveTo` / `isActive` pattern to all rule and rate entities (the "never delete" KCB rule)
- Composite unique indexes: `(provider_id, service_code, member_id, service_date)` on claims; `(provider_id, invoice_number)` on claim invoices

**Into the Underwriting/Membership phase:**

- Smart-card replacement workflow with billing
- Letters and memos templated correspondence
- Member transfer between schemes
- Category transfer within a policy
- Member utilization auto-notifications
- Renewal notice + SMS
- Family-tree visualization

**Into the Quotation phase:**

- Rate-card binder-level versioning with effective dates and never-delete semantics
- Agreed-upon rate column wiring (data exists from `ContractedRate`; surface in quote + claim views)

**Into the Claims/Adjudication phase:**

- **Double-capture prevention** as DB constraint (already added in schema)
- **Unique invoice number per provider** as DB constraint (already added in schema)
- Bill state machine explicitly modeled: `INCURRED` → `RECEIVED` → `CAPTURED` → `AUTHORIZED` → `PAID` (or `REJECTED`)
- Pre-auth escalation engine (BullMQ scheduled job: if `Authorization` in `PENDING` past `escalation_threshold` → notify next-level approver)
- Member history surfaced in claim-capture UI
- Approval-matrix configurability (claim value × claim type → approver chain)
- Reimbursement workflow (member-paid → reimbursement) as distinct from provider-paid
- Case management screens for long-running disputes

**Into the Pre-Auth phase:**

- Email alerts on submission/decision
- Member history link in pre-auth view (same component as claim view)

**Into the Endorsements phase:**

- Verify all KCB-listed endorsement types are covered (member add/delete, category change, cancel/reinstate cover, scheme transfer)

**Into the Financial / Payments phase (if it exists; otherwise create one):**

- Fund management UI (self-funded schemes): deposit, top-up, installment schedule, balance, alerts
- Fund admin fee invoicing & receipting (both calc methods: flat-per-insured and %-of-claims-paid post-period)
- Cheque/EFT payment update flow
- Debtors/creditors ledger
- Internal requisition raising

### 4.3 New phases to add to the build order

Two new phases are justified by the volume of work in Reporting and Cross-Cutting Hardening.

#### **NEW PHASE — Reporting & Analytics**

Goal: deliver the named-report backlog from KCB plus the Avenue-specific operational reports.

Approach:

- Build a reusable report-spec abstraction (parameter set, query template, output formats: PDF/Excel/CSV)
- Layer on password-protected PDF for sensitive reports (KCB requirement)
- Implement reports in three tranches:
  - **Tranche 1 (operational, blocks go-live)**: Membership lists, Outstanding bills, Provider statements, Member statements, Exceeded limits, Admissions list, Admission visits
  - **Tranche 2 (financial)**: Loss ratio, Claims experience, Ageing analysis, Debtors/creditors, Commission statements, Fees statements, Levies and taxes, Fund utilization, Admin fee statement
  - **Tranche 3 (analytical)**: Organic growth, Comparison report on services, Exclusion and rejected claims, Case management, Claims-per-user, User rights/roles, Completed-vs-in-progress products

Estimated effort: 3-4 weeks for all three tranches; only Tranche 1 blocks go-live.

#### **NEW PHASE — Cross-Cutting Hardening**

Most of these are infra/security/UX items that don't justify their own large phase but collectively matter for production readiness. Run in parallel with later domain phases.

Scope:

- 2FA (TOTP)
- Password policies + email-based reset code
- Single-session-control parameter
- SIEM-compatible log export (JSON to S3 or syslog)
- Log retention/archival policy
- Job scheduling UI (BullMQ admin dashboard — bullmq-board or bespoke)
- Customizable user dashboards (saved widget configs per user)
- Maker-checker at binder level (two-person creation)
- Multi-lingual scaffolding (i18n; Swahili/English minimum for Avenue)
- Online help + helpdesk tool integration
- Production change log
- HA/DR documentation
- Data dictionary (auto-generate from Prisma schema)
- Authorized-access login banner
- User rights/roles report
- Password-protected report exports

Estimated effort: 2-3 weeks if parallelized across the build, longer if done as a dedicated sprint.

---

## 5. Open decisions for Mutuku

**D1. Self-funded scheme priority.** Avenue uses flat-rate pricing per project memory; self-funded schemes are more relevant for AiCare's white-label clients. Should self-funded be Phase-1 functionality or held until a non-Avenue client commits? **Recommendation:** build the data model now (cheap), build the fund-management UI later when needed.

**D2. Reports prioritization.** The 25-report backlog is large. Tranche 1 (7 reports) is the operational minimum for go-live. Confirm Tranche 1 contents match what Avenue stakeholders actually want to see day-one.

**D3. Multi-lingual depth.** Full Swahili UI, or just member-facing communications (SMS, letters, statements)? The first is meaningfully more work.

**D4. Intelligent quotation module.** KCB lists this but it's vague. Defer to v2 unless Avenue has a specific shape in mind.

**D5. Case management surface.** Is "case management" the same thing as the dispute/escalation flow on a claim, or is it a parallel UI for long-running clinical-care coordination? Different scope of work.

**D6. Two-person maker-checker scope.** KCB lists it "at the binder level" — does this extend to other high-impact actions (rate-table uploads, approval matrix changes, mass endorsements)? Recommendation: yes, generalize to all high-impact admin actions.

---

## 6. Concrete next steps

If this plan is broadly right:

1. **Half-day**: Spec-verification pass (P-1). Convert every **Verify** row above into binary Covered/Missing.
2. **One hour**: Schema audit for Category → Family → Member and Insured-vs-Self-Funded (P-2, P-3). Refactor before more claims work lands.
3. **Decisions**: Mutuku resolves D1-D6.
4. **Phase planning**: With the verified gap matrix and decisions, update the Antigravity build-order plan to absorb the §4.2 insertions and add the two new phases from §4.3.
5. **Schema additions are a single PR**: BenefitRider seed, FamilySize, three Kenyan taxes, ContractedRate, never-delete pattern fields, double-capture and invoice-number composite indexes. Land this early — everything downstream depends on it.

After P-1, P-2, P-3 are done and D1-D6 are resolved, this becomes the working plan rather than a draft.
