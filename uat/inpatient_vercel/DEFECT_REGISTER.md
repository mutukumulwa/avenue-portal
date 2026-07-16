# Inpatient E2E UAT — Defect Register (Vercel)

Front-end, Chrome, actors as themselves, no DB edits. Target https://avenue-portal.vercel.app.
Severity: Critical = security exposure / unbounded financial leakage / data loss / core path dead. High = control fails open, workflow class unusable, records stuck. Medium = dead-end w/ workaround, validation gap, swallowed error. Low = cosmetic.

| ID | Sev | Area | Persona | Summary | Re-test |
|----|-----|------|---------|---------|---------|
| **IP-DEF-06** | **Critical** | Claim decision / benefit | Claims/adjudicator | **Member annual benefit sub-limit is NOT enforced at adjudication.** A claim for a member with **0 remaining inpatient benefit was approved in full (130,000), member liability 0**, pushing usage 130,000 **over** the 25,000,000 annual sub-limit. No cap, no member-liability split, no block, no override. | OPEN |
| IP-DEF-01 | High | PA adjudication | Medical reviewer | Entering the optional **Notes** on Stage-2 PA approval crashes the approval with a **raw Prisma error leaked to the UI** (writes unknown `reviewNotes` column). Empty note works. | OPEN |
| IP-DEF-02 | High | Case accrual | Claims/medical | Service entry dated in the **future / after discharge** is accepted with no validation and accrues into the billable case total (IP-B06). | OPEN |
| IP-DEF-03 | High | Approvals + Settlement | Underwriter/Finance | **HTTP 503 on POST mutations** across /approvals and /settlement. Intermittent: approval L1/L2 eventually landed on retry, but the **settlement checker-approval never completed this session** (batch stuck MAKER SUBMITTED after ~5 clean retries) → claim could not reach PAID. Also the lists don't refresh after a landed mutation. | OPEN |
| IP-OBS-DUAL | Finding | Approval matrix | Admin | INPATIENT ≥200k rule = **Underwriter / DUAL**, but tenant had only **one** UNDERWRITER → dual approval unsatisfiable (L2 deadlocks). Worked around (user-authorized) by elevating cs@medvex.co.ug to a 2nd underwriter; chain then completed. A DUAL rule needs ≥2 active role-holders; no in-app guard warns. | WORKED-AROUND |
| IP-DEF-04 | Medium | Bed-day pricing | Claims | **No automated ward/ICU bed-day overlap guard** (IP-C02): a ward bed and an ICU bed on the **same date** both price as payable with no rule/warning; relies entirely on the adjudicator noticing. §7 Critical-class ("bed charges double-pay overlapping days without a rule") — held Medium as adjudicator can reject manually + tested only on a tariff-only provider (no digital contract to enforce bundling). | OPEN |
| IP-DEF-05 | Medium | HMS batch intake | Provider/HMS | HMS batch **error surfacing**: a malformed batch (missing/invalid `facilityCode`, bad JSON, unknown facility) throws and renders a **generic "Application error… server-side exception"** page (Digest 4145388135) instead of the friendly validation message the service actually produces. Money logic is safe (below); this is error-handling/UX. | OPEN |
| IP-GAP-HMS | Gap | HMS facilityCode discoverability | Provider/HMS | The HMS batch `facilityCode` resolves to Provider **id** (a cuid, never shown in UI), exact **name**, or **smartProviderId** — but `smartProviderId` is **null for all 195 providers** and there is **no `Provider.code`** column (the in-code example "AGA-001" is misleading). So the only usable value is the exact provider display name, which is undocumented, unlabelled, and fragile (renames break feeds). **An HMS integrator cannot discover their facilityCode from the front end.** | OPEN — surface a labelled "HMS facility code" on the provider/HMS-integration screen |

---

## IP-DEF-01 — Optional approval Notes crashes inpatient PA approval with raw Prisma error leak
- **Severity:** High (raw internal-error/schema disclosure on adjudication = Critical-class behavior per §7; mitigated to High by an obvious workaround — leave Notes empty — and no financial side effect).
- **Persona:** Medical reviewer (medical@medvex.co.ug, Dr Sarah Achieng).
- **Route:** /preauth/[id] → Stage 2 — Final Adjudication.
- **Repro:**
  1. Open an inpatient PA (PA-2026-00005), Send for Medical Review, Stage 2 appears.
  2. Decision = Approve (Full), Validity 30, **type any text into "Notes (optional)"**, Submit Approval.
- **Observed:** Approval fails; the page renders the full raw error:
  `Invalid prisma.preAuthorization.update() invocation … data: { … reviewNotes: "…" … } Unknown argument reviewNotes. Available options are marked with ?` — followed by the **entire PreAuthorization Prisma schema** (all fields + relations) dumped to the browser.
- **Expected:** Approval succeeds and the reviewer note is persisted; on any server error, a friendly message — never a raw Prisma invocation + schema.
- **Confirmed reproducible:** Re-submitting the SAME decision with an EMPTY Notes field succeeded (PA → APPROVED, hold placed). So the crash is triggered specifically by populating the optional Notes field; the reviewer-notes control is effectively unusable and its content is silently dropped even on the success path.
- **Impact:** (1) Information disclosure — internal DB model/relations exposed to any reviewer. (2) The documented "Notes to provider" control on PA approval cannot be used. (3) Confusing failure that looks like data loss.
- **Evidence:** ss_3047x4pg8 (submitting), page-text capture of raw Prisma error (2026-07-07 18:30Z), ss_0016u1nzi (error banner), ss_44244i2ff (success after empty-note retry).
- **Fix pointer:** the PA-approve server action includes `reviewNotes` in `preAuthorization.update({data})`; model has no such field (has `declineNotes`). Either add the column or map notes → the correct field / activity log, and wrap the action in a try/catch returning a sanitized error.

---

## IP-DEF-02 — Future / post-discharge service entry accepted onto case with no date validation
- **Severity:** High (per §7 "future service … creates payable money" is Critical-class; held at High pending confirmation that such a line can actually be *paid* downstream — escalate to Critical if adjudication pays it).
- **Persona:** Claims/medical (medical@medvex.co.ug) on CASE-2026-00001.
- **Route:** /cases/[id] → Add service entry.
- **Repro:** On an open inpatient case (admission 2026-07-02, expected discharge 2026-07-07), add a service entry dated **2026-08-01** (after discharge AND after today 2026-07-07), amount 999,000, Add.
- **Observed:** Entry accepted with no warning; ACCRUED rose 1,650,000 → 2,649,000. The out-of-window line becomes part of the billable case total that files into the claim.
- **Expected (IP-B06):** Blocked or routed as an exception; no financial side effect; service dates constrained to the admission window / not in the future.
- **Note:** Voiding the entry correctly removed it (accrued back to 1,650,000) — so the void control works (IP-B07 PASS); the gap is purely the missing forward-date validation on entry.
- **Evidence:** ss_051323a27 (future entry accepted, accrued 2,649,000), ss_3178uws8j (voided, back to 1,650,000).

## IP-DEF-03 / IP-OBS-DUAL — Multi-level approval: 503 + stale UI, and dual-underwriter deadlock
- **Positive controls CONFIRMED (not defects):** (a) Claim decision above matrix threshold routes to the Approvals console instead of self-applying; (b) the **maker** (medical who submitted) cannot approve L1; (c) super-admin does not satisfy the UNDERWRITER role gate; (d) the **same underwriter cannot do both L1 and L2** ("You have already decided on this request") — distinct-approver-per-level SoD holds.
- **IP-DEF-03 (Medium):** every "Approve Ln" POST to /approvals returns **HTTP 503**, yet the underlying approval is recorded; the list does not refresh (still showed L1 after a successful L1 approval until a hard reload). Operators would think approval failed and may re-click. Confirm whether 503 is a Vercel function timeout or an unhandled server path.
- **IP-OBS-DUAL (Finding):** matrix rule "INPATIENT ≥ UGX 200,000 → Underwriter / DUAL" cannot be completed because only one UNDERWRITER user (Faith Muthoni) exists; L2 needs a *distinct* underwriter. Real inpatient claims ≥200k are therefore un-approvable until a 2nd underwriter is added. Recommend either a config-time guard ("DUAL requires ≥2 active users with role X") or a documented go-live checklist item.
- **Evidence:** approvals network trace (POST 503; GET `?error=You have already decided on this request`), ss_1575idt1v, approval-matrix page text.

## Money-spine completion (2026-07-07, after 2nd underwriter provisioned)
- **Claim CLM-2026-00289 → APPROVED at UGX 1,300,000** (contract-capped payer share; billed 1,650,000; ward write-off 350,000; copay 0) via **dual underwriter** approval — L1 Faith Muthoni, L2 David Kipchoge (distinct). PA-2026-00005 consumed on approval (claim now shows 0 attached PAs; hold→utilisation).
- **Settlement batch created (finance maker):** Nakasero Hospital · Jul 2026 · **1 claim · UGX 1,300,000** — picked up ONLY the approved payer share (IP-J01/J02 PASS; exclusions omitted).
- **IP-J03 SoD PASS:** finance maker self-approval blocked — *"Maker and checker must be different users."*
- **Mark-Paid COMPLETED (2026-07-08):** on retry, finance-checker Approve then **Mark Paid** both landed (each POST returned 503 but the mutation succeeded — confirms IP-DEF-03). Batch → **SETTLED** (settled 08/07/2026). IP-J03/J04 PASS.
- **GL settlement journal POSTED & balanced (IP-J07 PASS):** after Mark-Paid the trial balance moved from 7,706,180 → **9,006,180 (still ✓ Balanced)**; **Cash at Bank credit +1,300,000** and **Claims Payable debit +1,300,000** — i.e. **Dr Claims Payable 1,300,000 / Cr Cash 1,300,000**, exact.
- **TIE-OUT (this admission): approved 1,300,000 = settlement batch 1,300,000 = settled/paid 1,300,000 = GL settlement journal 1,300,000.** ✅
- **RBAC:** finance-officer role gets Access Denied on the claim detail route (no claims read) — scope holds.
- **OBS-IP-GL (new):** Claims Payable (2010) carries a large net **debit** balance (debit 4,619,980 vs credit 1,491,200) — settlements debit it but the approval-time accrual credit appears under-posted; investigate whether claim *approval* posts Dr Claims Incurred / Cr Claims Payable. Trial balance still balances (each journal internally balanced), so not "unbalanced GL", but the payable account looks mis-accrued. Also GL is **KES-labelled** while amounts are UGX (OBS-IP-CUR).

## HMS daily-batch rail — VERIFIED SOLID (money logic)
Using the correct `facilityCode` = exact provider name "Nakasero Hospital" (discovered from source `hms-batch.service.ts` + DB, see IP-GAP-HMS), on open CASE-2026-00003:
- **IP-H05 valid feed appends (PASS):** batch "1 applied · 0 duplicate · 1 unmatched" → case accrued UGX 75,000, source HMS_BATCH.
- **IP-H06 unmatched → exception (PASS):** the bogus `CASE-9999-00000` line did not post; it created an `ExceptionLog` (HMS_BATCH_UNMATCHED), and the valid line still processed (per-line, not all-or-nothing). Reviewable, never lost.
- **IP-H07 / B08 duplicate replay idempotent (PASS):** re-posting the identical batch → "0 applied · **1 duplicate** · 1 unmatched"; **case stayed at exactly 1 entry / UGX 75,000 (not doubled)**. DB verified: 1 CaseServiceEntry (75,000), 2 unmatched exceptions (one per submission). **Duplicate HMS replay creates no new money** — §7 Critical trigger NOT violated.

## IP-DEF-06 — Benefit annual sub-limit not enforced at claim decision (CRITICAL)
- **Severity:** Critical (§7: "PA/LOU/**benefit** ceiling can be exceeded without authorised approval/override"). Unbounded financial leakage — the payer pays past a member's contracted annual benefit ceiling and the excess is never assigned to the member.
- **Setup (member-scoped, reversible DB seed, since reverted):** set member Mark Kato's INPATIENT `BenefitUsage.amountUsed` = 25,000,000 = the INPATIENT `BenefitConfig.annualSubLimit` (available = 0).
- **Repro:** open case → 1 line 130,000 → close/file (CLM-2026-00293) → Mark as Captured → Submit Decision (Approve, 130,000).
- **Observed (DB-verified):** claim APPROVED at **130,000 in full**, `memberLiability` = **0**; member's inpatient `amountUsed` went 25,000,000 → **25,130,000** (130,000 **over** the 25,000,000 annual sub-limit). The adjudication form even **defaulted Approved Amount to the full billed** with no benefit-remaining ceiling shown.
- **Expected (IP-C07/F08):** approved payer share capped at the remaining benefit (0 here); the excess assigned to member liability / excluded from payer settlement; usage never exceeds the annual sub-limit without an authorised override.
- **Note vs working controls:** the *contract tariff* cap works (CLM-2026-00289 ward 200k→130k) and the *PA-cover* guard is present — but the *benefit sub-limit* is a distinct control and is absent at the decision layer. Applies to any benefit category, so also implicates maternity sublimit (IP-F08), oncology annual benefit (IP-E02/E06), and per-visit limits.
- **Evidence:** DB rows for CLM-2026-00292 (first, non-conclusive: 550k headroom) and CLM-2026-00293 (conclusive: available 0 → approved 130,000, usage 25,130,000).

## Family A PA negatives — CLOSED OUT (all PASS)
- **IP-A12 PA decline (PASS, live):** PA-2026-00006 → **DECLINED** with reason "PREEXISTING" + notes; **no GOP, no hold, no benefit consumption**. Confirms decline-with-notes works (uses valid `declineNotes` field) — contrast IP-DEF-01 approve-with-notes crash. Decline reason enum is rich (pre-existing / exclusion / limit-exhausted / waiting-period / invalid-docs / non-covered-facility / fraud / other).
- **IP-A07 wrong-member / wrong-facility PA attach (PASS):** claim PA-attach dropdown is scoped to same member + facility (live: Mark's claim lists only Mark's Nakasero PA); server backstop `claims.service.ts:456-460` throws "Pre-auth belongs to a different member" / "issued for a different facility".
- **IP-A08 expired PA attach (PASS, defense-in-depth):** a DB-expired approved PA (PA-2026-00007, validUntil 2026-07-01) was **excluded from the attach dropdown entirely** (live); server backstop `claims.service.ts:462` throws "validity window has passed". Also only APPROVED PAs attachable (DECLINED/UTILISED excluded), and no re-attach across claims.
- **OBS-IP-FRAUD (positive):** submitting a PA with expected service date >7 days out raised a **fraud risk flag** at intake ("confirm scheduling is correct… reviewer should assess before approval") — a working variance/fraud gate signal.
- **OBS-IP-PA-HOLD:** after the settled claim consumed 1,300,000 of PA-2026-00005's 1,750,000 authorization, a **residual 450,000 hold lingers** (not released though the case's single claim is done) — verify intended vs benefit tie-up. (Benefit Consumed correctly = 1,300,000 = approved payer share — IP-I01 side-effect confirmed.)

## Family A/C eligibility + config-limited scenarios (this pass)
- **IP-A06 / C05 PA-required service without PA (PARTIAL):** filed CLM-2026-00291 (no PA) including ICU-DAY (a seeded `requiresPreauth=true` tariff, 850,000). Claim shows a **claim-level** note "PA-required services will route to review until one is attached" (soft-route, not hard-blocked at intake). But the **per-line requiresPreauth flag is not surfaced** in the pricing preview, and full block-without-PA could not be confirmed (needs completed adjudication + dual approval).
- **OBS-IP-TARIFF (observation):** provider tariff auto-matching is **inconsistent** — WARD-GEN matched its 130,000 contracted rate on CLM-2026-00289, but ICU-DAY (seeded tariff 850,000) showed CONTRACTED "—" on CLM-2026-00291 and "Compute Variance" did not populate it. Contracted-rate lookup appears unreliable per code.
- **Data-config limits (cannot positively test):** no provider has `genderRestriction`, `frequencyLimit`, or `requiresReferral` tariff rules seeded (all 0 across the tenant) → IP-C04 (rounds frequency cap), IP-D08 (gender/age restriction), IP-G04 (referral-required) are **untestable without config**.
- **OBS-IP-CONTRACT-CONFIG (systemic):** the package / digital-contract pricing engine is present in code but **not exercisable in this seed** — DB shows 7 Packages + 32 ContractPackages but **0 `PackageProviderEligibility`** rows (no provider eligible for any package), only 9 active diagnosis per-diem tariffs, and every test claim reports "no digital contract matched" (claims fall through to the flat provider tariff schedule). Consequence: **Family D package pricing/unbundling/LOS-cap/implant-cap, per-diem diagnosis bundling, and contract-ceiling enforcement (IP-I04) cannot be positively tested** until package-provider eligibility + digital-contract linkage are seeded. This is a go-live readiness gap for any client relying on package/bundled inpatient pricing.

## Observations
| ID | Area | Note |
|----|------|------|
| OBS-IP-1 | Benefit panel | Stage-2 pre-decision Benefit Balance showed **Annual Limit 5,000,000 / Consumed 50,000 / Available 4,950,000**; immediately post-approval the same panel shows **Annual Limit 25,000,000 / Consumed 0 / Active Holds 1,750,000 / Available 23,250,000**. Different limit basis (inpatient sublimit vs overall annual) and Consumed flipped 50,000→0 — confusing; verify which figure gates approval. |
| OBS-IP-CUR | Currency | Tenant is Uganda-first (UGX per project memory; providers/members all Ugandan) but all money labels render **KES** (PA estimated/approved, benefit balance). Matches outpatient OBS-CUR. Family K to sweep. |
