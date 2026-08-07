# Diagnosis Gate — Authority Specification (DG-1.0)

| | |
|---|---|
| **Spec version** | DG-1.0 (amended 2026-08-07 — see §10) |
| **Status** | **DRAFT — awaiting sign-off (gate G-C0).** No protocol pack may be activated, and no shadow campaign may start, until §9 is signed. |
| **Owner (engineering)** | Claims platform |
| **Owner (clinical)** | *(to be named — §9)* |
| **Execution plan** | `/DIAGNOSIS_GATE_EXECUTION_PLAN.md` |
| **Source content** | `docs/diagnosis-gate/source/` (see `SOURCE_NOTES.md`) |

This specification is the clinical and business authority for the Diagnosis Gate. The
execution plan governs *how* it is built; this document governs *what it means* and
*what it is allowed to do*. Where the two disagree, this document wins on semantics and
the plan wins on sequencing.

---

## 1. What the Diagnosis Gate is

A new checking stage in the claims pipeline that, for a governed list of common
outpatient conditions, compares the **services billed on a claim** against
**clinically-authored rules for the diagnosis on that claim**.

It answers one question: *given the diagnosis this claim states, do the tests and
services billed make sense, and have they already been done recently?*

### 1.1 What it is not

- **It is not a clinical opinion on the patient.** It never sees symptoms, examination
  findings, test results, or notes. It reads codes on a bill.
- **It is not a treatment decision.** Nothing it does prevents a clinician from treating
  a patient. It affects only what is *reimbursed*, and in Rung 1 it does not even do
  that — it routes claims to a human.
- **It is not a fraud engine.** Fraud detection already exists separately and is
  unchanged by this work.
- **It does not replace the adjudicator.** Every clinical flag it raises is resolved by
  a person.

### 1.2 Why this is possible now

The rules below use only data the platform already receives on every claim: the coded
diagnosis, the coded service/test/drug lines, and the member's claim history. No change
to what providers send is required for Rung 1.

---

## 2. Settled decisions

These are binding. Changing any of them requires re-signing this specification.

| id | Decision | Rationale |
|---|---|---|
| **DG-D1** | **Clinical rules route to a human; they never deny a claim.** The sole exception is the repeat-window short-pay (DG-D13), which is separately gated and default-off. | A coding or protocol error must never auto-deny care costs. Routing is reversible; denial damages provider trust and invites disputes. |
| **DG-D2** | The **internal intervention group** (`CIG-nnn`) is the canonical key. ICD codes are *memberships into* a group, never keys themselves. | The clinical team's F1 answer. Groups are defined by *similar clinical intervention*, so one rule set serves many codes, and code-system churn never breaks the rules. |
| **DG-D3** | **Both ICD-10 and ICD-11 are accepted.** Memberships carry their code system; a claim's codes are looked up in both. | The platform and provider systems bill ICD-10 today; the workbook is ICD-11. Dual-accept removes the migration from the critical path. |
| **DG-D4** | The stage ships **record-only**: it evaluates and stores every rule hit but always passes the claim, until deliberately switched to routing. | Record-only *is* the shadow campaign. Measured evidence precedes any behaviour change. |
| **DG-D5** | Routing is enabled **per condition**, not globally. | Malaria can go live while a noisier condition keeps tuning. |
| **DG-D6** | Clinical content enters **only** through a governed pack import (convert → validate → draft → maker/checker approval → activate). No hand-edited rules, ever. | One reviewable, versioned, attributable clinical artifact. Engineering never authors medicine (execution plan §0.2). |
| **DG-D7** | A missing or ambiguous value in the workbook is a **validation error**, never a default or an inferred value. | Anti-hallucination contract. A silently invented rule is worse than a blocked import. |
| **DG-D8** | **Catch-all groups never go live.** Conditions that are categories rather than diagnoses (`Atopy`, `Viraemia/Bacteraemia of unknown origin`) import flagged and are permanently barred from routing. | If a broad label unlocks the automated path, claims migrate to it. Confirmed by v0: `Atopy` spans 109 ICD codes. |
| **DG-D9** | A **diagnosis-mix baseline is captured before the rules are communicated to providers.** | The only way to detect later gaming is to know what normal looked like beforehand. It cannot be captured retroactively. |
| **DG-D10** | Rung 2 (symptoms, drug baskets, results integration) does not start until the shadow campaign passes its exit gate. | Prevents the unproven from cannibalising the provable. |
| **DG-D11** | A diagnosis outside the governed groups **passes** by default. Narrowing the automated path to *only* governed conditions is a separate, explicit business switch. | The gate governs the conditions it knows; it does not silently seize the rest of the book. |
| **DG-D12** | Rules are evaluated **per claim line**, and a flag names the specific line and test. | Consistent with the platform's line-level adjudication; a reviewer must see *which* test is questioned. |
| **DG-D13** | **Repeat-window short-pay is the one money-touching rule**, is default-off, and requires its own finance + clinical sign-off (§9.2) beyond this specification. | Objective duplicate testing is the one clinically defensible auto-adjustment — but it moves money, so it is quarantined. |
| **DG-D14** | **A repeat window shorter than 24 hours cannot be enforced**, because a claim records a date of service, not a time. Such rules import with a warning, are recorded as **inert**, and are never evaluated. Windows of a day or more are measured in **whole calendar days**. | A 4-hour window on date-only data is wrong in both directions: two same-day tests 8 hours apart would always flag, and two tests 2 hours apart across midnight would never flag. Neither is the rule the clinician wrote, so the honest answer is to not run it and say so. Affects 4 of v0's 22 tests. |
| **DG-D15** | **Ambiguity never picks a winner.** If a claim's diagnosis codes resolve to more than one intervention group, **no rules are evaluated**; the claim passes and every candidate group is recorded. Import treats a code belonging to more than one group as a **blocking error**. | 85 of v0's ICD codes (12.7%) sit in several conditions — `CA09` is in Allergic Rhinitis, Nasopharyngitis *and* Pharyngitis. Which condition's rules run must be a clinical decision, not an accident of database row order. |
| **DG-D16** | **Content is accepted only where its status says a clinician settled it.** A remediated workbook that marks its own rows as pending, candidate or needing review has those rows **reported and refused**, never imported. | A status column is not a signature. The v0.1 annex proposed two confirmatory tests and two condition-merge decisions; accepting them would have switched a clinical rule on with nobody's name against it. |
| **DG-D17** | **Provider-facing text is the workbook's provider-facing text**, preferred over clinician shorthand where both exist. | *"No fever/history of fever"* tells a provider nothing they can act on. A message that cannot be acted on produces a phone call, not a corrected claim. |
| **DG-D18** | The pack records the **ICD release it targets** (e.g. "ICD-11 MMS 2026-01"), as a stated target only — not a claim that every code was checked against that release. | Codes move between releases. Recording the intended release makes a later mismatch findable; claiming verification we did not perform would not. |
| **DG-D19** | **Emergency bypass is a Rung-2 concept, not a Rung-1 rule.** It requires structured emergency evidence and must never be inferred from free text alone. | Genuine emergencies must not be routed for review — but a bypass triggered by keyword matching is an open door. It waits for structured evidence, per the clinical team's own wording. |
| **DG-D20** | **A catch-all diagnosis routes the claim to a human once the gate is live** — before any rule runs, and regardless of what the rules would find. DG-D8 bars a catch-all's *rules* from ever going live; this adds that the *claim itself* leaves the automated path. While the gate is record-only, the fact is recorded and counted, so the review volume this creates is measured before anyone switches it on. | Clinical directive of 2026-08-07 (Q7), and it is stronger than DG-D8 alone in the right way: under D8 a catch-all claim still sailed on and could auto-adjudicate through the other filters — exactly the "dumping ground" the directive names. A broad label is not a diagnosis; a person decides what it is worth. |

---

## 3. The rules (Rung 1)

All four run on data already present on a claim. Each produces either *nothing* or a
**flag** carrying the rule, the line, and a provider-facing message.

### R1 — Scope resolution
> *Which governed condition, if any, does this claim's diagnosis belong to?*

The claim's diagnosis codes are looked up in the active pack. If they resolve to an
intervention group, the group's rules apply. If they do not:

- **default (DG-D11):** the claim passes untouched;
- **optional strict mode:** the claim routes for standard human adjudication.

If **more than one** group matches, the claim is treated as unresolved: **no rules are
evaluated at all**, and every candidate group is recorded for the clinical team to
disambiguate in the next pack (DG-D15). There is no tie-break — running the first
group's rules would mean the engine had chosen a diagnosis, which is not its job.

This is why import blocks a code that belongs to two groups: the fix is a clinical
assignment, and until it is made those claims are simply not covered by the gate.

### R2 — Test supported by the diagnosis
> *Is this test one that this condition would call for?*

For each billed test that the pack marks as requiring a diagnosis, the claim's group
must be listed among that test's supported conditions. Otherwise: flag, using the
workbook's own provider-facing message (DG-D17) — e.g. *"Clinical indication is not
sufficiently documented in the available claim data for HIV."*

**Only tests explicitly marked `Requires_Diagnosis` are checked.** Tests that may
reasonably be ordered without a stated diagnosis are never flagged by R2.

### R3 — Repeat inside the clinical window
> *Was this same test already done for this member too recently to justify repeating?*

Each test carries a clinically-set repeat window (v0: 4 hours for random blood sugar to
90 days for HbA1c and lipids). If the member has the same test on an earlier claim
within that window, the repeat is flagged with the earlier claim's reference.

**Two known limits, both real ceilings on the control:**

1. **Only claims that reach Medvex are visible.** A repeat at a facility that never bills
   us cannot be seen.
2. **Windows under 24 hours do not run at all** (DG-D14). A claim carries a date, not a
   time, so an hours-scale window cannot be judged. Four of v0's 22 tests are affected —
   random blood sugar (4 h), malaria RDT, blood smear and electrolytes (12 h). They are
   recorded as inert and counted separately, so coverage figures never include a rule
   that is not running. Making them enforceable needs a performed-at timestamp on the
   claim line, or a window restated in days.

### R4 — Confirmatory test present
> *For a condition we expect to be confirmed by a test, is that test on record?*

Where the pack marks a condition as confirmable (e.g. malaria by RDT or smear), the
claim must carry the confirmatory test, or the member must have had it within the
condition's lookback window. Otherwise: flag.

**What this does and does not prove.** The platform receives no test *results*, so R4
can only confirm the test was **billed**, never that it was **positive**. It is a
completeness and deterrence control, not clinical verification. Verifying results
requires provider-system integration (Rung 3) and is out of scope here.

---

## 4. Failure semantics

This section replaces the workbook's empty `Claims filter` sheet.

| Rule | Record-only mode (launch) | Routing mode (per condition) | Ever denies? |
|---|---|---|---|
| R1 unresolved (no group, or **more than one**) | pass; recorded | pass (default) / route to standard adjudication (strict mode) | No |
| R1 resolves to a **catch-all category** (DG-D20) | pass; recorded | route → **Clinical review** queue, before any rule runs | No |
| R2 unsupported test | pass; recorded | route → **Clinical review** queue | No |
| R3 repeat in window | pass; recorded | route → **Clinical review** queue | No — unless DG-D13 short-pay is separately enabled |
| R4 confirmation absent | pass; recorded | route → **Clinical review** queue | No |

**"Not evaluated" is not a clinical pass.** A claim can go through this stage untouched
for three quite different reasons: no rule found anything wrong; its diagnosis resolved to
no governed condition or to several (DG-D15); or the rule that would have applied is inert
(DG-D14, or a rule with no supported conditions or confirmatory test recorded). Only the
first is evidence of anything. The shadow report separates them, and any coverage figure
that treats them alike overstates what the gate is doing.

**Every flag carries:** the rule, the specific claim line and test, an internal
explanation, a provider-facing message (from the workbook), and a member-facing message
that reveals nothing clinical beyond "your claim is being reviewed".

**Every routed claim** lands in a named review queue, is worked by a person through the
existing adjudication screens, and can be approved, adjusted, or declined by that
person on the normal authority rules. Reviewers may override any clinical flag; the
override is recorded.

**Appeals** follow the existing claim appeal path unchanged.

---

## 5. Governance of clinical content

- **One active pack per tenant.** A pack is the whole clinical content set, versioned
  and immutable once approved. Activating a new version supersedes the previous one.
- **Maker/checker.** The person who imports a pack cannot be the person who approves
  it. Approval runs through the platform's existing approval-matrix machinery under the
  action *Clinical protocol change*.
- **Provenance.** Every group, code, rule, window, and message traces to a row in a
  vendored workbook. Any code generated by the WHO ICD-10↔11 crosswalk is marked as
  generated and listed for clinical confirmation.
- **Named clinical owner** (§9) is accountable for content correctness, review cadence,
  and sign-off of each version.
- **Local anchoring.** v0 cites WHO and international textbooks. Before live routing,
  each pilot condition should also cite the applicable national Standard Treatment
  Guideline, so a disputed rule can be defended locally.

---

## 6. Pilot conditions

*To be completed by the clinical owner before G-C0.* Recommended selection criteria:
high claim volume, low clinical variance, reliable coding, and an objective
confirmatory test where applicable. Catch-alls are barred (DG-D8).

| # | Condition | Group code | Why chosen | Confirmatory test | Live-eligible |
|---|---|---|---|---|---|
| 1 | *(e.g. Malaria)* | | | | ☐ |
| 2 | *(e.g. Urinary Tract Infection)* | | | | ☐ |
| 3 | *(e.g. Pneumonia)* | | | | ☐ |
| 4 | *(e.g. Tonsillitis)* | | | | ☐ |
| 5 | *(e.g. Peptic Ulcer Disease / Gastritis)* | | | | ☐ |

Everything not listed here remains record-only regardless of pack contents.

---

## 7. Shadow campaign exit criteria

*Numeric targets to be set by the clinical owner and the claims lead before G-C0.* The
shadow campaign ends — and live routing may begin — only when **all** are met and the
exit memo is signed.

| # | Criterion | Target | Measured by |
|---|---|---|---|
| E1 | Sampled false-positive rate, per rule | ≤ ___ % | Clinician verdicts on sampled flags |
| E2 | Minimum flags reviewed, per rule | ≥ ___ per rule | Verdict count |
| E3 | Would-route volume as a share of gated-condition claims | ≤ ___ % | Shadow dashboard |
| E4 | Test-recognition (alias) coverage on lab lines | ≥ ___ % | Alias coverage report |
| E5 | Campaign duration | ≥ ___ weeks of live traffic | Campaign log |
| E6 | Baseline captured and committed before any provider communication | Yes/No | DG-D9 artifact |
| E7 | Unresolved/ambiguous group rate | ≤ ___ % | Shadow dashboard |

**Rationale for measuring before enabling:** a rule that fires on 30% of claims is not
a control, it is a re-routing of the entire book to the same humans it was meant to
free. E3 is the guard against that.

---

## 8. Explicitly out of scope (Rung 2+, gated)

Not built, not implied, not to be represented as present:

- Symptom and sign capture, in any form, and every rule that depends on it (the
  workbook's suspicion rules, minimum symptom/sign counts, red flags, duration, onset).
- Free-text clinical note ingestion, keyword matching, or model-based extraction.
- Drug and treatment baskets — **including pharmacy over-servicing control**, which the
  business team named its top problem. It is the highest-value Rung 2 item and needs a
  clinical-authored drug sheet that does not yet exist.
- Imaging appropriateness rules.
- Test-result ingestion from provider systems.
- Any migration of the platform to ICD-11.
- **Emergency bypass** (DG-D19). The concept is accepted: a genuine emergency should not
  be routed for review. It is parked here because it needs a structured emergency
  indicator on the claim, and inferring one from free text would create a phrase anybody
  could type to skip the gate. Until then, note that Rung 1 never denies a claim, so an
  emergency is at worst delayed by a human review, never refused by a rule.
- **Sub-day repeat windows** (DG-D14) — not out of scope by choice but by data: they need
  a performed-at timestamp the claim rails do not carry.

---

## 9. Sign-off

### 9.1 Specification sign-off (gate G-C0)

Signing means: the rules in §3 are clinically sound as *payment* checks; the failure
semantics in §4 are agreed; the pilot list §6 and exit criteria §7 are filled in.

| Role | Name | Date | Signature |
|---|---|---|---|
| Clinical owner (content authority) | | | |
| Claims / operations lead | | | |
| Product / engineering lead | | | |

### 9.2 Additional sign-off — repeat-window short-pay (gate G-C5.2)

Required **in addition** to §9.1, and only after the shadow campaign has passed, before
any claim line is reduced automatically (DG-D13).

| Role | Name | Date | Signature |
|---|---|---|---|
| Clinical owner | | | |
| Finance lead | | | |

---

## 10. Change log

| Version | Date | Change |
|---|---|---|
| DG-1.0 | 2026-08-06 | Initial draft for sign-off. Decisions DG-D1…D13; rules R1–R4; failure semantics replacing the empty `Claims filter` sheet. |
| DG-1.0 | 2026-08-07 | Amended before signature, so no re-signing is owed. Adds DG-D14…D19 from the v0.1 annex review: sub-day windows unenforceable and day-level arithmetic (R3/R4); ambiguity evaluates nothing (R1); annex acceptance status-gated; provider-facing wording preferred; ICD release target recorded; emergency bypass parked in §8. §4 gains the "not evaluated is not a clinical pass" statement. Three of these correct our own implementation, not the workbook. |
| DG-1.0 | 2026-08-07 | **DG-D20** added from the clinical leads' written directive (Claims Clinical Review, Q7): a catch-all diagnosis routes the claim to a human once the gate is live, not merely "its rules never fire". §4 gains the corresponding row. Built same day; inert until `clinicalGateEnabled`, like everything else. |
