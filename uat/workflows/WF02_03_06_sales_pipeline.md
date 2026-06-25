# Workflows W2 (Quote→Bind) + W3 (Member Enrolment) + W6 (Endorsements) — LIVE

Environment: `http://localhost:3000` · 2026-06-25 · role: SUPER_ADMIN.

## W2 — Quotation / Underwriting

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 2.1 | `/quotations` list | list + New Intake | "Quotations" + "New Intake" | ✅ PASS |
| 2.2 | New Business Intake → create | quotation created | **QUO-2026-00004** created, redirected to assessment, no crash | ✅ PASS |
| 2.3 | Prospect name displays | legal name (not "Unnamed Prospect") | Shows **"UAT Phase3 Prospect Ltd"**; no "Unnamed Prospect" | ✅ PASS — **DEFECT-006 not reproduced (fixed)** |
| 2.4 | Lives count copy | "lives" | Shows **"0 lifes"** | 🔴 **DEFECT-008 confirmed open** (grammar: "lifes"→"lives") |

## W3 — Member Enrolment

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 3.3 | Register Member (principal) | member created w/ number, persists | **AVH-2026-00250** created (UATTest MemberPhase3, ACTIVE, Twiga Foods); total members 249 → **250** in DB | ✅ PASS |

> Note: the register form is React-Hook-Form controlled — a first rapid parallel fill didn't register in RHF state (validation flagged empty required fields); re-filling + verifying values held, then submitting, worked. Not a product defect, a test-automation timing nuance.

## W5/Settings — Pricing Models

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 5.6 | Settings → Pricing Models → **Create Model** | model creation works | Button has onClick, opens a form (name/type/description); submitting created **"UAT Test Pricing Model" (FLAT_RATE)** in DB | ✅ PASS — **DEFECT-004 RESOLVED** (was a dead placeholder) |

## Groups — Enrolment & Duplicate Handling

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| — | Enroll Corporate Group "UAT Dup Test Co" | created with feedback | Created (1 row), redirected to `/groups` with "enrolled" feedback, no crash | ✅ PASS (feedback present — DEFECT-007 pattern improved) |
| — | **Re-submit same group name** | duplicate blocked | **Blocked**: `?error=A group named "UAT Dup Test Co" already exists.`; count stays 1 | ✅ PASS — **DEFECT-003 RESOLVED** (dup-name check now enforced) |

## Phase 3 summary
- ✅ Quotation intake creates correctly; **DEFECT-006 (unnamed prospect) fixed**.
- ✅ Member enrolment works end-to-end (AVH-2026-00250 persisted).
- 🟢 **DEFECT-004 (dead pricing-model button) RESOLVED**.
- 🟢 **DEFECT-003 (group double-submit/duplicates) RESOLVED** — duplicate names blocked with a clear error.
- ✅ Group enrolment gives feedback (DEFECT-007 area improved).
- 🔴 **DEFECT-008 (grammar "0 lifes") still open** (cosmetic).

## Remaining (not tested this pass)
Full W2 bind chain (add life → calculator pricing cross-check → underwriting decision → send → accept → **Create Group from accepted quote (DEFECT-007 exact path)** → 4-step maker-checker bind → debit note); W3 dependents, card issuance, portal-login provisioning + member first login, KYC upload; W6 endorsements + pro-rata math. Carry forward.

## Test artifacts created (local UAT DB)
Quotation QUO-2026-00004; PricingModel "UAT Test Pricing Model"; Member AVH-2026-00250; Group "UAT Dup Test Co". (Local instance — left in place as evidence.)
