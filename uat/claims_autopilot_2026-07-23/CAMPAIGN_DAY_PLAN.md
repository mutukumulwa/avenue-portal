# Claims Autopilot — F7.6 Cross-Role Campaign · Day Plan (prod-OFF)

**Environment:** PRODUCTION `avenue-portal.vercel.app` (≥ `71b65d7`), every policy
OFF, worker in staffed-window local posture (`docs/WORKER_DEPLOYMENT.md` §F8.2).
**Pilot facility:** Aga Khan University Hospital (contract `PC-2026-128`,
551 priced lines). **Foreign-scope facility:** International Hospital Kampala.
**Pilot population:** NWSC Staff Medical Scheme members `NWSC-2026-00250…00254`.
**Exit:** all 14 matrix rows exercised + signed → **GO for F8.2 shadow**
(the Story-10 policy stays on as the pilot shadow policy).

**Hard safety rails for the whole campaign**
- No LIVE policy may be drafted or approved (D1 — live is F8.3, after signed
  shadow exit). The console refuses LIVE without a ceiling; reviewers refuse it
  entirely this campaign.
- All decisions remain human (policies OFF/SHADOW); money moves only through
  the normal maker/checker settlement the finance story runs.
- Anything unexpected → open the tenant-wide breaker from
  `/settings/auto-adjudication` (reason required) and log a defect. Breaker
  blocks only live execution — safe drill anytime.

## Actor map

| Sign-off role | Persona (login) | Notes |
|---|---|---|
| TPA claims | `claims@medvex.co.ug` (Grace) | maker for Story 10; adjudicator Day 1 |
| Medical | `medical@medvex.co.ug` | Stories 6/8/9 review |
| Finance | `finance@medvex.co.ug` + `finance.checker.f76@test.local` | SoD pair for settlement (Story 13) |
| Provider operations | `provider.agakhan.f76@test.local` (+ `provider.ihk.f76@test.local` for foreign probes) | Stories 2/5/14 + Day-0 onboarding |
| Product + sponsor | Arthur | Story 10 checker may be `admin@medvex.co.ug` |
| Security/privacy | Arthur or delegate | Story 14 review + SECURITY_EVIDENCE walk-through |
| Engineering/UAT | agent (evidence compilation, Stories 3/11 orchestration) | |
| Members | `mark.kato2593@nwsc-scheme.example`, `noah.bb2@test.local` | Stories 7/12 member view |

Passwords: `@medvex.co.ug` = the standard seeded ops password (engagement
memory; **rotate before real-client go-live** — long-standing open item).
`@test.local`: there is NO password-reset path for existing users (Invite
refuses existing emails; the inline control only toggles role/active — the
padlock on portal rows is the BD-01 role-binding guard, not a lockout). The
established pattern is a FRESH persona per engagement: Day 0 invites the
`.f76` generation above with passwords set directly in the form. (Product gap
flagged: admin password reset for existing users.)

## Day 0 — prep (~1 h, admin + provider ops + agent)

| # | Task | Who | Done |
|---|---|---|---|
| P1 | Worker up: `redis-server --port 56380 --save "" --appendonly no --daemonize yes` then `set -a; source .env.worker.local; set +a; npm run worker`; confirm `/api/health` → `workerFresh: true` | agent | ☐ |
| P2 | Create run dir `runs/<date>_prod_01/{evidence,outputs}`; copy `ACTOR_RUN_LOG_TEMPLATE.csv` in | agent | ☐ |
| P3 | Invite the `.f76` campaign personas (fresh accounts, passwords set in the form; Provider role → Facility selector) | admin | ☐ |
| P4 | **Entitlement onboarding (the real provider-ops act):** on contract `PC-2026-128`, add NWSC applicability (INCLUDE, active, effective now) through the contract UI — never SQL | provider ops + admin | ☐ |
| P5 | Mint an Aga Khan API key via the admin UI; record the `mvxk_` prefix ONLY in the run log; hand the plaintext to the agent for Story 3 | admin | ☐ |
| P6 | Story 3 dry pass: `API_KEY=… bash b2b-story.sh` → the ACCEPTED leg completes the F8.1-deferred prod smoke; save transcript to `evidence/` | agent | ☐ |

## Day 1 — core rails (order matters)

| Story | What | Actor(s) | Expected + evidence |
|---|---|---|---|
| **10a** Policy drill FIRST | Console `/settings/auto-adjudication`: draft **SHADOW** policy scoped narrow (NWSC + OUTPATIENT [+ Aga Khan if scopeable]); maker submits; **checker approves** (SoD: maker ≠ checker); then **emergency-deactivate drill** with reason; re-draft + re-approve to leave shadow ON | claims@ (maker), admin@ (checker) | policy APPROVED/SHADOW; deactivation immediate + audited; self-approval refused (probe it); screenshots + audit rows |
| **1** Clean admin claim | Admin direct entry for `NWSC-2026-00250`, Aga Khan, priced consult; policies now SHADOW | claims@ | banner received; claim routes to manual queue; **AutomationPanel shows the staged trace + a shadow proposal, `approvedAmount` 0** (shadow moves no money). LIVE leg: **deferred to F8.3 by design** |
| **2** Provider-portal claim | Same shape via the provider portal | provider.agakhan.uat | identical normalization; visible in provider claim list with status |
| **3** B2B full story | Re-run `b2b-story.sh` (accepted/replay/conflict/lookup/404/413/401) + receipt `nextAction` reads correctly | agent + engineering witness | transcript in evidence; replay returns SAME claim |
| **4** CSV mixed batch | Upload `story4-import.xlsx` (3 clean + 1 in-file duplicate invoice + 1 bad row): preview first (zero writes), then commit; then **re-upload the same file** | claims@ | preview writes nothing; commit: 3 IMPORTED + 1 LINKED + 1 skipped w/ reason + conservation block ties; re-upload: all REPLAYED, zero new claims |
| **6** Exception routes | Craft: inpatient claim w/o PA; claim with an unpriced/uncoded line; a fuzzy near-duplicate of Story 1's claim | claims@ + medical@ | each ACCEPTED then routed to the right named queue on `/claims/queues` with catalog remedy text; nothing rejected at the door (D6) |
| **7** Reimbursement | Member reimbursement w/ proof + payout destination | claims@ (+ member view) | ALWAYS lands `REIMBURSEMENT_PROOF_REVIEW` queue; no auto path (D13); destination stored |
| **8** Pre-auth origin | Create + approve a PA, then convert to claim; **double-click convert** | medical@ + claims@ | ONE claim (replay); PA `ATTACHED`; hold untouched until decision |

Day 1 close: adjudicate the day's claims through the normal decision surface
(mix approve/partial/decline) so Story 13 has money to reconcile and shadow
gets agreement data.

## Day 2 — depth + failure + finance

| Story | What | Actor(s) | Expected + evidence |
|---|---|---|---|
| **9** Inpatient case | Open admission (PA'd), add entries across days, cut an interim slice, close+file | medical@ + claims@ | slice + final carry receipts; entries frozen once; conservation Σslices+final = Σentries; **case claims force SHADOW — never auto-decide** |
| **5** Offline day | Provider offline pack → capture offline → reconnect → sync | provider.agakhan.uat | op links receipt+claim; retry sync = zero duplicates; conflicts land exception register |
| **11** Failure recovery | Agent kills the worker mid-processing, submits via API (inline still works), restarts worker → sweep completes any stranded run | agent + engineering witness | no lost claim; run completes exactly once; log excerpt in evidence |
| **12** Notifications | Review in-app notifications for Day-1 terminal decisions (member + provider texts from the reason catalog); SMTP optional — if unset, record in-app only | cs@ + member persona | texts match catalog; no PHI leakage in texts |
| **13** Finance reconciliation | Settlement batch over Day-1 approved claims (maker `finance@`, checker `finance.checker.uat`); then integrity: `npx tsx scripts/claims-autopilot-integrity.ts` against prod (read-only) + GL/benefit/PA spot tie-outs | finance pair | batch settles, GL balances, integrity **exit 0**; tie-out numbers in `outputs/` |
| **14** Foreign-scope probes | IHK persona attempts Aga Khan member/claim/receipt through UI + API; spoofed fields | provider.ihk.uat + agent | every probe non-enumerating 403/404; zero cross-scope reads; note in evidence + map to SECURITY_EVIDENCE.md rows |

## Close-out (all hands, ~30 min)

1. Walk the 14-row matrix in `UAT_PLAN.md`; tick each row's "UI/UAT run" with
   run-dir references; each sign-off role signs their rows.
2. Defects → register in the run dir (sev, repro, owner). Critical/High = NO-GO
   for shadow until fixed + re-run.
3. On GO: the Story-10 SHADOW policy remains active → **F8.2 shadow pilot is
   running from this moment**; agent starts the daily shadow-agreement
   monitoring cadence (§F8.2: monitor daily, review disagreements, tune by NEW
   policy versions only, never edit history, exit checklist §14.2).
4. Worker posture reminder: staffed-window local is fine for shadow; DEC-08
   cloud provisioning is the F8.3 entry criterion.
