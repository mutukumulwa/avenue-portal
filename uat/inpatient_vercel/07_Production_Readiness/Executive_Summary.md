# Inpatient UAT — Executive Summary (one page)

**System:** Medvex TPA — inpatient journey · **Env:** avenue-portal.vercel.app · **Date:** 2026-07-07 · **Method:** front-end UAT via Chrome, every actor as themselves, no DB edits.

## Verdict: NO-GO (conditional path defined)

We drove a real 5-day pneumonia admission for a live member (Mark Kato, NWSC) at a live hospital (Nakasero) end-to-end through the product's own screens — all the way to a paid, reconciled settlement. The **backbone is strong and the money engine is mostly sound** — but a **Critical control gap** (the member benefit ceiling isn't enforced) plus three High defects put this firmly **NO-GO** for inpatient launch.

### What works well (verified live)
- **Full money spine reconciles:** open case → attach approved PA → issue LOU → accrue 6 multi-day lines (exact 1,650,000) → "Close & file" → **exactly one** claim → contract-capped to **1,300,000** → dual underwriter approval → settlement → maker/checker → **PAID** → **balanced GL (Dr Claims Payable / Cr Cash 1,300,000)**. Approved = batch = paid = GL. Voiding a line correctly excludes it.
- **Separation of duties is genuinely robust** at every gate: the person who decides can't approve; a super-admin can't shortcut the required role; one approver can't fill both approval levels; settlement maker ≠ checker.
- **HMS daily feed is safe:** valid lines append, unmatched lines become reviewable exceptions, and **duplicate replay is idempotent** (no double charge).
- **Provider data is walled off** (one hospital can't open another's claim); **PA controls are tight** (decline, wrong-member, expired-PA all blocked).

### Why it is NO-GO
1. **Benefit ceiling not enforced (CRITICAL).** A member whose annual inpatient benefit was fully used up still had a new claim **approved in full, with zero member liability** — pushing their usage past the contracted limit. The payer would pay beyond what the benefit allows, with nothing recovered from the member. This is the core "can we overpay?" question answering *yes*.
2. **PA approval crashes on a normal action (High).** Typing a note in the optional "Notes" box on a pre-auth approval throws a **raw database error and prints the internal schema** to the screen; it works only if the note is left blank.
3. **Future/after-discharge charges accepted (High).** A line dated a month after discharge was added with no validation and inflated the bill.
4. **Intermittent 503 on settlement/approval (High).** Every settlement and approval action returned a server error while actually succeeding — it took several retries to pay the claim, and would look broken to an operator.
5. **Untested / config-blocked families:** oncology, maternity, transfers, FX, and the whole **package/bundled-pricing engine** (which is present in code but not wired up in this environment — 0 provider-package links).

### To reach GO (needs independent re-verification)
Fix the benefit-ceiling enforcement (Critical) and the three High defects; seed the package/eligibility config and complete those families; then re-run with no open Critical/High.

**Findings:** 1 Critical, 3 High, 2 Medium defects + 1 config blocker (worked around) + several observations/gaps. Full detail in `DEFECT_REGISTER.md`; step log in `E2E_RUN_LOG.md`.
