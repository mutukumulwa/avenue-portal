# F10.1 — Capitation Arrangement & Accounting Specification (CAP-1.0)

**Status:** DRAFT for sign-off · **GATED** (finance + legal + network + client + provider + product). **No schema or calculation ships before sign-off** (F10.1 stop; §D24; plan §21.10 PNO-CAP-008).
**Branch/commit:** `feat/provider-network-os` (F10.1). Governance artifact — like the F6.1 remittance spec / F7.1 field policy / F8.1 metric catalog. **No code, no schema, no data.**
**Definition version:** `CAP-1.0`. A material change to any rule below bumps the version; frozen periods retain the version they were computed under.
**Grounding:** every rule cites the REAL canonical fact field it reads (verified against `prisma/schema.prisma` on this branch). Where a field does not yet exist, it is called out as **[F10.2 additive]** — those are the ONLY new models, added after this sign-off.

---

## 0. Load-bearing principles (D24 — capitation is a separate governed ledger)

1. Capitation accrual + pool payment use **frozen eligible-life and rate snapshots** and a **dedicated reconciliation** — never today's live counts/rates (§D24; never use server-local "today", plan §1750).
2. A **zero-pay capitated encounter remains clinical utilization evidence** and is **never settled again as FFS** (§D24; PNO-CAP-004).
3. **Carve-outs follow the ordinary canonical claim/settlement rail** — capitation never becomes a second pricing engine (§8.14 close; §D24).
4. **Decimal money only**; conservation is exact (§7.13):

```text
opening balance + frozen accrual + approved adjustments − successful payments = closing balance
```

5. **Nothing activates** before this spec is signed AND a named pilot completes ≥3 reconciled periods with finance/provider go/no-go (F10.7; PNO-CAP-008).

---

## 1. Pilot selection (F10.1 step 1) — TO BE NAMED BY THE SPONSOR

One real arrangement is selected as the CAP-1.0 pilot. The existing platform already carries the **funding-model tagging** this pilot needs:

- `FundingModelType` (`prisma/schema.prisma:1987`): `FEE_FOR_SERVICE | CAPITATION | HYBRID` — a benefit line is already declarable as `CAPITATION` ("covered by the provider's capitation pool — no per-line payable", decision D8). This is the tag F10.5 keys on; **PMPM accrual + pool settlement do not yet exist** (plan gap §418).
- Pilot candidates in the existing contract/pricing vocabulary: `PER_VISIT_CASE_RATE` (schema:3937 — "Madison FCM / Jubilee capitation, fixed per valid visit with carve-outs") and the `CAPITATION` contract type (schema:3944). The pilot names ONE provider + client/group + package + branch scope.

**Sign-off records:** the named provider, client/group, package(s), branch scope, effective dates, rate basis, and currency.

---

## 2. `CapitationArrangement` fields (F10.1 step 2 · §7.13) — **[F10.2 additive]**

Effective-dated terms. Each field + its governing real anchor:

| Field | Definition | Grounding / anchor |
|---|---|---|
| tenant / provider / client / group / package / benefit / branch | The exact scope the arrangement governs | `Provider`, `Client`, `Group`, `Package`, `BenefitConfig` (schema:1992), `ProviderBranch@3190` — all existing |
| rateBasis | `PMPM` \| `PER_VISIT` \| `FIXED_PERIOD` | §7.13; the existing `PMPM` pricing note (schema:418 "accrued monthly from active-member counts, G2.3") |
| rate (Decimal) + currency | The effective per-member-per-month / per-visit / per-period rate | Decimal(19,4) convention (as `ProviderDisbursement`/`PaymentVoucher`); currency string (tenant/client currency, e.g. UGX) |
| cadence | Accrual period length (monthly for PMPM) | period-string convention `"YYYY-MM"` (schema:472) |
| coveredServices | Which services the pool covers | keyed by `BenefitConfig.fundingModelType = CAPITATION` (schema:1987) |
| ffsCarveOuts | Services explicitly EXCLUDED from the pool → ordinary FFS | `FundingModelType.FEE_FOR_SERVICE` lines + an explicit carve-out list |
| eligibilityDefinitionVersion | The signed eligible-life rule version (this doc's CAP-1.0) | frozen onto each `CapitationPeriod` snapshot |
| glPolicyRef | The GL/finance treatment reference | reuses the existing GL owner (`JournalEntry@5165` / `JournalLine@5190`) |
| approvalDates / effectiveFrom / effectiveTo | Governed lifecycle + non-overlap | effective-dated pattern (as `ProviderContract`, `MemberCoveragePeriod`) |

**Non-overlap rule (F10.2 test):** for a given (provider, client, group, package, branch, rateBasis) no two ACTIVE arrangements may have overlapping [effectiveFrom, effectiveTo).

---

## 3. Eligible-life definition (F10.1 steps 3–4 · F10.3) — grounded

**A life qualifies for a period iff, evaluated at the configured snapshot instant, it has canonical effective coverage in the arrangement's scope.**

- **Canonical coverage source:** `MemberCoveragePeriod` (schema:985) — `memberId`, `startDate`, `endDate?`, `reason` (`BINDING | ACTIVATION | REINSTATEMENT | TERMINATED | EXPIRED | LAPSED | BACKFILL`), `status`. A life is covered on day *D* iff a coverage period with `startDate ≤ D` and (`endDate` is null or `endDate ≥ D`) exists in scope.
- **Member facts:** `Member.status` (`MemberStatus`, schema:925 — must be an active state, not `PENDING_ACTIVATION`/terminated) + `Member.relationship` (`MemberRelationship`, schema:911 — `PRINCIPAL` + dependants counted per the arrangement's member-count definition).
- **Scope match:** the member's client/group/package must fall in the arrangement's scope.

**Snapshot instant (F10.1 step 4 — timezone/snapshot day):** the eligible-life snapshot is taken at **`period-start 00:00:00` in the tenant's configured timezone, persisted as UTC** (plan §1750 — never server-local "today"; §NFR-007 money+time). For a monthly PMPM period `YYYY-MM`, the default snapshot instant is the **first day of the month, tenant-midnight**. The pilot may instead sign off a **mid-month census day** or an **average-of-daily-counts** basis — recorded on the arrangement.

**Inclusion/exclusion recording (F10.3):** the snapshot records, per candidate life, `included|excluded` + a **reason code** (e.g. `COVERED`, `NOT_ACTIVE`, `NO_COVERAGE_ON_SNAPSHOT_DAY`, `OUT_OF_SCOPE`, `CARVE_OUT_ONLY`) + the **coverage source version**, and a **control hash** over the sorted (memberId, included, reason) set + a **member count**. A re-run over identical facts is a **no-op** (same hash); a late coverage change re-computes a DRAFT snapshot until freeze.

---

## 4. Rate + accrual (F10.1 step 6 · F10.4) — grounded

- **PMPM:** `accrual = frozenEligibleLives × effectiveRate` (Decimal), plus approved append-only adjustments.
- **PER_VISIT:** `accrual = countedValidVisits × rate` (visits from the linked capitated encounters — F10.5), carve-outs excluded.
- **FIXED_PERIOD:** `accrual = rate` (a flat per-period pool).
- **Rounding:** Decimal(19,4) with the arrangement's approved rounding rule (default: round half-up at the period total, not per-life — recorded on the arrangement). **No JavaScript floating-point** (§0.4).
- **Calculation version + control totals** (frozenLives, rate, grossAccrual, Σadjustments) are recorded on the period; a duplicate calculate over the frozen snapshot is idempotent.

---

## 5. Adjustments (F10.1 step 5 · §7.13 `CapitationAdjustment`) — **[F10.2 additive]**

Append-only, positive or negative, each with: `category` (e.g. `RETRO_ELIGIBILITY`, `RATE_CORRECTION`, `CLAWBACK`, `INCENTIVE`, `RECONCILIATION`), `evidence` reference, `period`, `amount` (Decimal), `actorId`, `approval` (maker/checker), and audit. **A correction after freeze is NEVER a silent rewrite** — it is the next period's adjustment or a governed reopen (F10.4 step 6; PNO-CAP-003).

---

## 6. Freeze / reopen / late-correction policy (F10.1 step 5)

1. A period is `DRAFT → CALCULATED → FROZEN → PAID → CLOSED` (maker/checker at freeze + at payable approval).
2. **FROZEN is immutable:** the eligible-life snapshot, count, rate, and gross accrual cannot change (PNO-CAP-003; F10.2 "frozen period immutability" test).
3. A **late correction** to a FROZEN period follows the **approved reopen policy**: either (a) an **append-only adjustment** in the current open period (default), or (b) a **governed reopen** (maker/checker + reason + audit) that supersedes with a new calculation version — the prior frozen version is retained as history.
4. **Reopen is gated** to the finance owner + logged; it never deletes a prior frozen record.

---

## 7. Encounters + carve-outs (F10.1 · F10.5) — grounded

- An **included capitated encounter/claim line** (`BenefitConfig.fundingModelType = CAPITATION`, schema:1987) is **tagged + linked to the arrangement/period**, **priced zero FFS payable**, and **hard-routed away from ordinary FFS settlement** (PNO-CAP-004). Its **clinical utilization is preserved** (the line/encounter still exists for reporting — never deleted).
- A **carve-out** (`FEE_FOR_SERVICE` or an explicit carve-out) flows the **ordinary canonical claim + settlement** rail unchanged (PNO-CAP-005).
- **The same service may not count as both** capitated and FFS without an explicit, audited split (F10.5 test).

---

## 8. Conservation + accounting entries (F10.1 step 6 · F10.6) — grounded, reuses F6 finance owners

The pool ledger reconciles through the **existing** finance rails — capitation adds NO new pricing/payment engine:

| Step | Reuses (real owner) |
|---|---|
| Accrual → provider-payable | `PaymentVoucher` (schema:4667) via the existing voucher owner |
| GL posting | `JournalEntry` (schema:5165) + `JournalLine` (schema:5190) — balanced double-entry |
| Actual disbursement fact | `ProviderDisbursement` (schema:7154, F6.7 — record/confirm) |
| Provider statement parity | the F6 remittance/statement read pattern |

**Conservation (must hold every period):** `opening + frozen accrual + approved adjustments − successful payments = closing` (§7.13). A failed/reversed payment does not reduce the balance until reversal is recorded (PNO-CAP-006/007).

---

## 9. Worked examples (F10.1 step 3) — the sign-off substance

Rate = **UGX 12,000 PMPM**, monthly period, snapshot = first-of-month tenant-midnight. (Illustrative — the pilot signs off the real numbers.)

| # | Scenario | Snapshot rule | Accrual |
|---|---|---|---|
| E1 | **Normal** — 1,000 lives covered all month | counted at snapshot instant | 1,000 × 12,000 = **12,000,000** |
| E2 | **Join mid-month** — a life whose `MemberCoveragePeriod.startDate` is the 10th | NOT covered at first-of-month snapshot ⇒ **excluded this period** (reason `NO_COVERAGE_ON_SNAPSHOT_DAY`); included next period. (A pro-rata basis is an arrangement option, signed off explicitly.) | unchanged |
| E3 | **Leave mid-month** — `endDate` on the 20th | covered at snapshot ⇒ **included, full PMPM** (PMPM is a census, not pro-rata, unless the arrangement signs off pro-rata) | +12,000 |
| E4 | **Dependant** — a `relationship ≠ PRINCIPAL` covered life | counted per the arrangement's member-count definition (default: each covered life = one member) | +12,000 each |
| E5 | **Retroactive eligibility** — a `reason = BACKFILL` coverage period added after freeze covering the snapshot day | FROZEN period is NOT rewritten; a **RETRO_ELIGIBILITY adjustment** (+12,000) posts to the open period | via §5 adjustment |
| E6 | **Rate change** mid-arrangement | the period uses the rate effective at the snapshot instant; a signed mid-period change is a new effective-dated arrangement (no overlap) | per effective rate |
| E7 | **Zero encounter** — a covered life with no visits | still a paid life under PMPM (the pool pays for coverage, not utilization) | full PMPM |
| E8 | **Carve-out** — an FFS-carved service rendered to a capitated member | flows the ordinary FFS claim/settlement; **not** in the pool accrual; the member's other covered services stay zero-pay capitated | FFS claim (separate) |

---

## 10. Sign-off surface (F10.1 · GATED)

CAP-1.0 activates only when **all six** owners sign, AND the F10.7 pilot completes:

| Owner | Confirms |
|---|---|
| Finance | conservation formula, GL/voucher/disbursement treatment, rounding, reopen policy |
| Legal | the arrangement terms + carve-out definitions + member-count basis |
| Network | provider scope, covered services, carve-outs, rate |
| Client | the funding model + eligible-life definition for their members |
| Provider | the pilot arrangement + statement format |
| Product | the versioned rules + the freeze/adjustment lifecycle |

**PENDING — no signatures captured.** Until all six sign: F10.2 schema is NOT added, F10.3–F10.6 do NOT activate, and no arrangement is created (D24; PNO-CAP-008).

---

*Governance artifact. No schema, code, or data was changed (F10.1 stop: no schema before sign-off).*
