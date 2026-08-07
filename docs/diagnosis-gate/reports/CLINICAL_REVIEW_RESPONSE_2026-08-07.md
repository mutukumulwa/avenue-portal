# Engineering response — Claims Clinical Review (Q1–Q9)

| | |
|---|---|
| Responding to | Dr. Paul Makau's decision document, 7 Aug 2026 (Q1–Q9 / F1–F9) |
| Prepared | 7 Aug 2026, for the joint meeting |
| Platform state | All statements below describe code merged and deployed today. The clinical gate is **dormant in production**: no protocol pack is in force, and it changes no claim's outcome until deliberately switched on through the governed process. |

## The headline

Most of the "Engineering" column in your matrix is already built — several items landed
this week, some this morning. Two of your directives found real gaps, and one of those
(Q7) is **built as of today**. What blocks progress now is not engineering: it is four
clinical decisions, listed at the end.

## Question by question

**Q1 — Diagnosis keys.** Agreed, and done — with one request. The engine already keys
every rule on a stable condition code and treats display names as labels only. The
remediated workbook (v0.1) authored these as `CIG-001`–`CIG-040`, and they are imported
and tested. Please **adopt the CIG codes as the keys** rather than minting a parallel
`D01–D40` series — two competing key schemes would recreate the exact join problem F1 is
about. If the D-prefix matters, we rename once, together, before first activation.

**Q2 — Dual ICD-10/ICD-11.** Half done, half outstanding. The engine already accepts
both systems: every code membership carries its system, and a claim's codes are looked
up under whichever system they came in. What remains is populating ICD-10 memberships.
One design correction to your wording: we translate **content once at import time**
(reviewable, versioned, attributable), not claims at runtime — a runtime translation
layer would be invisible to audit, which your own Q9 logging requirement rules out. Also
note the WHO map is many-to-many with unmapped residuals, not a clean bijection; where
it is messy, the cleanest path is the clinical team authoring ICD-10 codes directly
against the CIG groups.

**Q3 — Complete coverage.** The engine already enforces your directive mechanically: an
unmapped condition is a **blocking import error**, so the pack cannot come into force
until the 5 gaps are filled. The validation report names the exact rows. One
clarification needed on scope — see decision 4 below.

**Q4 — Machine-readable lab links.** First half done this morning: the resolved
supported-diagnosis links from v0.1 are imported (the 29 free-text failures are now 0).
Second half — remodelling risk scenarios (STI assessment, occupational exposure,
pregnancy) as context flags — is genuinely new: no claim rail carries such a flag today,
so it sits with the symptom/sign work, not in the current phase. Note also that code
*ranges* ("ICD family code ranges") are not supported by design — memberships are exact
codes, so ranges must be enumerated.

**Q5 — Symptoms and signs.** Your directive is exactly how the engine is built: current
rules run strictly on coded billing lines, and every symptom/sign column in the workbook
is deliberately **read but not imported** — importing them would create rules that can
never fire and would overstate coverage. The controlled-vocabulary work is the agreed
future path. We would flag one internal difference: keyword-matching free text (raised
earlier as an interim idea) is the one approach we advise against — a phrase anyone can
type becomes a lever anyone can pull. Dr. Paul's controlled-vocabulary directive is the
safer version, and it is the one the specification records.

**Q6 — Treatment baskets.** Not built, and honestly stated as the highest-value item on
the next rung. The engine's line-matching machinery generalises to drug and imaging
lines, so the architecture is ready — but the critical path is the clinical deliverable:
the Treatment Baskets sheet, authored with the same discipline as the lab sheet (stable
keys, explicit statuses, sign-off column). Two cautions before anyone commits dates:
quantity/dosage/frequency limits depend on what pharmacy claim lines actually carry,
which we will audit and report rather than assume; and per the agreed sequencing, this
work starts after the shadow campaign proves the lab rules on live traffic.

**Q7 — Catch-alls. Your directive was stronger than what we had built — and you were
right. Built today.** Previously a catch-all could never *unlock* the automated path,
but the claim itself sailed on and could still auto-adjudicate through the other
filters — exactly the dumping-ground risk you named. As of this morning: once the gate
is live, any claim whose diagnosis resolves to a catch-all category routes straight to
clinical review, before any rule runs, regardless of findings. Recorded in the
specification as decision DG-D20, with your document cited. The three catch-alls flagged
in v0.1 (Atopy, Viraemia/Bacteraemia of unknown origin) are imported; the proposals
report lists further candidates (Arthritis 44 codes, Contact Dermatitis 42,
Hypertension 34…) awaiting your tag.

**Q8 — Failure logic.** Nothing to build: the matrix you describe **is** specification
§4, written to replace the empty Claims Filter sheet — route-to-human, zero
auto-denials, short-pay quarantined behind its own separate sign-off. What it needs is
the signature your directive commits the committee to. One data reality behind your
wording: you scope the short-pay exception to "objective, **time-stamped** duplicates" —
claims are **not** time-stamped; they carry a date of service only. Four tests with
hour-scale windows (malaria RDT and smear, random blood sugar, electrolytes) are
therefore recorded as unenforceable rather than guessed at. Until claims carry a
performed-at time, repeat detection operates at calendar-day resolution — your own
precondition, honestly applied.

**Q9 — Governance.** This answers the question that has been blocking everything: the
specification's signature block finally has names. Engine-side, your requirements
already hold: packs are versioned and immutable, every claim evaluation records the
exact pack version that judged it, and each workbook version is checksum-pinned so a
pack is traceable to exactly one source file. The v0.1 source register already cites the
Uganda Clinical Guidelines 2023 — local anchoring has a head start.

## The four decisions we need from the clinical team

1. **Assign each of the 85 overlapping ICD codes to exactly one condition.** This is the
   one issue none of the nine answers covers, and it is the largest remaining blocker:
   85 codes (12.7% of the mappings) belong to more than one condition — `CA09` sits in
   Allergic Rhinitis, Nasopharyngitis *and* Pharyngitis at once. The engine will not
   guess which condition's rules apply, so every such claim is currently covered by no
   rule. The v0.1 workbook's own ICD Mapping Review sheet already flags all 172 affected
   rows — the work queue exists.
2. **Sign off the confirmatory tests.** Both malaria confirmatory candidates are marked
   pending in v0.1, so rule R4 — "was the confirming test done?" — currently applies to
   **nothing**. Two signatures switch it on.
3. **Decide the two name merges** the remediation flagged for scope review: is "Eczema"
   the same condition as "Eczema (Atopic Dermatitis)", and "Acne" the same as "Acne
   Vulgaris"? We refused to decide this by text-matching.
4. **Clarify Q3's scope sentence.** "No unmapped diagnosis can enter the
   auto-adjudication pipeline" has two readings. Strict reading: *only* the 40 governed
   conditions may auto-adjudicate — the switch exists, but it would route every other
   diagnosis in the book to humans, a major volume decision. Narrow reading: the 40
   conditions cannot go live until fully mapped — already enforced. We have assumed the
   narrow reading; please confirm.

## What is deliberately still off

Nothing in any workbook is in force. Activation requires: the errors cleared, the pack
imported, a second clinician approving it, activation, and the gate flag — each a
separate, logged act. The shadow (record-only) phase then measures hit rates and
would-route volumes before any claim is actually diverted, and the four decisions above
are what stand between today and starting it.
