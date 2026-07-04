# Workflow Test Results — 2026-07-04 engagement (build `1cd23a8`)

Status legend: ✅ PASS · 🟠 PASS-WITH-DEFECTS · ❌ FAIL · ⏳ NOT TESTED (see Pending_Workflows.md)

| # | Workflow (catalogue ref) | Roles exercised | Result | Defects | Evidence |
|---|---|---|---|---|---|
| 1 | A1 Operator provisioning (clean env rebuild) | implementer | 🟠 works via db push+seed+extra script; not reproducible from migrations; demo data inseparable | PR-001, PR-002 | 02_Test_Plan/Environment_Provisioning.md |
| 2 | Authentication + post-login routing | all 11 | 🟠 login/logout/routing correct; credentials printed on login page; brand mix | PR-003 (Critical), PR-004 | login-page-snapshot; rb-sweep |
| 3 | B1 Provider creation | SUPER_ADMIN | 🟠 record created + propagates (lists, dropdowns, contracts, PA, claims, settlement, offline) but no feedback/redirect, no edit/activate UI, no branch mgmt | PR-005, PR-006, PR-007 | provider-create evidence |
| 4 | B2 Contract import (OCR markdown → extraction → review → commit) | SUPER_ADMIN | ✅ impressive: 115 candidates, provenance + confidence, blocking review question, V-gates on draft | — | contract-import-cic |
| 5 | B2 Contract guided capture + full lifecycle (draft→review→approve→activate) | UNDERWRITER + SUPER_ADMIN | 🟠 lifecycle + maker-checker + backdate horizon enforced server-side; but every rejection is silent in UI; header immutable in DRAFT; rules render as JSON | PR-008, PR-009, PR-010 | contract-jubilee-capture |
| 6 | E2 Pre-auth (submit → 2-stage medical review → approve) | ADMIN, MEDICAL_OFFICER | 🟠 flow works incl. validity; **no BenefitHold placed** | PR-011 (High) | clinical-chain |
| 7 | E4 Claim intake wizard (member/provider search, ICD-10, lines) | MEDICAL_OFFICER | 🟠 4-step wizard works; PA auto-attach ✔; contract SLA on list ✔; future DOS accepted; self-duplicate flag | PR-012 (High), PR-013 | clinical-chain |
| 8 | E5 Adjudication under ACTIVE case-rate contract | MEDICAL_OFFICER | ❌ engine preview correct (3,600) but manual approval paid 86,000 unchallenged; no usage/UTILISED side-effects; FX-blind matrix bands | PR-014 (Critical), PR-015, PR-016 (Critical), PR-017 (High) | clinical-chain |
| 9 | E7 Provider settlement (maker-checker → SETTLED → claim PAID) | FINANCE_OFFICER, SUPER_ADMIN | 🟠 chain completes; SoD enforced w/ clear error (June crashes fixed); **no GL/voucher posting** | PR-018 (High) | clinical-chain |
| 10 | A2 Client creation | SUPER_ADMIN | ✅ | — | seed-membership |
| 11 | C1 Group enrolment | SUPER_ADMIN | ✅ | — | seed-membership |
| 12 | C2 Member enrolment — form | SUPER_ADMIN | ✅ (MVX numbering; straight to ACTIVE) | — | seed-membership |
| 13 | C2 Member enrolment — CSV bulk import (family linking) | SUPER_ADMIN | ✅ parse/validate/confirm; principal-dependant linking correct; 360° family unit on detail | — | seed-membership |
| 14 | A3 User management (invite REPORTS_VIEWER) | SUPER_ADMIN | ✅ appears in list + user-rights-roles export | — | rb-sweep |
| 15 | RBAC enforcement (11 roles × 16 routes) | all | 🟠 matches declared sets; HR guard bounces staff to /login | PR-019 | rb-sweep-results.json + screenshots |
| 16 | H Reports & exports propagation | SUPER_ADMIN | ✅ membership/claims/user CSVs include all UAT-created records | — | fetch results in Role_Based_Test_Results.md |
| 17 | G Audit trail | — | 🟠 19 entries for session; gaps: provider create, capture, contract child edits | PR-020 | Audit_Logs/audit-extract |
| 18 | E8 Offline work code issuance | SUPER_ADMIN | ✅ code UG7YED, 24h validity, revoke available (SMS stub = by design) | — | this file + screenshot set |
| 19 | K Wellness (program create + enrol) | SUPER_ADMIN | ✅ program + enrolment + next-due cadence | — | this file |

## Not tested this pass (carry-forward)
E3 cases (one case→one claim), E6 queues UI detail, HMS batch push/upload, offline capture+sync loop, LOU issuance, C3 endorsements (incl. HR-initiated), D1 quotation→bind, D2 renewals, F1 billing runs, F3 fund deposits/statements, F4 commissions, F5 member wallet, cross-border, complaints/service desk, member portal deep-walk, compliance registers, terminology/FX settings, B2B `/api/v1/*`, USSD/SMS handlers, fraud investigations, overrides console, appeal/void paths, job-driven behaviours (escalations, packs, accruals). See `03_Progress_Logs/Pending_Workflows.md`.
