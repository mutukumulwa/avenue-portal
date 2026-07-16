# P1 — Benefit-limit product decisions (recorded before implementation)

**Recorded:** 2026-07-16 · **Decided by:** Arthur Mulwa ("proceed with all starred defaults",
FULL GO closure plan DEC-02..06) · **Required by:** `TPA_PRIORITY_SIX_EXECUTION_PLAN.md` §"P1 decisions
that must be recorded before implementation". Directors may override at the review meeting
(`uat/FULL_GO_DECISIONS_FOR_DIRECTORS_2026-07-16.docx` Part A); an override reopens the affected code.

| # | Question | Decision |
|---|----------|----------|
| 1 (DEC-02) | Does utilization consume the covered allowed amount or only the payer-paid share? | **Preserve the current `approvedAmount` basis.** Usage = the amount approved for payment. |
| 2 (DEC-03) | Is `Package.annualLimit` a hard overall ceiling in addition to category sublimits? | **Yes when populated** (> 0) and contractually presented as an annual limit. |
| 3 (DEC-04) | When an approval request exceeds available benefit: hard-block, cap-to-available, or override? | **Hard-block and offer an explicit partial-approval amount equal to availability; never silently cap.** No named benefit-limit override path exists at launch. |
| 4 (DEC-05) | Does a dependant consume a family pool rooted at the principal? | **Yes** for `SharedLimitGroup.appliesTo = FAMILY`: the pool aggregates the principal and all dependants. |
| 5 (DEC-06) | What happens if a dependant is temporarily orphaned (no resolvable principal)? | **Fail closed** for family-limit calculation and **raise a data-quality exception** (`ExceptionLog`); the decision is blocked until membership data is corrected. |

Supplementary implementation rulings (within the plan's discretion):

- **Per-visit limits** (`BenefitConfig.perVisitLimit`, `Package.perVisitLimit`) participate as
  `PER_VISIT` constraints in the same availability result; reason code `BENEFIT_PER_VISIT_EXCEEDED`
  (added alongside the plan's five codes — same family, same semantics).
- **Concurrency control:** `Serializable` transaction isolation with bounded retry (3 attempts) on
  Prisma `P2034`; exhaustion surfaces `BENEFIT_CONCURRENCY_RETRY` as an operator retry message,
  never a denial (plan P1.2/P1.3/P1.5).
- **Period resolution** uses the claim's **service date** (plan P1.1 rule 1); cross-member family
  aggregation matches usage rows overlapping the treated member's benefit period (family members may
  have different enrollment anniversaries).
