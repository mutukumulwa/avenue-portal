# GO / NO-GO READINESS — Medvex TPA (10,000-life / 2,000-facility corporate)

**Standing verdict: NO-GO** (first pass 2026-07-04, 5 blockers — see
`07_Production_Readiness/Executive_Summary.md` and `Readiness_Assessment.md`).
Remediation for PR-001..PR-020 landed on `main` @ `7e5dfc0` the same day.
**The verdict is NOT lifted until this W5 pass independently re-proves each blocker fix
through the front end and closes the material pending workflows.**

## Blocker re-verification scoreboard (W5 pass, 2026-07-04 PM)

| Blocker | First-pass finding | W5 status |
|---|---|---|
| 1. Credentials on login page (PR-003) | Login page listed live credentials | ✅ FIXED-VERIFIED (W5-001) |
| 2. Case-rate ceiling not enforced (PR-014) | 86,000 paid vs 3,600 contracted | ❌ **STILL OPEN → PR-026 (Critical)**: engine maps all wizard lines UNLISTED; adjudicate panel "No contract ceiling"; 5,000 approved vs contracted 3,600. Plus PR-021: auto-path approves engine-refer claims. |
| 3. Benefit usage/holds never written (PR-011/016) | No hold on PA approve; no usage on pay; PA never UTILISED | ✅ FIXED-VERIFIED — with new granularity defect PR-022 (full hold consumed by any claim) |
| 4. Approval matrix FX-blind (PR-017) | KES amounts compared against UGX bands | 🟠 FX + routing FIXED-VERIFIED, but **PR-025 (High)**: completed chains never apply the decision (dual-band claims unpayable) and **PR-023 (High)**: uncovered bands fail open |
| 5. No GL posting on settlement (PR-018) | PAID with no JE/voucher | ✅ FIXED-VERIFIED — decision JEs per claim + SETTLEMENT_PAID JE + PV-2026-00001, balanced TB. New gaps: PR-027 (settlement dead-end for late-approved claims, High), PR-029 (no voucher/statement surface, Med) |

**Interim position after blocker re-verification: NO-GO stands.** Blockers 1, 3, 5 clear; blocker 2 remains Critical (PR-026 + PR-021); blocker 4 half-fixed with two new High defects (PR-023/PR-025). Claims payment is still not constrained by contract prices, and the highest-value approval band cannot complete at all.

## ⏩ POST-FIX determination — remediation pass (2026-07-04 late evening)

All 17 W5 defects (PR-021..PR-037) plus the re-opened blocker (PR-014→PR-026)
were fixed in code and re-verified through the front end. See DEFECT_REGISTER.md
"REMEDIATION PASS" table for the per-defect fix + evidence. 465 vitest tests
pass; `tsc --noEmit` clean; new regression tests guard PR-021/022/023/025/036.

**Blocker scoreboard now:**
1. Credentials on login page — ✅ fixed (W5).
2. Contract ceiling — ✅ **FIXED**: 5,000 blocked vs 3,600; auto-path prices at engine payable (PR-026/021).
3. Benefit usage/holds/PA — ✅ fixed (W5) + PR-022 partial-consumption fix.
4. Approval matrix — ✅ **FIXED**: FX correct, fails closed (PR-023), completed chains apply the decision (PR-025).
5. GL on settlement — ✅ fixed (W5) + PR-027 (no stranded claims) + PR-029 (voucher/statement surface).

**Remaining conditions before a GO sign-off (not code defects — process/scale):**
- **Enterprise-scale load unproven**: 10,000 lives / 2,000 facilities not yet bulk-loaded through the UI. This is the single largest open item — must be run before go-live.
- Seeded-password rotation on any exposed environment (script exists).
- PR-001 clean-install: db-push path documented + now scripted (`scripts/verify-install.md`); a from-scratch operator provision should be rehearsed once.
- The Client/Group/Member tiering was reviewed and confirmed correct (see DOMAIN_MODEL_Client_Group_Member.md) — no rework needed.

With the money-control and onboarding defects closed, the platform now answers
both spine questions YES (pays only what the contract says; can onboard a
corporate). The verdict moves from NO-GO to **CONDITIONAL GO**, conditioned on
the enterprise-volume proof and password rotation above.

---

## Final determination — W5 pass (2026-07-04 evening): **NO-GO confirmed** *(superseded by the post-fix determination above)*

Open Critical: **PR-026** (contract prices never constrain payouts — re-opened PR-014).
Open High in GO-critical areas: **PR-021** (auto-path pays engine-refer claims), **PR-023** (matrix fails open), **PR-025** (dual-band claims unpayable — approval loop), **PR-027** (settlement dead-end for late-approved claims), **PR-033** (no maker-checker on endorsements), **PR-036** (offline ops vanish), **PR-037** (quote→bind conversion crashes — corporate onboarding path dead), **PR-022** (PA reservation destroyed by first claim). PR-001 (clean install) still documented-only.

What genuinely improved this pass (verified, not assumed): credentials off the login page; holds/usage/PA-utilisation machinery real and visible; decision + settlement GL with vouchers and balanced TB; duplicate detection, future-DOS, over-PA gates; provider lifecycle + branches; draft-contract editing; HR portal; worker env; audit coverage. The platform's control *skeleton* now exists — but the two spine questions for a 10,000-life corporate ("can it pay only what the contract says?" and "can it onboard the corporate at all?") both still answer **no** (PR-026, PR-037).

Enterprise-scale proof (10k lives / 2k facilities bulk load, roster search at volume, export usability) remains **untested** — unproven scalability gap, not a pass.

## Conditions that survive even if all five verify

- Seeded password rotation on any exposed environment (PR-003 residual; script exists).
- PR-001 migration re-baseline not executed — clean-install path is documented (db-push) but unproven for a production operator.
- Enterprise volume unproven: 10k lives / 2k facilities not yet loaded through UI (scalability gap, not a pass).
- ~130 catalogued PRE_EXISTING_GAP unaudited actions; 287 legacy PAID claims (KES 21.5M) without GL trail flagged informational.
- Worker requires env-export workaround (PR-002) unless re-verified fixed.

Final determination will be issued at the end of the W5 pass.
