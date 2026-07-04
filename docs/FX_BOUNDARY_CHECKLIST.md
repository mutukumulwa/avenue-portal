# FX Boundary Checklist (PR-017 #2)

Every amount-threshold comparison in the platform, audited for currency
correctness on 2026-07-04 as part of the UAT remediation. Base currency is UGX
(AD-2); claims and provider contracts in the demo book are KES.

**Rule:** any comparison between a transaction amount and a configured
threshold must normalise both sides to base via `FxService.normalise` using the
rate in force at the decision date. A missing rate must fail safe (route to
review / most demanding path), never fall through to identity.

| # | Boundary | Location | Status |
|---|---|---|---|
| 1 | Approval-matrix bands (CLAIM_PAYMENT and all action types) | `approval-matrix.service.ts` `resolve()` | ✅ Fixed: request amount + rule bands normalised as-of decision date; missing rate → fail-safe to most demanding rule (`failSafe: true`) + ExceptionLog at the claim-decision call site. Unit tests in `tests/services/approval-matrix.service.test.ts`. |
| 2 | Claim decision entry (was hard-coded `currency: "UGX"`) | `claim-decision.service.ts` `decide()` | ✅ Fixed: passes `claim.currency`; claims stamped with currency at every intake channel (`ClaimsService.resolveClaimCurrency`), backfill via `scripts/backfill-claim-currency.ts`. |
| 3 | Auto-adjudication ceiling (`maxAutoApproveAmount`, seed default UGX 100,000 vs KES claims) | `auto-adjudication.service.ts` `evaluateClaim()` | ✅ Fixed: both sides normalised; missing rate → `FX_RATE_MISSING` route. |
| 4 | Senior-approval threshold (`SENIOR_APPROVAL_THRESHOLD_KES`, was denominated differently than the matrix) | `claim-adjudication.service.ts` | ✅ Removed with the duplicate stack (W1.1) — the approval matrix is the only banded control. |
| 5 | PA auto-approve ceiling (`AUTO_APPROVE_CEILING_KES = 50,000`) | `preauth-adjudication.service.ts` gate 6 | ⚠️ Documented exemption: PAs carry no currency column; estimates are KES in the demo book and the ceiling is KES-denominated, so the comparison is internally consistent. Revisit when PA currency is modelled. |
| 6 | Member PA auto-approve ceiling | `member-preauth.service.ts` | ⚠️ Same exemption as #5 (same KES-vs-KES comparison). |
| 7 | Fraud rule thresholds (per-rule amounts) | `fraud-engine.service.ts` / seeded `FraudRule` rows | ⚠️ Documented exemption: rules are tenant-seeded in the tenant's working currency and compare against same-book amounts; flagged for the fraud workstream when multi-currency books land. |
| 8 | Fund balance alerts (self-funded minimum balance) | `fund-balance-alert.job.ts` | ⚠️ Exemption: `SelfFundedAccount.currency` and its balances/thresholds are stored in the same currency per account — no cross-currency comparison occurs. |
| 9 | Analytics MLR inputs | `analytics.service.ts` | ⚠️ Exemption: ratios over same-book premium/claims; consolidated multi-currency reporting goes through `FxService.consolidate`. |
| 10 | Settlement batch totals | `claim-adjudication.service.ts` settlement | ⚠️ Exemption: totals aggregate claims of a single provider whose claims share the provider-contract currency; GL posts nominal amounts. Flag if a provider ever bills in mixed currencies. |
| 11 | Override financial-impact caps (`maxFinancialImpact`, `dualApprovalThreshold`) | `override.service.ts` | ⚠️ Exemption: impacts are computed and stored in the claim's currency; controls are tenant-configured in the same working currency. |

Legend: ✅ converted + unit-tested · ⚠️ documented exemption (no cross-currency
comparison today) — each exemption names the trigger that would promote it to
a required conversion.
