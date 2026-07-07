# Test Run Log — Outpatient Front-End UAT (Vercel)

Legend: PASS · FAIL(defect) · BLOCKED(reason) · PARTIAL · N/A

## Setup (front-end)
| # | Persona | Route | Action | Result | Evidence / Notes |
|---|---------|-------|--------|--------|------------------|
| S1 | Admin | /login | Log in as admin@medvex.co.ug | PASS | Landed /dashboard; 2,997 members, 7 groups, 10 pending claims. ss_7322h1cnr |
| S2 | Admin | /settings | Inventory users | PASS | 10 pre-existing users, 1 per role. NO reports-viewer, single finance officer, HR=Safaricom. Inline role dropdown lacks PROVIDER USER (Invite modal has it). |
| S6 | Admin | /groups | NWSC scheme ACTIVE | PASS | "NWSC Staff Medical Scheme" ACTIVE, 2,750 members, package NWSC Staff Care (Bronze), renewal 01/07/2027. |
| S7 | Admin | /members | Confirm principal + dependant | PASS (adapted) | Daniel Kato absent (0/2999). Adopted **Mark Kato** NWSC-2026-01768 (PRINCIPAL, Silver, limit 30,000,000, utilised 0, 0 claims) + dependant **Prossy Kato** NWSC-2026-02891 (Parent). |
| S8 | Admin | member detail | Create principal member portal login | PASS | mark.kato2593@nwsc-scheme.example / temp pw set; shows ACTIVE + Reset Password. |
| S9 | Admin | /providers | Confirm Nakasero + IHK ACTIVE/contracted | PARTIAL/FLAG | /providers search returns "No providers matching Nakasero"/"International" — but both exist in Invite-User facility list. Positive facility switched to **Aga Khan Univ. Hospital** (ACTIVE contract PC-2026-128, Outpatient service, 540 tariff lines, 82 prior claims). |
| S4 | Admin | /settings Invite User | Create provider users (facility-scoped) | PASS | Invite modal role "Provider (Facility)" → FACILITY picker ("only sees this facility's eligibility/claims/settlements"). Created Reception AgaKhan (Aga Khan) + Reception IHK (IHK), both PROVIDER USER ACTIVE. |
| S5 | Admin | /settings Invite User | Create reports/finance-checker/NWSC-HR | PASS | Reports Viewer, Finance Checker (FINANCE OFFICER), NWSC HR (HR_MANAGER → ASSIGN TO GROUP = NWSC). All ACTIVE. |

## Setup adaptations (data substitutions — Vercel DB ≠ runbook names)
- Principal "Daniel Kato" → **Mark Kato** (NWSC-2026-01768). Dependant "Sarah Kato" → **Prossy Kato** (NWSC-2026-02891, Parent).
- Positive facility "Nakasero" → **Aga Khan University Hospital** (proven, 82 claims). Negative/partial "IHK" → **International Hospital Kampala (IHK)** (contract TBV).
- Password for all UAT-created accounts: `MedvexUat2026!` (temp; "change on first login"). Pre-existing seeded accounts use `MedvexAdmin2024!`.

## Scenario A — Full-approval principal outpatient claim
| # | Persona | Route | Action | Result | Evidence / Notes |
|---|---------|-------|--------|--------|------------------|
| A2.1 | Reception AgaKhan (PROVIDER) | /provider/dashboard | Log in | PASS | Landed provider dashboard scoped to **Aga Khan University Hospital**; no forced pw-change wall. Baseline: 82 claims, 45 approved/partial, PAID TO DATE **KES 2,536,690**, 0 awaiting. ss_4171abx88 |
| A2.2 | Provider | /provider/eligibility | Check NWSC-2026-01768 | PASS | Mark Kato **ELIGIBLE — cover active**; NWSC scheme, Silver, PRINCIPAL, limit 30,000,000 / used 0 / remaining 30,000,000 (KES). |
| A2.3 | Provider | eligibility → File claim | Open prefilled claim form | PASS | /provider/claims/new?memberId=… prefilled Mark Kato. |
| A2.4-2.9 | Provider | /provider/claims/new | OUTPATIENT/OUTPATIENT, DOS today, clinician Dr. James Otieno, dx **J06.9**, 3 lines: Consultation 99213 @3,500 + Laboratory 85025 @8,000 + Pharmacy Amoxicillin @5,000 | PASS | TOTAL BILLED **KES 16,500**. ss_7151g77l3 |
| A2.10 | Provider | submit | Submit claim | PASS | Redirect to /provider/claims; new claim **CLM-2026-00278** — Mark Kato, OUTPATIENT 07/07/2026, BILLED KES 16,500, status **RECEIVED**. Appears under Aga Khan only. ss_78407xx1y |

**KEY IDs:** Scenario-A claim = **CLM-2026-00278** (Mark Kato NWSC-2026-01768, Aga Khan, billed 16,500). DB id cmra2dq3l000204jgtq5o4s4p.

| A3.1 | Claims Officer (claims@medvex.co.ug) | /dashboard→/claims | Log in, find claim | PASS | Landed /dashboard; **PENDING CLAIMS 10→11, CLAIMS-MONTH 263→264** (propagation ✓). Nav trimmed (no Finance/Compliance/Setup). Claim visible in TPA all-claims queue with 24h SLA. |
| A3.2 | Claims Officer | claim detail | Review provider data | PASS | Member/provider/diagnosis J06.9 intact; 3 lines shown; billed 16,500. |
| A3.3 | Claims Officer | claim detail | Review contract/fraud panels | FLAG | Contract-engine preview shows **"no contract matched / queue: NO CONTRACT (CON-002)"**, all lines PENDED payable 0.00 — yet Service Line Items matched Consultation 99213 to CONTRACTED 3,500, and Adjudicate panel computed **payable ceiling 16,500** from PC-2026-128. Auto-router: **"Routed to manual review — FRAUD_FLAG: 1 open fraud alert"**. Contracted Rate Analysis: billed 16,500 vs contracted 3,500 = **371.4% variance ⚠ FRAUD FLAG**. |
| A3.4 | Claims Officer | claim detail | Mark as Captured → Compute Variance | PASS | Status RECEIVED→**CAPTURED**; variance computed. |
| A3.5 | Claims Officer | Adjudicate Claim panel | Submit APPROVED (full 16,500) | PASS (with concern) | Approved amount 16,500 (= ceiling), decision Approve(Full). Status → **APPROVED**, Approved KES 16,500; APPROVED counter 166→167. **CONCERN: single claims officer finalized a fraud-flagged claim to full billed amount — no second approval / fraud-alert clearance enforced.** "Pay above ceiling" override control exists (guardrail present). |

**Currency observation reinforced:** same claim shows **KES** in header/summary & Contracted-Rate-Analysis, **UGX** in Adjudicate panel & Claims Queues — amount 16,500 identical (not FX-converted). Labels inconsistent.

| A4.1 | Medical Officer (medical@medvex.co.ug) | claim detail | View claim | PASS | Medical officer can view CLM-2026-00278 (APPROVED 16,500), clinical fields (dx J06.9). No clinical exception required; view-only review. PENDING CLAIMS 11→10 after approval (propagation ✓). |
| A5.1 | Finance Maker (finance@medvex.co.ug) | /settlement | Log in, open settlement | PASS | Finance nav trimmed to Finance+Insights. Provider Settlements: maker/checker/settled pipeline. |
| A5.2 | Finance Maker | /settlement | Create batch (Aga Khan, Jul 2026) | PASS | Batch created: **46 claims, KES 3,288,480, MAKER SUBMITTED** (includes CLM-2026-00278; count 45→46). |
| A5.3 | Finance Maker | /settlement | Attempt to approve OWN batch | **PASS (control holds)** | Blocked: **"Maker and checker must be different users"**. Batch stays MAKER SUBMITTED. Segregation of duties enforced. |
| A5.4 | Finance Checker (finance.checker.uat@test.local) | /settlement | Log in, approve batch | PASS | UAT temp-pw account logs in. Checker approves → status **CHECKER APPROVED**; "Mark Paid" appears. |
| A5.5 | Finance Checker | /settlement | Mark Paid (settle) | **FAIL — PR-V02 (Critical)** | Raw Prisma transaction-timeout error surfaced to UI (5000ms exceeded on 46-claim update). Batch stranded **CHECKER APPROVED**, SETTLED=0. Reproduced twice. Settlement cannot complete via FE. |

**SETTLEMENT BLOCKER:** Scenario-A A5.5 fails → claim CLM-2026-00278 remains APPROVED but **never PAID**; A6 "paid"-state checks (provider settlement visibility, paid totals) cannot be exercised. Spine-Q1 (settle end-to-end) currently **NO**.

| A5.6 | Finance Checker | /billing/gl | Review GL trial balance | PASS | Trial Balance **✓ Balanced** (Debit=Credit=KES 3,046,700). GL intact despite failed settlement (rolled back cleanly). NOTE: GL revenue 915,000 / claims 151,700 look small vs system claim volume — GL auto-posting coverage warrants deeper review. |
| A1 / A6.3 | Member (Mark Kato, mark.kato2593@nwsc-scheme.example) | /member/dashboard | Log in, review benefits/utilisation | PASS | Rich member portal (My Benefits/Dependents/Utilization/Check-In/Wallet…). Card NWSC Officer Care Silver, ACTIVE, cover KES 30.0M. **Recent activity shows the claim: "Aga Khan University Hospital — OUTPATIENT visit recorded 07 Jul 2026 — KES 16,500 APPROVED"**. **"KES 16,500 used against annual cover"**; OUTPATIENT sublimit now KES 5.0M left. Utilisation increments on APPROVAL (before payment). Family Covered: 2. UAT temp-pw login works. |
| C7 | Member (Mark Kato) | /members | IDOR/scope: hit admin member registry | PASS | Branded **Access Denied** → /unauthorized. Member hard-scoped to /member/*. |

## Scenario B — Partial/decline dependant claim & Scenario C — RBAC/scoping
| # | Persona | Route | Action | Result | Evidence / Notes |
|---|---------|-------|--------|--------|------------------|
| C2 | Provider IHK (provider.ihk.uat@test.local) | /provider/dashboard | Confirm scope | PASS | IHK dashboard scoped to **International Hospital Kampala (IHK)**, TOTAL CLAIMS 0 ("No claims yet") — does NOT see Aga Khan's 46 claims. |
| C3/C4 | Provider IHK | /claims/<AgaKhan-claim-id> | Cross-provider/admin claim URL | PASS | Branded **Access Denied** → /unauthorized. |
| B1.2 | Provider IHK | /provider/eligibility | Check dependant NWSC-2026-02891 | PASS | Prossy Kato **ELIGIBLE**, NWSC/Silver, **"PARENT of Mark Kato"** (family context shown). |
| B1 | Provider IHK | /provider/claims/new | File dependant claim (dx J20.9, Specialist Consultation 99214 @6,000) | PASS | **CLM-2026-00279** — Prossy Kato, IHK, OUTPATIENT, billed **KES 6,000**, RECEIVED. Appears under IHK only. |
| D3 | Provider IHK | /provider/claims/new | Submit without diagnosis | PASS | Blocked (required field); no submit, no crash, no claim created. |
| B2 | Claims Officer | claim detail | Capture → **Decline** with reason | PASS | Adjudicate panel: "No contract ceiling — reviewer judgement applies". Per-line ✓/✗ actions present. Decision **DECLINED** + reason recorded. Status → **DECLINED**, Approved —. TOTAL 278→279, AWAITING CAPTURE 8→7. Rejected claim carries no payable. |
| B3.1 (inferred) | — | — | Declined claim excluded from settlement | PASS (by design) | Declined → approved 0 → not eligible for a payable settlement batch. Not separately re-settled (settlement path blocked by PR-V02). |
| A6.6/B3.6 | Reports Viewer (reports.uat@test.local) | /dashboard | Reports tie back to claims | PASS | Read-only role (nav Overview+Insights only). Recent Claims shows BOTH UAT claims with correct status: **CLM-2026-00279 Prossy Kato IHK 6,000 DECLINED** + **CLM-2026-00278 Mark Kato Aga Khan 16,500 APPROVED**. UAT temp-pw login works. |
