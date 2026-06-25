# Workflows W7 (Pre-auth), W8 (Claims capture), W20 (Fraud) — LIVE, local seeded instance

Environment: `http://localhost:3000` · 2026-06-25 · roles: SUPER_ADMIN (UI), B2B caller (curl).

## W7 — Pre-Authorisation

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 7.1 | `/preauth` list | list + KPIs | 8 preauths (5 pending, 2 approved), KPI cards | ✅ PASS |
| 7.3/7.4 | Open SUBMITTED PA-2024-00003 → Approve (Full) → Submit Approval | status → APPROVED, hold placed, limit reduced | Status → **APPROVED**, approvedAmount **KES 16,000**; no crash | ✅ PASS (approval) |
| 7.4 (hold) | Verify BenefitHold placed | BenefitHold confirmed; remaining limit reduced | ❌ **No BenefitHold created** — `BenefitHold` table is **empty system-wide (0 rows)**, even for the 2 pre-approved seed preauths | 🔴 **FAIL — DEF-009** |

**DEF-009 (High) — Benefit holds are never placed.** Approving a pre-auth does not create a `BenefitHold`, and the table has 0 rows across the whole system. Per plan W7: *"If benefit holds aren't placed/released correctly, limits drift and double-spend becomes possible."* A member can have an approved pre-auth **and** still claim the full limit — the limit is not reserved. The pre-auth status workflow works, but the financial-control side (limit hold/release) appears unimplemented.

## W8 — Claims Capture

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 8.1 | `/claims` list | list + KPIs | 759 claims, KPI cards, filters | ✅ PASS |
| 8.8 | B2B `POST /api/v1/claims` no key | 401 | 401 | ✅ PASS |
| 8.8 | B2B default dev key `av-slade360-dev-key` | **401** (overridden by local `API_KEY`) | **401** | ✅ PASS — confirms **DEF-001 is a pure config fix** (set `API_KEY` in prod) |
| 8.10 | real key + `{}` | 400 field list | 400 "Missing required fields: …" | ✅ PASS |
| — | Eligibility GET real key, ACTIVE member | 200 eligibility | 200, full member/policy (Joseph Mwangi, KCB Group) | ✅ PASS |
| 8.9 | claims POST real key, **SUSPENDED** member | 403 not eligible | **403 "Member status is SUSPENDED — not eligible"** | ✅ PASS (Critical eligibility gate works) |
| — | claims POST real key, ACTIVE member, bogus provider | 404 provider | 404 "Provider not found" (auth+member OK) | ✅ PASS |

Evidence: `../evidence/network_logs/03_b2b_api_local.txt`. **UI claims wizard (8.2–8.6) not exercised this pass** — the list + all API channels are verified; full UI wizard capture is a remaining item. Note: no provider has a `slade360ProviderId` seeded, so a full API claim *create* (201) couldn't be completed — a seed gap, not a code defect.

## W20 — Fraud Alerts

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 20.1 | `/fraud` desk | alerts with rules/scores | "Fraud Alert Desk", HIGH/MEDIUM alerts, Investigate actions | ✅ PASS |
| 20.2 | Open alert → Dismiss with reason | state changes, audit recorded | Alert "Probable Split Billing" (score 72) → **resolved=true**, reason stored, `resolvedBy`/`resolvedAt` set; no crash | ✅ PASS |

## Phase 4 summary
- **Resolved Critical blockers:** settlement → SETTLED (DEFECT-010 a/b/c), adjudication crash (DEFECT-009-prior) — see [WF09](WF09_adjudication_settlement.md).
- **Working:** preauth approve, claims list, B2B API auth + **eligibility gate** (suspended → 403), fraud dismiss with audit.
- **New defects:** DEF-008 (settlement posts no GL/voucher), **DEF-009 (benefit holds never placed — double-spend risk)**.
- **DEF-001** confirmed to be a pure prod-config fix (local `API_KEY` rejects the dev key).
- **Remaining in W8:** UI claims wizard end-to-end; seed a provider `slade360ProviderId` to test API claim *create* (201).
