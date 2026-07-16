# Comprehensive Production-Readiness UAT — Plan of Action

**Engagement:** Full end-to-end UAT of the Medvex TPA portal, testing every user story and
action across all roles and surfaces.
**Target (SUT):** `https://avenue-portal.vercel.app` — the live Vercel test environment.
**Build under test:** deployed HEAD `db60142` (fork-B WP-B1/B2/B3 + friendly-banner fix; all
prior Workstream-A fixes). Confirmed live 2026-07-15: `/login` 200, `/api/v1/claims` no-key 401,
root 307.
**Backing store (read-only verification only):** Supabase `otivyuroqraiijayvkze` (AiCare),
tenant `medvex` `cmr3ae8v30000nlvqxrqlfn38`, ~2,999 members.
**Started:** 2026-07-15 · **Tester:** Claude (autonomous) · **Method:** `uat` skill.

---

## 0. Ground rules for this engagement (explicit user constraints)

1. **All tests run against the live Vercel system.** No local stack.
2. **No database injects.** No test data is created, and no state is mutated, via SQL or the
   Supabase MCP. Every record and every action is driven **through the real UI or the public
   API rails**. The DB is used **read-only**, and only to verify side effects the UI does not
   surface (GL balance, reservations, coverage periods, audit rows). Prefer UI-visible evidence
   first; drop to a read-only query only when the UI cannot show the side effect.
3. **Evidence or it didn't happen.** Every PASS carries evidence captured *in this run* —
   screenshot, saved HTML/text, export file, or a read-only query result. Prior runs and unit
   tests are context, never proof.
4. **Blocked ≠ passed. Untested = risk.** Anything the environment or the no-inject rule
   prevents is logged BLOCKED with the reason and carried in the untested-risk register.
5. **Judge by side effects, not status codes.** After every mutating action, ask what *else*
   must now be true (ledger posted & balanced, reservation placed then consumed not orphaned,
   status advanced, audit written, notification sent) — then go look.
6. **Verdict is lifted only by independent re-verification through the UI**, in this pass.

---

## 1. Spine questions (the verdict hinges on these — YES/NO with evidence)

The system is a Third-Party Administrator for medical insurance. What it *sells* is trustworthy
adjudication and disbursement of other people's money against contracts, with data privacy. The
verdict is decided by these four, not by pass-rate:

- **S1 — Contract fidelity & exactly-once money out.** *Can money leave the system only in the
  amount the contract allows, and exactly once?* (ceiling/co-pay/exclusion enforcement, ×
  maker-checker settlement, × no double-pay under concurrency/retry, × balanced GL).
- **S2 — Data isolation.** *Is every member's PII and health data readable only by those
  entitled?* (tenant / client / group / broker-book / provider-facility / member-self scope;
  the open **N3** cross-employer finding lives here).
- **S3 — The job can actually be done.** *Can the core revenue workflow run end-to-end without
  a dead-end?* (onboard client → package/contract → enroll member → preauth → claim →
  adjudicate → settle → GL; and quote → bind → convert).
- **S4 — Controls hold under attack.** *Do the gates fail closed under concurrency, retry,
  stale-state, boundary and injection inputs?* (the SYS-1 family of atomic-transition fixes;
  fail-open config; self-approval; double-submit).

A green checklist with any spine question answering **NO** is **NO-GO**.

---

## 2. System-under-test surface (from the route map)

- **12 roles:** SUPER_ADMIN, CLAIMS_OFFICER, FINANCE_OFFICER, UNDERWRITER, CUSTOMER_SERVICE,
  MEDICAL_OFFICER, REPORTS_VIEWER, BROKER_USER, MEMBER_USER, HR_MANAGER, FUND_ADMINISTRATOR,
  PROVIDER_USER.
- **6 portals / surfaces:** Admin `(admin)` (~130 routes), HR `(hr)`, Broker `/broker`,
  Fund `/fund`, Member `/member`, Provider `/provider`.
- **API rails (B2B):** `/api/v1/{eligibility,benefits,claims,preauth,sync,hms-batch,upload}`,
  plus M-Pesa callback, USSD, SMS member-query, WebAuthn check-in.
- **Background jobs:** preauth-escalation / expired-hold release worker, settlement, notifications.

## 3. Module map (each maps to the spine and to the tracker)

| # | Module | Spine | Notes |
|---|--------|-------|-------|
| **M1** | Money spine E2E: client→contract→member→preauth→claim→adjudicate→settle→GL | S1,S3 | The crown-jewel chained lifecycle. Ride ONE record all the way. |
| **M2** | Ceiling / co-pay / exclusion / unpriced-line enforcement (adjudication correctness) | S1 | incl. mixed coded+uncoded ceiling (BD-07 shape) |
| **M3** | Settlement maker-checker + Mark-Paid + voucher + balanced GL | S1,S4 | incl. **FG-C7** double-Mark-Paid re-verify |
| **M4** | Preauth lifecycle + benefit hold place/consume/expire | S1,S4 | incl. **FG-C8** dual-decision, **FG-C10** live hold-expiry |
| **M5** | Endorsements + pro-rata + GL | S1,S4 | incl. **FG-C6** double-approve |
| **M6** | Cases / LOU / closeAndFile | S1,S4 | incl. **FG-C9** double-close |
| **M7** | Quotations → build → assess → **bind** → convert to group | S3,S4 | incl. **FG-C11** double-bind / amendment double-apply |
| **M8** | Point-in-time coverage gate (pre-coverage reject; adjacent reimbursement rail) | S1,S4 | **FG-C5** re-verify + the sibling reimbursement rail |
| **M9** | RBAC sweep — 12 roles × route matrix (land / trim / deny / scope) | S2 | one login per role; branded denial; data scope |
| **M10** | Data isolation deep: HR-group, broker-book, fund-scheme, member-self, provider-facility | S2 | IDOR probes; **N3** cross-employer re-check |
| **M11** | Provider portal full + B2B API auth/scope (all 6 rails) | S1,S2 | key-scoping, eligibility/benefits/claims/preauth/sync/hms |
| **M12** | Member portal full (benefits, check-in, preauth, wallet, health-vault, dependents, docs, utilization, support) | S2,S3 | incl. **Family F** check-in (untested residual) |
| **M13** | HR portal full (roster, endorsements, invoices, utilization, support) | S2,S3 | |
| **M14** | Broker portal full (quotations, groups, commissions, renewals, submissions) | S2,S3 | |
| **M15** | Fund portal full (dashboard, scheme claims, statement export) | S2 | |
| **M16** | Underwriting: packages / rate-matrix / pricing-models / contracts (import + tiering) | S1,S3 | fee-schedule service-category tabs |
| **M17** | Providers onboarding + provider contracts | S3 | |
| **M18** | Fraud (rules, investigations, check-ins) + fraud-gates-settlement (OBS-H1) | S1,S4 | |
| **M19** | Overrides / approvals / assessor-queue / onboarding-queue | S4 | approval matrix enforcement |
| **M20** | Settings sweep (approval-matrix, auto-adjudication, claim-controls, fx-rates, drug-exclusions, integrations, notifications, pricing-models, security, terminology, audit-log, exceptions) | S1,S4 | config that gates money must fail closed |
| **M21** | Tenant onboarding (/settings/tenants create + re-provision) | S3 | slug-lock fail-closed |
| **M22** | Analytics (dashboard, alerts, board-pack, parity, renewals, risk, schemes, providers) | — | |
| **M23** | Reports — each reportType + CSV/PDF export tie-out (fresh UAT records appear) | S1 | propagation + conservation |
| **M24** | Cross-cutting hygiene: console/network, 404/error/unauthorized, mobile viewport, empty states | — | tracked on every page |
| **M25** | Input-boundary & injection adversarial (negative/oversized amounts, malformed, XSS/SQLi-shaped) | S4 | across mutating surfaces + API |
| **M26** | Conservation tie-out (Family Q): paid claims vs GL vs vouchers | S1 | note seed-data caveat OBS-Q1/Q2 |
| **M27** | Scale claim (2,999 members) — verify lists/search/exports hold at volume | — | no load-inject; verify via existing volume |

## 4. Priority order (spine-first; prize bugs live in the first three bands)

1. **Band 1 — Money spine & concurrency (S1, S4):** M1, M2, M3, M4, M5, M6, M7, M8 +
   the fork-B re-verifications (FG-C5/6/7/8/9/10/11). *This is where a caught bug is worth most.*
2. **Band 2 — Isolation (S2):** M9, M10, M11 (+API), N3 re-check.
3. **Band 3 — Portals end-to-end (S3):** M12, M13, M14, M15.
4. **Band 4 — Config & distribution (S1, S3):** M16, M17, M18, M19, M20, M21.
5. **Band 5 — Reporting, analytics, hygiene, scale:** M22, M23, M24, M25, M26, M27.

Checkpoint after every module; update the resume pointer after every workflow.

## 5. Fork-B fix re-verification scoreboard (carried from FULL_GO_DEFECT_REGISTER)

These are DEPLOYED but most are **unit-verified only** — the whole point of this pass is to
re-prove them through the UI, and to **test the adjacent shape** (cross-rail parity), per the skill.

| Fix | What to re-prove live | Adjacent shape to also attack |
|-----|----------------------|-------------------------------|
| FG-C5 | pre-coverage service date → rejected at `/claims/new`; in-window → accepted | reimbursement rail `/claims/new/reimbursement` (still old throw-pattern per memory); B2B `/api/v1/claims` cover-start parity |
| FG-C6 | endorsement approve once; second approval rejected/no double-GL | tRPC router **and** server-action entry both guarded |
| FG-C7 | Mark Paid once → 1 voucher + 1 balanced JE; retry/second session → CONFLICT, no 2nd voucher | supplementary batch sequence; approveSettlementBatch (FG-C11) |
| FG-C8 | PA approve/decline once terminal; concurrent 2nd decision → stale rejection, no phantom hold | offline PA; auto-adjudication path |
| FG-C9 | case close files exactly one claim | two closes; caseId-non-unique |
| FG-C10 | available limit reflects expired holds live (worker-independent) | offline pack / sync / PA-balance surfaces all reconciled |
| FG-C11 | bind once; amendment apply once (no double pro-rata/commission clawback) | double-bind membership creation |
| FG-C1 | offline pack scoped to entitled members (247 not 2,997) | already FIXED-VERIFIED (D-14) — spot re-confirm |
| N3 | cross-employer exposure still OPEN (business decision) | confirm it is the *documented* state, not a regression |

## 6. Persona / environment provisioning (no DB injects)

Known-good logins (provisioned in prior sessions; passwords already set — logging in is not an inject):

| Role | Login | Password |
|------|-------|----------|
| SUPER_ADMIN | admin@medvex.co.ug | MedvexAdmin2024! |
| HR_MANAGER (Safaricom) | emily.wambui@safaricom.co.ke | FullGoUAT2026! |
| HR_MANAGER (NWSC) | hr.nwsc.uat@test.local | FullGoUAT2026! |
| FUND_ADMINISTRATOR | fund.nwsc.uat@test.local | FullGoUAT2026! |
| REPORTS_VIEWER | reports.uat@test.local | FullGoUAT2026! |
| BROKER_USER | broker@kaib.co.ke | FullGoUAT2026! |
| MEMBER_USER | noah.bb2@test.local | FullGoUAT2026! |

**Missing roles for the RBAC sweep:** CLAIMS_OFFICER, FINANCE_OFFICER, UNDERWRITER,
CUSTOMER_SERVICE, MEDICAL_OFFICER, PROVIDER_USER. Provisioning path (in order of preference,
all no-inject):
1. Try existing `*.busyday@` logins (`BusyDay2026!`) from the BB2 engagement — may already
   cover these roles. Log in only; no inject.
2. Create the missing user **through the admin UI** (`/settings` → Invite User) — user
   management is itself a workflow under test. If the invite reveals/*sets* a usable password
   on-screen, use it; if it only emails a link and test-env mail is unavailable, mark that
   role's *direct-login* probe **BLOCKED** and test its surface via the admin proxy + the
   code-confirmed `requireRole` guard. **Do not** DB-set a password to work around this.
3. PROVIDER_USER: a facility portal login is required for M11; provision via Invite User with
   the Provider role (reveals a Facility selector) or an existing provider login.

Login recipe (in-app browser): navigate `/login` → screenshot to wake render → `form_input`
email/password refs → click **Sign In** button by ref (Enter/coord do not submit). Sign out via
`/api/auth/signout` then click Sign out. **Minimise login churn** — OBS-K1 login throttle trips
after ~10 rapid cycles; batch each persona's whole route probe in one session.

## 7. Deliverables (this folder — canonical `uat/` layout)

- `COMPREHENSIVE_UAT_PLAN.md` (this file) · `UAT_MASTER.md` (tracker) ·
  `MASTER_RUN_LOG.md` (resume pointer + chronological log) · `DEFECT_REGISTER.md` ·
  `GO_NO_GO_READINESS.md` (standing verdict + scoreboard).
- `01_System_Documentation/` (reuse + refresh) · `03_Progress_Logs/Testing_Checkpoint_Log.md`
  · `04_Evidence/` (Screenshots, Downloads, DB_Snapshots) · `05_Defects/` · `06_Test_Results/`
  · `07_Production_Readiness/` (Readiness_Assessment, Executive_Summary).
- Defect IDs continue the `CU-###` series (Comprehensive-UAT), cross-referencing prior `FG-*`
  / `BD-*` / `BB2-*` IDs where a defect re-opens.

## 8. Definition of done

Every module in §3 is PASS / FAIL / BLOCKED / PARTIAL with in-run evidence, the fork-B
scoreboard (§5) is fully re-verified through the UI, every defect is logged with severity +
repro + evidence, the untested-risk register is explicit, and `GO_NO_GO_READINESS.md` carries a
defensible **GO / CONDITIONAL GO / NO-GO** decided by the four spine questions. Interrupt-safe:
the resume pointer and checkpoint log always reflect the true next step.
