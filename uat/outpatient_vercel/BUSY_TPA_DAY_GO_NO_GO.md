# Busy TPA Day E2E UAT — GO / NO-GO Readiness

**Date:** 2026-07-08 · **Target:** https://avenue-portal.vercel.app (Vercel prod, code = origin/main @ `97b2478`)
**Method:** UI-only, each actor logged in as themselves, no DB/API mutation. Test plan: `BUSY_TPA_DAY_E2E_UAT_TEST_PLAN.md`.
**Scope caveat:** ~40 of the plan's checks executed (SET, CHK, OP intake incl. adversarial, full ADJ, full FIN spine). ~25 remain **BLOCKED by a live login outage (BD-03)** that began mid-run — see untested register.

## VERDICT: **NO-GO**

Not because the core engine is weak — it is genuinely strong — but because three release-blocking issues are open and the highest-consequence control area (cross-scope IDOR, the prior D02 Critical) could not be re-verified this run.

## Spine questions
1. **Can a real outpatient claim run provider → adjudicate → maker/checker settle → GL/reflected?** → **YES (proven).** OP-1 + OP-6 rode intake → capture → adjudicate → batch → maker-checker → SETTLED, with a **balanced GL** (approval Dr Expense/Cr Payable = approved amounts; settlement Dr Payable/Cr Bank = batch total, once).
2. **Does money leave only per contract?** → **YES (proven), with one High caveat.** Ceiling enforced fail-closed (ADJ-10 blocked +1614% over-contract), partial excludes rejected line, decline no payable, duplicates detected/routed, GL posts only approved amounts. **Caveat BD-04:** the ceiling is CPT-gated — omit the CPT and a contracted service escapes its cap with a full-billed default.
3. **Is data scope hard (no IDOR)?** → **PARTIAL / UNPROVEN.** RBAC nav-trimming, provider facility-scoping (own view), and maker/checker segregation verified. But the **negative cross-access probes** (Provider B → Aga Khan batch/claim URLs; member → other-member URL; HR/fund cross-group) — the exact area of the prior **D02 Critical** — were **not re-run** (blocked by BD-03). Cannot certify scope is hard.

## Blocking issues (why each blocks)
1. **BD-03 — Critical (availability):** `/post-login` intermittently 503s (React #419 SSR abort), blocking **all** logins. Reproduced live for provider + admin across ~10 attempts. If users can't log in, nothing else matters. Must root-cause the /post-login SSR failure and confirm login reliability before go-live.
2. **BD-04 — High (money control):** contract-ceiling bypass via CPT omission + full-billed default → fails toward overpayment on manual review. A provider can bill a contracted service without its CPT and dodge the tariff cap.
3. **BD-05 — High (settlement workflow):** a provider+cycle that already has a batch cannot get a second batch → approved claims arriving later in the month are **un-settleable**, and the block is **silent** (no on-screen error). Real busy-day operations approve claims continuously.
4. **Spine Q3 untested:** IDOR/cross-scope not re-verified — treated as open risk on the most damaging control class.

## Genuinely strong (verified live — the system's due)
- End-to-end money spine with balanced double-entry GL; only approved amounts post; no mixed-currency summing (UGX base).
- Contract ceiling enforced fail-closed (when CPT present); over-ceiling approval blocked with clear reason and no side effect.
- Partial approval and decline behave correctly (rejected/declined amounts never settle or post).
- Maker/checker segregation enforced; duplicate settlement not reachable; duplicate claims detected and routed to manual review with the offending claim numbers.
- RBAC: role-appropriate nav trimming; provider portal facility-scoped; branded "Access Denied" for unauthorized routes; future-dated claims blocked (server, Africa/Kampala TZ).
- Prior blocker **PR-V02 (settlement Mark Paid) resolved**; de-KES→UGX and full-name member search fixes live.

## Conditions that survive even if all blockers verify
- **Scale unproven:** tested a handful of claims/one settlement batch; the "2,997 members / busy day" volume claim is not load-verified.
- **Cross-border currency data:** Kenya-facility (Aga Khan) tariffs are KES-magnitude numbers labelled UGX (OBS-1) — reconcile before real cross-border settlement.
- **UX systemic (OBS-2):** server-action errors via URL param + blank pages; controls work but poor feedback invites re-submission (ties into duplicate risk).
- **Credential hygiene:** @test.local persona temp passwords remain unrecorded; recovery is admin re-invite only.

## Untested-risk register (BLOCKED by BD-03 — re-run after login is fixed)
FIN-09 provider statement view · **FIN-10/CHK-05/VIS-08 Provider-B IDOR (prior D02 area)** · VIS-01 member reflection · VIS-02 member IDOR · VIS-03/04 HR scope · VIS-05/06 fund scope + drawdown · VIS-07/FIN-11 reports export tie-out · **ADJ-12 fraud gate ON** · **BD-01 privilege-escalation verify** · IP-* inpatient lifecycle · PA-* preauth/LOU · OPS-* operational workload · OP-10 ineligible member · duplicate double-pay confirmation (approve+settle both 00290 & 00294).

## Exit-criteria scorecard (plan §17)
| # | Criterion | Status |
|---|---|---|
| 1 | Clean OP claim eligibility→settle→GL | ✅ PASS (GL/settlement proven; provider+member reflection views BLOCKED) |
| 2 | Multi-line reconciles every screen | ⚠ PARTIAL (intake/adjudication reconcile; OP-2 left un-adjudicated) |
| 3 | Partial excludes rejected/member-share | ✅ PASS (OP-6: 30,000 excluded from settle+GL) |
| 4 | Decline no payable side effects | ✅ PASS (OP-7 declined, GL unaffected) |
| 5 | Inpatient open→close→claim→settle | ❌ BLOCKED (not run) |
| 6 | Maker/checker + no dup pay + voucher/GL tie | ✅ PASS (FIN-03/05/06/07/08) |
| 7 | Role boundaries hard by UI + direct URL | ⚠ PARTIAL (RBAC nav yes; IDOR probes BLOCKED) |
| 8 | All via UI; DB/API gaps marked | ✅ PASS (UI-only) |
| 9 | No Critical/High open | ❌ FAIL (BD-03 Critical; BD-04, BD-05 High) |
| 10 | Mediums owned w/ target date | ⏳ pending owner assignment |

**Bottom line:** the claims-money engine is production-grade and the maker/checker + GL controls are trustworthy. Ship-blockers are (a) an intermittent login outage, (b) a CPT-based ceiling bypass, (c) a settlement cycle-collision that strands claims, and (d) unverified IDOR scope. Fix those, restore login reliability, then re-run the BLOCKED register (start with Provider-B IDOR) to lift to CONDITIONAL GO.
