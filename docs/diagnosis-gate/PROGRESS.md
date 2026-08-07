# Diagnosis Gate — Progress

Resume point for any session. Authority: `/DIAGNOSIS_GATE_EXECUTION_PLAN.md`.
Clinical semantics: `docs/diagnosis-gate/DIAGNOSIS_GATE_SPEC.md`.
Detail per package: `IMPLEMENTATION_LOG.md`.

**Branch:** `feat/diagnosis-gate` (off `origin/main` @ `3ac6b2c`).
**Baseline on branch:** tsc exit 0 · vitest 1569 passed / 501 skipped / 0 failed.
**Current:** tsc + eslint clean · hermetic **1680 passed / 559 skipped / 0 failed** · **58/58 DG real-DB tests** (opt-in).
**Phases C0–C3 COMPLETE · PHASE C7 COMPLETE (C7.1–C7.5).** Next: C1.4 crosswalk · C1.5 alias coverage · C4 shadow campaign (all blocked on **G-C0**).

| Pkg | Title | Status |
|---|---|---|
| C0.1 | Authority spec + decision log | ✅ DONE — DG-1.0 DRAFT, awaiting G-C0 signature |
| C0.2 | Vendor workbook + SOURCE_NOTES | ✅ DONE |
| C0.3 | Branch/env bootstrap | ✅ DONE — 2 anchor drifts found and plan corrected |
| C1.1 | Additive schema | ✅ DONE — additive proof vs populated DB |
| C1.2 | Pack service + governed lifecycle | ✅ DONE — 11/11 real-DB lifecycle proof |
| C1.3 | Converter + validator + v0 red report | ✅ DONE — v0 NOT IMPORTABLE, 66 errors reported |
| C1.4 | WHO crosswalk ingestion | ⬜ may be BLOCKED-EXTERNAL |
| C1.5 | Alias coverage report | ⬜ needs claim data |
| C2.1 | CLINICAL stage skeleton + routes + queue | ✅ DONE — inert with no pack; 13/13 real-DB |
| C2.2 | R2 lab↔diagnosis compatibility | ✅ DONE |
| C2.3 | R3 repeat window (DB suite) | ✅ DONE — total-order tie-break proven |
| C2.4 | R4 confirmation-present | ✅ DONE |
| C2.5 | Shadow read service | ✅ DONE — dormant rows excluded from rates |
| C3.1 | Permissions + matrix + ensure-script | ✅ DONE — W1+W2 closed, idempotency proven |
| C3.2 | Protocol library UI + import | ✅ DONE — walkthrough found 2 real bugs |
| C3.3 | Governance E2E (maker/checker/activate) | ✅ DONE — clicked through maker→checker→in force |
| C3.4 | Policy flags + claim-detail surfacing | ✅ DONE — W6+W7 closed |
| C3.5 | Capability resolution (prod authorisation fix) | ✅ DONE — feature was inoperable in prod without it |
| C4.1 | Baseline snapshot | ⬜ must precede any provider comms (DG-D9) |
| C4.2 | Shadow dashboard + verdicts | ⬜ |
| C4.3 | Campaign runbook + exit memo | ⬜ **G-C4 human gate** |
| C5.1 | Per-condition go-live verification | ⬜ blocked on G-C4 |
| C5.2 | Repeat-window short-pay | ⬜ **G-C5.2 human gate** |
| C5.3 | Comms pack + drift monitoring | ⬜ |
| C6.x | Rung-2 backlog | ⬜ blocked on G-C4 |
| C7.1 | R3/R4 day-level + sub-day inertness | ✅ DONE — real correctness bug fixed |
| C7.2 | R1 no-winner ambiguity + V11 | ✅ DONE — row-order tie-break removed |
| C7.3 | Converter reader hardening | ✅ DONE — SheetJS (dev-only); v0 pack byte-identical |
| C7.4 | v0.1 annex intake + red report | ✅ DONE — 151→109 errors; still NOT IMPORTABLE |
| C7.5 | Spec DG-D14–D19 + docs + comms framing | ✅ DONE — spec amended pre-signature; framing generated, not typed |

## Open human gates

- **G-C0** — clinical owner signs `DIAGNOSIS_GATE_SPEC.md` §9.1, and fills §6 (pilot
  conditions) + §7 (numeric exit criteria). Blocks pack activation and the shadow campaign.
- **G-C4** — shadow exit memo. Blocks all of C5 and C6.
- **G-C5.2** — finance + clinical sign-off for repeat-window short-pay.

## Safety property

Nothing in this engagement changes platform behaviour until (a) a protocol pack is
imported *and* approved *and* activated, and (b) `clinicalGateEnabled` is deliberately
switched on. Deploying every completed package with default settings leaves adjudication
behaviourally identical.
