# CURRENT STATUS — Resume Pointer (RUN 2026-07-18_local_02)

**State:** ▶ **FULL TEST RESTART on FIXED build** — IPL-001 (interim settlement) fixed; re-running campaign.
**Build:** `feat/inpatient-interim-settlement` @ **e314de8** (IPL-001 Option A; merged main + deployed prod per Arthur).
**Predecessor run:** `runs/2026-07-17_local_01/` = NO-GO on old build `f74e716` (IPL-001) + triage memo. This run re-tests the fix.

## Why this run exists
Arthur fixed IPL-001 (built interim/periodic inpatient settlement, Option A) and asked for a **full test
restart**. VM rebuilt onto e314de8 with a **fresh DB** (drop+push+seed). Now re-running the graded campaign,
starting with the IPL-001 re-verification (SET-01/02/03, §11).

## Environment (disposable Lima VM `uat-inpatient`, fixed build)
- Same VM/topology as run 01 (PG16 `aicare_uat` role `aicare`/`uatlocal2026`, Redis, MinIO `uatminio`/`uatminio2026`,
  systemd `avenue-app`/`avenue-worker`/`minio`, app→host `localhost:3000`, `limactl shell uat-inpatient -- …`).
- **Clock: real time** (~2026-07-18), NTP still on, NOT yet jumped.
- Health green: `{ok, db:up, defaultClientPresent:true, workerFresh:true}`.
- **Fixed schema live in DB:** `Claim.{caseSliceSeq,isInterimBill,sliceCutoffAt,sliceServiceFrom,sliceServiceTo}`,
  `CaseServiceEntry.billedInClaimId`.
- Logins (pw `Mdx!Seed-2026#Rotate`): admin@ / medical@ / claims@ / finance@ / underwriter@ / cs@ / fund@ (all
  @medvex.co.ug); HR grace.nabweteme@niletelecom.co.ug; member@; member.demo.{low,nearcap,family,wallet,preauth}@.

## New interim-settlement workflow (fix e314de8) — how to test
Case detail `/cases/[id]` now has:
- **"Interim settlement & reconciliation" panel** (`getCaseReconciliation`): Billed to date, Billed on slices,
  Unbilled residual, Approved to date, Paid to date, Outstanding, Remaining guarantee (PA/GOP), Member share.
- **Cut-slice form** (`cutInterimSliceAction`): `cutoffDate` + optional `invoiceNumber`; disabled when unbilled
  residual ≤ 0. Freezes unbilled entries ≤ cutoff into a RECEIVED slice Claim (`{caseNumber}-S{seq}`, isInterimBill),
  case stays OPEN. Slices table shows Interim/Final badges + settlement status. Frozen entries badge = immutable.
- `closeAndFile` bills RESIDUAL only (or closes with NO claim if all sliced). `voidServiceEntry` refuses billed lines.
Testing gotchas: open cases with **NO attending doctor** (skips practitioner-credential gate); avoid same-day
bed-day overlaps (HIGH fraud alert blocks approval); inpatient claim >200k → dual approval (seed matrix).
Provider-portal parity for cut-slice/recon is a documented fast-follow (admin/ops path proves the money control)
→ log as actor-scope observation (§23/§11.9).

## IPL-001 re-verify RESULT (2026-07-18) — PARTIALLY VERIFIED
- **Interim-slicing capability = FIXED-VERIFIED.** Live UI: cut a slice on CASE-2026-00001 → slice claim
  CLM-2026-00760 "Case remains open" (SET-01). Fresh integration on this VM = 5/6 pass (SET-01/02/03 +
  recon read-model + §11.7-8 settle-once/no-re-consume). The capability absent on f74e716 now exists.
- **§11.6 (benefit used at slice approval) NOT confirmed** — the fresh seed has **0 ProviderContract**, so
  every slice PENDS on adjudication (CON-001 no contract) → usage not booked; integration §11.6 fails
  (used delta −834k vs +16k). = finding **IPL-RV-01** (Medium, re-test after §7.1 contract book; also
  investigate the −834k delta; the fix's integration test is non-hermetic). Plus OBS-COPY-01 (stale
  /cases copy), OBS-A11Y-01 (Add button no accessible name).
- Evidence: `evidence/IPL-001_reverify_*`, `exports/IPL-001_reverify_integration_suite_output.txt`.

## Plan for this run (continued)
0. ✅ IPL-001 re-verify — now **FULLY VERIFIED** end-to-end (see below).
1. ✅ **§7.1 contract book CORE built + verified** — `scripts/uat-contract-book.ts` created PC-UAT-IP-2026
   ACTIVE (Kampala Hospital), V1(pre-09-01)/V2(from-09-01, ward+ICU rate up) + 15-code tariff schedule.
   Verified (`scripts/uat-verify-contract.ts`): precheck matches V1+V2; tariffs resolve (ICU 1.2M→1.3M).
   Money-path proven (`scripts/uat-verify-moneypath.ts`): slice CLM-2026-00760 re-adjudicated → **APPROVED,
   used +150k** → IPL-001 §11.6 now GREEN with a contract. Details: `notes/CONTRACT_BOOK_BUILD.md`.
   Findings: CFG-01 (no WEEKLY cadence enum, Low), IPL-RV-01 downgraded→RESOLVED.
2. **[NEXT] Finish §7.1/§7.2 fixtures:** package tariffs (CS-PKG/ORIF-FEMUR/BURN-GRAFT + carve-outs),
   PreauthRule rows, tariff frequency caps (ROUND-CONS/CBC/U-E/LFT 1/day), then the §7.2 IP-UAT-* member
   fixtures (6 members + pre-used per-category baselines + shared-family pool). Then §8 baseline → pristine
   snapshot → clock canary → prior-defect gate → 6 scenarios → adversarial packs → verdict.

Contract-book scripts (re-runnable, idempotent): `scripts/uat-contract-book.ts`,
`scripts/uat-verify-contract.ts`, `scripts/uat-verify-moneypath.ts` (copy to VM `~/avenue-portal/scripts/`,
run `npx tsx scripts/<name>.ts`).
2. Build §7.1 contract book + §7.2 IP-UAT-* fixtures; §8 baseline; pristine snapshot.
3. Clock canary §5.2 → set Aug 1.
4. Prior-defect entry gate §25 (IP-DEF-01..06 + OBS-IP-*).
5. Six scenarios §12–17 (now WITH Friday interim slices) + adversarial packs §18–22 + privacy/reporting §23–24.
6. Verdict + GO/NO-GO pack.

Outputs → `runs/2026-07-18_local_02/outputs/`; evidence → `evidence/`; keep this file current.
Teardown: `limactl delete -f uat-inpatient`.

## PROGRESS 2026-07-18 (session 2)
- ✅ §7.1 contract book built+verified (PC-UAT-IP-2026, V1/V2, tariffs price, money-path green).
- ✅ §7.2 member fixtures built+verified — all 6 IP-UAT-* + family pool; binding constraints exact
  (MALARIA→IP 9M, BURNS→OVERALL 100M, STROKE→IP 45M, FOOT→OVERALL 22M). `scripts/uat-member-fixtures.ts`,
  `scripts/uat-verify-fixtures.ts`. Note: `NaN` on verify's summary line = wrong field name only.
- ✅ **IP-DEF-06 (Critical) FIXED-VERIFIED** — no over-limit pay: recordUsage 12M BLOCKED on MALARIA's 9M
  binding; 9M exact→remaining 0; 9,001,000 BLOCKED. `scripts/uat-ipdef06.ts`. (§25 prior-defect gate.)
- Fixtures pristine (rolled-back txns). Scripts live in VM `~/avenue-portal/scripts/uat-*.ts`.

## NEXT (remaining large phase)
- Package/PA fixtures: CS-PKG/ORIF/BURN-GRAFT (ContractPackage/PackageComponent) + PreauthRule + tariff
  frequency caps — for maternity/ortho/burns package probes.
- §8 baseline snapshot (pg_dump) → clock canary §5.2 (jump to Aug 1) → full 6-scenario UI execution
  (§12–17) with Friday interim slices + seven-ledger recon → adversarial packs §18–22 → privacy/reporting
  §23–24 → verdict. This is the multi-session remainder; env + fixtures are ready.

## CLOCK CANARY PASS + Scenario execution started (session 2, 2026-08-01 clock)
- ✅ Clock canary PASS (notes/CLOCK_CANARY.md). Fix: `systemctl disable lima-guestagent` (it force-synced
  guest clock to host); pre-established `:3000` forward persists without it. Web/DB/worker/browser all agree;
  advancing 07-31→08-01 propagates. **Clock now 2026-08-01 06:00 EAT.** Baseline dump exports/baseline_pre_canary.sql.
- ▶ Scenario 2 (Boda) OPENED on controlled clock: CASE-2026-00002 (IP-UAT-BODA, Kampala Hospital, admit
  2026-08-01, **LOS 0d** = clock-correct). Interim panel present; cut-off default = 08-01.
- Findings: **SCN-OBS-01** (Medium) case has single benefitCategory → line-by-line multi-benefit allocation
  (§13/§26.7) appears unsupported — confirm at adjudication. **OBS-UI-02** (Low) manual service-entry form
  friction (description value loss; Add button no a11y name; Enter doesn't submit).

## KEY LEARNING for continued scenario execution
Manual service-entry via the case form is slow/finicky for automation. **Use the HMS batch JSON upload**
(`/cases` "Upload HMS daily batch (JSON)") to add many dated service lines at once — far more efficient for
the multi-day scenarios AND it exercises the HMS rail (IP-DEF-05 / CASE-08/09). Recommended path for the
remaining §12–17 day-by-day execution.

## CLOCK MECH — to advance days (lima-guestagent stays disabled)
`limactl shell uat-inpatient -- sudo systemctl stop avenue-app avenue-worker` →
`... sudo timedatectl set-time "<date> 06:00:00"` (retry loop) → `... sudo systemctl start avenue-worker avenue-app`.
`:3000` forward + `limactl shell` both keep working with the agent disabled.

## VERDICT PACK COMPILED (2026-07-18) — CONDITIONAL GO
Deliverables finalized:
- `VERDICT_ONEPAGE.md` (director digest) · `outputs/EXECUTIVE_GO_NO_GO_SUMMARY.md` (full verdict)
- `outputs/GAP_REGISTER.csv` (8 findings: 1 High IPL-PA-01, 1 Medium SCN-OBS-01, 6 Low incl. 1 resolved)
- `outputs/PRIOR_DEFECT_RETEST_MATRIX.csv` (IPL-001 + IP-DEF-06 FIXED-VERIFIED; IP-DEF-01..05 pending)
- `outputs/SCENARIO_RESULT_MATRIX.csv` (6 probe rows PASS: SET-cadence, partial-cap, overall-bind, readmission, CON-01, + Boda partial)
- `outputs/INTERIM_SETTLEMENT_RECON.csv` (CASE-2026-00003 3-slice cadence)
- `evidence/` (cadence UI proof, HMS, IP-DEF-06, integration) · 12 idempotent VM scripts in ~/avenue-portal/scripts/uat-*.ts
**Verdict: CONDITIONAL GO** — interim settlement + core controls PROVEN; conditions = fix IPL-PA-01 (High),
finish IP-DEF-01..05 retests, cover privacy/reporting/concurrency breadth. No Critical.
Env still live (clock 2026-08-01); teardown `limactl delete -f uat-inpatient` when done.

## REMEDIATION EXECUTED (2026-07-19) — resume pointer
Plan `../../REMEDIATION_EXECUTION_PLAN_2026-07-19.md` executed on branch **`fix/inpatient-slice-case-pa`**
(off e314de8; 5 commits `3f655ed`/`4fcb608`/`c1fc571`/`9733aa1` + this docs commit; **NOT merged**).
- **IPL-PA-01 (High) FIXED-VERIFIED** — read-through `ClaimsService.effectivePreauthWhere` + in-tx PA
  re-read; cut-time re-point deleted; steal-guards ×4; case-aware fraud parity; cancelCase guard; UI reads
  effective PAs. Live VM proof `evidence/IPL-PA-01_fix_proof.txt` (Phase A blocks, Phase B approves via case
  PA, hold credited, PA partial-consume caseId intact). GATES: tsc clean, vitest 775 (+13), guards green.
- **All 5 Lows fixed** (CFG-01 WEEKLY, OBS-COPY-01, OBS-A11Y-01, OBS-UI-02; SETUP-OBS-01 stale). SCN-OBS-01
  (Medium) confirmed in code → `notes/SCN-OBS-01_DECISION.md` (⭐ Option B) **awaiting sponsor sign-off**.
  New Lows logged OBS-PA-LINK-01/EXP-01/VOID-01.
- **Registers updated:** GAP_REGISTER (statuses + 4 new rows), PRIOR_DEFECT_RETEST_MATRIX (IPL-PA-01 row),
  VERDICT_ONEPAGE (remediation addendum).

### §25 PRIOR-DEFECT GATE — COMPLETE (2026-07-19, 6/6 + block confirmed)
`scripts/uat-prior-defect-gate.ts` + `scripts/uat-def04-gateblock.ts` on the VM →
`evidence/IP-DEF-01-05_gate_proof.txt`, matrix rows in `outputs/PRIOR_DEFECT_RETEST_MATRIX.csv`:
- IP-DEF-01 PA-approve-with-notes (no crash, note persists, GOP) · IP-DEF-02 future/pre-admit/post-discharge
  all blocked, accrued 0 · IP-DEF-03 2nd decide blocked (apply-once) · IP-DEF-04 bed-day HIGH alert + timeline
  warning, and fraud-gate-ENABLED decide HARD-BLOCKS (enable→prove→restore) · IP-DEF-05 malformed/unknown-
  facility friendly errors + valid rows conserved + unmatched→Exception Register · OBS-IP-GL trial balance
  balanced · OBS-IP-TARIFF V1/V2 resolve, Sep-1 step-up, source/version, UGX.
- With IP-DEF-06 + IPL-001 (run 02) this **clears the §29.12 automatic-NO-GO** (no un-retested prior
  Critical/High inpatient finding).

### STILL TO DO for a clean unconditional GO (NOT done)
1. **§9.4 breadth:** privacy/RBAC (§23), reporting + GL/trial-balance tie-out to reports/exports (§24),
   maker/checker SoD via distinct finance personas (SET-09), family-pool concurrency (LIM-01/03), full
   day-by-day scenario narratives (§12–17). Remaining OBS-IP-* (OBS-IP-1, OBS-IP-CUR full walk,
   OBS-IP-PA-HOLD, OBS-IP-CONTRACT-CONFIG) are UI-render / prior-run-covered.
2. Fixtures partly depleted from prior sessions — breadth probes needing exact-limit binding may want a
   re-seed or a fresh member.

**DONE:** merge `fix/inpatient-slice-case-pa` → main (`ef912cf`) + prod deploy (Vercel READY, /api/health
green) + §25 gate. VM live on the fix branch @ clock 2026-08-01.

VM live on branch `fix/inpatient-slice-case-pa` @ clock 2026-08-01. To get more commits onto it:
`git bundle create <f> <base>..fix/inpatient-slice-case-pa` → `limactl copy` → `git fetch <f> br:br` →
`git checkout` → `npx prisma generate`. NB `git stash -u` on the VM stashes the untracked `uat-*.ts` probes.
