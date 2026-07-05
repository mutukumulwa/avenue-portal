# WORKFLOW RESULTS — Medvex TPA UAT

First-pass detail: `06_Test_Results/Workflow_Test_Results.md` (19 workflows) and
`06_Test_Results/Role_Based_Test_Results.md` (11 roles × 16 probes).
This file tracks the **W5 re-verification pass** and remaining pending workflows.

Legend: ✅ PASS · ❌ FAIL · 🟠 PARTIAL · ⛔ BLOCKED · ⏳ NOT RUN

## W5 blocker re-verification (complete)

| # | Workflow / defect under re-test | Status | Evidence |
|---|---|---|---|
| W5-B1 | PR-003 credentials on login page (Critical) | ✅ FIXED-VERIFIED | W5-001; login-page-2026-07-04-retest.html |
| W5-B2 | PR-011 PA approval places benefit hold | ✅ FIXED-VERIFIED (hold panel on PA detail; limit−used−held arithmetic) | w5-06-pa-hold-panel.png |
| W5-B3a | PR-014 contract ceiling enforced | ❌ **STILL OPEN as PR-026 (Critical)** — every line maps UNLISTED; "No contract ceiling — reviewer judgement"; 5,000 approved vs contracted 3,600 | w5-28-*.png |
| W5-B3b | PR-016 usage written + PA → UTILISED | ✅ FIXED-VERIFIED (member 360 UTILISED updates; PA → UTILISED; hold → CONVERTED) | w5-20-*.png |
| W5-B3c | PR-017 approval matrix FX-correct | 🟠 FX + routing VERIFIED (10,000 KES → 290,000 UGX → dual UW band; "≈ UGX 2,494,000" display) — but completion broken (**PR-025 High**: chain never applies decision) and coverage fails open (**PR-023 High**) | w5-30/31/32/33-*.png |
| W5-B3d | PR-018 GL posting at decision | ✅ FIXED-VERIFIED (JE-2026-00008/09/10 per claim, source CLAIM, balanced TB) | w5-38-ledger-2010.png |
| W5-B4 | Settlement: maker≠checker; Mark Paid → voucher + SETTLEMENT_PAID JE; claims PAID | ✅ FIXED-VERIFIED (self-approve blocked; JE-2026-00011 SETTLEMENT_PAID → PV-2026-00001; 2010 −176,046 / 1010 −176,046; batch claims → PAID) — new gaps PR-027/PR-029 | w5-42/43-*.png |
| W5-B5 | Secondary: PR-005/006/007/009/010/019/020/002/004 | ⏳ in progress | |

Also re-verified in passing: **PR-012** ✅ (duplicate names the other claim), **PR-013** ✅ (future DOS blocked), **PR-015** ✅ (over-PA-cover confirmation + logged note).
New W5 defects: PR-021..PR-029 — see DEFECT_REGISTER.md.

## Pending workflows (from first pass — see 03_Progress_Logs/Pending_Workflows.md)

| Priority | Workflow | Status |
|---|---|---|
| H1 | E3 Case management | ✅ PASS w/ defects — CASE-2026-00001: open → 2 service entries → LOU-2026-00001 (UTILISED at close) → CLOSED read-only → filed CLM-2026-00766 (4,000, RECEIVED). Defects: PR-031 (UGX display on KES scheme), PR-032 (empty-case close = unhandled exception). HMS batch upload NOT tested |
| H2 | C3 Endorsements (admin) | ✅ PASS w/ defects — END-2026-00007 ADD_MEMBER → pro-rata +91,356.164 → Approve & Apply → APPLIED → member MVX-2026-00254 ACTIVE in roster. Defects: **PR-033 no maker-checker (High)**, PR-034 (3-dp money). HR-initiated path NOT tested; invoice impact NOT verified |
| H3 | D1 Quotation → bind (Create Group retest) | ❌ **FAIL** — broker quote QUO-2026-00004 create ✓ (DRAFT→SENT), UW Record Acceptance ✓ (ACCEPTED, 4-step bind wizard), but Step 2 "Create Memberships" crashes server-side (**PR-037 High**: group.create missing `tenant` relation). No partial state; onboarding path dead at conversion. Steps 3 (binder maker-checker) & 4 (debit note) unreachable |
| H4 | F3 Self-funded fund | ✅ PASS — deposit +250,000 (W5-DEP-001) → dashboard totals + statement reconcile (12,250,000) → Export CSV downloaded w/ deposit row. Defect: PR-035 (period label). June DEFECT-016 confirmed fixed |
| H5 | E8 Offline loop | 🟠 PARTIAL — code OWA-UG7YED unlock ✓, data pack (121 members/115 tariffs) ✓, capture ✓, duplicate absorbed ✓, sync SYNCED + ops counter ✓ — **but op never becomes claim/queue/exception → PR-036 (High)** |
| H6 | B2B API series (UI-adjacent only) | ⏳ |
| M7–M13, L14–16 | Portals, billing run, fraud, overrides, appeals, reports, misc | ⏳ |
