# EVIDENCE INDEX — Medvex TPA UAT

First-pass evidence: `04_Evidence/` — 7 text evidence files, DB snapshot
(`DB_Snapshots/aicare_pre_uat_2026-07-04.dump`), audit extract
(`Audit_Logs/audit-extract-2026-07-04.txt`), 11 role screenshots
(`Screenshots/rb-*.png`), worker failure log; RB sweep JSON in
`06_Test_Results/rb-sweep-results.json`.

## W5 pass evidence (all in `04_Evidence/Screenshots/w5-*.png` unless noted; drivers = `uat/w5-*.mjs`, reusable harness `uat/w5lib.mjs`)

| Ref | Artifact(s) | Proves |
|---|---|---|
| EV-W5-001 | `04_Evidence/login-page-2026-07-04-retest.html` (served source) | PR-003 fixed — no credentials in page or source |
| EV-W5-002 | w5-06-pa-hold-panel.png; w5-03/04 series | PR-011 fixed — hold panel: limit 500,000 / consumed 0 / holds 85,000 / available 415,000 |
| EV-W5-003 | w5-12-step2-future-blocked.png | PR-013 fixed — future DOS blocked |
| EV-W5-004 | w5-14-claim-761.png, w5-14-pa-after-761.png | PR-016 mechanics + PR-021 (auto-approve vs engine-refer) + PR-022 (full hold conversion) |
| EV-W5-005 | w5-17-762-detail.png, w5-19-*, w5-20-* | PR-012 fixed (dup names other claim); PR-015 fixed (over-PA gate + logged note); PR-023 (no ApprovalRequest at 2.49M UGX DAY_CASE) |
| EV-W5-006 | w5-21-approval-matrix.png; w5-27-auto-adjudication-settings.png | Matrix band config (fail-open gap); auto-policy gates = ceiling+fraud only |
| EV-W5-007 | w5-26-ceiling-rejection.png; w5-27-peter-pa-hold.png | PR-024 — benefit-package check only at decision; phantom SURGICAL hold |
| EV-W5-008 | w5-28-764-engine.png, w5-28-764-over-ceiling.png | **PR-026 (Critical)** — "No contract ceiling"; 5,000 approved vs contracted 3,600 |
| EV-W5-009 | w5-30-approvals-uw.png, w5-31-*, w5-32/33-* | PR-017 FX+routing fixed (10,000 KES → dual UW band); same-user L2 blocked; **PR-025** approval loop |
| EV-W5-010 | w5-38-ledger-2010.png; w5-43-2010/1010-after-settle.png | PR-018 fixed — JE-2026-00008..10 (CLAIM) + JE-2026-00011 (SETTLEMENT_PAID → PV-2026-00001), balanced TB |
| EV-W5-011 | w5-40/41/42-* | Settlement maker≠checker; **PR-027** cycle dead-end; claims → PAID |
| EV-W5-012 | w5-44 (Access Denied), w5-45/46-* | RBAC direct-URL block; PR-028 forbidden quick-links; PR-029 no voucher/statement surface |
| EV-W5-013 | w5-47..50-* | PR-005/006/007 fixed (provider create/activate/branch); PR-030 silent quick-action validation |
| EV-W5-014 | w5-49-audit-log.png | PR-020 fixed — full-chain audit incl. approval L1/L2 + settlement "voucher + GL posted" |
| EV-W5-015 | w5-51-contract-001.png, w5-51-hr-dashboard.png | PR-010 fixed (editable draft header); PR-019 fixed (HR dashboard) |
| EV-W5-016 | scratchpad worker-test.log (run W5-013) | PR-002 fixed — worker starts without env export |
| EV-W5-017 | w5-52..57-* | E3 cases PASS: CASE-2026-00001, LOU-2026-00001 UTILISED, CLM-2026-00766; PR-031 UGX display; PR-032 empty-close exception |
| EV-W5-018 | w5-58/59/60-* | C3 PASS: END-2026-00007 APPLIED → MVX-2026-00254; **PR-033** no maker-checker; PR-034 3-dp money |
| EV-W5-019 | w5-61/62/63-*; `04_Evidence/Downloads/fund-statement-bamburi-cement-2026-07-04.csv` | F3 PASS: deposit → statement reconciles → CSV export; PR-035 period label |
| EV-W5-020 | w5-64..67-*; w5-71/72-* | E8 PARTIAL: unlock/pack/capture/sync + idempotency OK; **PR-036** synced op vanishes |
| EV-W5-021 | w5-73..80-*; server log digest 3011118319 | D1 FAIL: quote QUO-2026-00004 → ACCEPTED, bind Step 2 crash — **PR-037**; w5-81-groups.png no partial state |
