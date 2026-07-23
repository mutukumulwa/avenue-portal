# Claims Autopilot — Cross-Role E2E UAT Campaign (F7.6)

**Status: ENGINEERING PRE-UAT DONE (run `2026-07-23_local_01`) — the human
cross-role UI campaign + sign-offs remain. F8.1 gate WAIVED by the sponsor
(2026-07-23): production deployed with every policy OFF at `18254fa` (see
`docs/claims-autopilot/DEPLOYMENT.md` §F8.1), so the campaign now runs against
prod-OFF. F8.2 shadow activation remains HARD-GATED on this campaign's
sign-offs.**
Automated evidence below is green on the disposable-DB battery (100 passed /
9 skipped ×3 consecutive passes, 2026-07-23, branch `feat/claims-autopilot`);
the integrity gate is green clean AND after a 2,689-request load burst. Story 3
is additionally proven end-to-end through the production HTTP surface (see
`runs/2026-07-23_local_01/`). Each remaining story needs its through-the-UI run
and role sign-off before F8.2 shadow activation — run them against prod-OFF
(preferred, higher fidelity) or the local environment from the RUN_LOG's
environment handover.

Conventions: per-story evidence in `runs/<date>_<n>/evidence/` (screens, exports,
SQL tie-outs), actor log CSV, defect register — same portable format as
`uat/inpatient_longitudinal_2026-07-17`.

| # | Story | Automated evidence (already green) | UI/UAT run | Sign-off |
|---|---|---|---|---|
| 1 | Clean admin claim — shadow then live | direct-entry INT; shadow INT; execute INT | ☐ | TPA claims |
| 2 | Clean provider-portal claim | direct-entry INT (channel PROVIDER_PORTAL) | ☐ | Provider ops |
| 3 | B2B accepted / replay / conflict / status lookup | api INT (8) + security INT (3); **prod-HTTP transcript `runs/2026-07-23_local_01/evidence/B2B_API_story.txt`** | ☑ agent (prod-mode HTTP) | Engineering |
| 4 | CSV mixed batch + conservation report | csv INT (4) | ☐ | TPA claims |
| 5 | Offline day → reconnect → result link | sync INT (5) | ☐ | Provider ops |
| 6 | Missing PA / document / pricing / fraud / benefit routes | fidelity + evaluate INT; queues UI (F6.4) | ☐ | Medical |
| 7 | Reimbursement manual route | reimbursement INT (4) — D13 forced queue | ☐ | TPA claims |
| 8 | Pre-auth-origin claim | preauth INT (5) | ☐ | Medical |
| 9 | Inpatient interim/final — shadow + reconciliation | case INT (5) + integrity gate | ☐ | Medical + Finance |
| 10 | Policy maker/checker + emergency deactivation | policy-approval INT + console (F6.5) | ☐ | Product + Security |
| 11 | Worker/Redis failure recovery | recovery + queue INT | ☐ | Engineering |
| 12 | Provider/member notifications | reason-catalog texts + terminal-notify path (F3.7) | ☐ | Product |
| 13 | Finance GL/fund/benefit/PA reconciliation | execute INT (benefit-once) + integrity §11.7 + IPL seven-ledger method | ☐ | Finance |
| 14 | Foreign-scope negative probes | SECURITY_EVIDENCE.md matrix | ☐ | Security/privacy |

Sign-off roles: TPA claims · medical · finance · provider operations ·
security/privacy · product · engineering/UAT.
