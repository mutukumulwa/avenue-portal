# Busy TPA Day — Adversarial Resilience (BB2) — Defect Register

Run: 2026-07-13 · Target: https://avenue-portal.vercel.app (Vercel prod @ `33e005b`). UI-driven as each persona + black-box API probes. Evidence: `BUSY_TPA_DAY_ADVERSARIAL_RESILIENCE_RUN_LOG.md`.

## Prior-blocker re-verification (fresh evidence this pass)
| ID | Prior sev | Re-test | Evidence |
|---|---|---|---|
| BD-06 default operator API key | Critical | ✅ FIXED-VERIFIED | retired + random key both **401** on `x-api-key`+`Bearer`; fail-closed parser matrix |
| BD-07 mixed coded+uncoded ceiling | High | ✅ FIXED-VERIFIED | CLM-2026-00297 ceiling **3,500** (uncoded excluded), 83,500 approve **server-blocked** |
| BD-03 `/post-login` outage | Critical | ✅ FIXED-VERIFIED | admin + provider persona login clean, no 503 |
| BD-05 stranded settlement | High | ✅ FIXED-VERIFIED | Aga Khan Jul 2026 **RUN 2** supplementary batch created |
| BD-02 intake dup guard | Low/Med | ✅ UI holds; ⚠️ API gap → BB2-DEF-03 |

## New defects this pass (none Critical/High)
| ID | Sev | Family/Test | Rail | Title | Repro → Observed vs Expected | Impact | Status |
|---|---|---|---|---|---|---|---|
| **BB2-DEF-01** | Medium | B-04 input boundary | API | Negative billed amount accepted at intake | `POST /api/v1/claims` `unitCost:-5000` → **201, CLM-2026-00302 billedAmount −5,000** (visible in staff queue as "UGX -5,000"). Exp: reject qty/price ≤ 0. | Invalid financial data materialises; corrupts billed totals/reports. Contract engine floors payable at 0, so no negative-money leak. Likely UI-vs-API parity gap. | OPEN |
| **BB2-DEF-03** | Medium | E-02 / needle #7,#19 | API | No intake duplicate/idempotency guard on API | 3× identical `POST /claims` → **3 distinct payable claims** (00303/04/05), no idempotent response. UI has a 2-min guard. Exp: honor a client idempotency/`externalRef` key; return original on retry. | Automated HMS retry after timeout creates claim clutter. **Mitigated** by synchronous cross-rail double-capture detection at capture (explicit sibling listing) → no silent double-payment. | OPEN (mitigated) |
| **BB2-DEF-02** | Low | §24 robustness | API | Raw 500 on malformed `diagnoses` | `POST /claims` `diagnoses:[{code:"I10"}]` (object vs string) → **HTTP 500 "Internal Server Error"**. Exp: 400 validation message. | Robustness gap; no data/secret leak. | OPEN |

## Observations (logged, not ranked as defects)
| ID | Sev | Title | Note |
|---|---|---|---|
| N3 | Medium | Shared-client sibling-group exposure (privacy) | `/clients`: "Medvex — Default Client" holds **6 distinct employers** (Twiga, Bamburi, EABL, KCB, Safaricom, Patricia) as sibling groups under one payer; provider/API entitlement scopes by client → a provider entitled to the Default Client can read member PII across all 6 unrelated employers. NWSC correctly isolated (own client). Architectural confirmation of prior N3; fix = own-Client-per-employer or group-level entitlement. |
| OBS-K1 | Low | Login rate-limit gives no user feedback | After ~10 rapid login cycles, an IP login throttle trips → new logins silently no-op (no request/error/message); existing sessions unaffected. Good control, poor feedback — add a "too many attempts, retry in N min" message. |
| OBS-B7 | Medium | Ceiling display inconsistency | Read-only "Contracted total 83,500" preview contradicts enforced 3,500 ceiling on the same adjudication page. Enforcement is correct; the preview should reuse `assessCeiling`. |
| OBS-H1 | Medium | Fraud/dup flags don't gate approval or settlement | Fraud-flagged CLM-2026-00297 was approved AND scooped into a settlement batch with no fraud block. Advisory-only. Money-impact nil here (amount legit), but the control should quarantine flagged claims from settlement until cleared. |
| OBS-A1 | Low | Eligibility vs claim-read scope asymmetry | API eligibility 404s for a member the provider has a paid claim for (client-entitlement scope) while claim-read returns it. Fails safe. |
| OBS-A2 | Info | API accepts existing-non-entitled member for claim write | Defensible split (providers file; TPA adjudicates entitlement) — confirm intended. |
| OBS-A3 | Low | API claim `diagnoses` not attached | API-created claim shows empty DIAGNOSES panel; UI claim attaches it. Data-fidelity gap. |

## PASS highlights (adversarial probes that held)
- API **facility scope** (Aga key → IHK claim = 404 non-enumerable); **facility attribution** (body `providerCode` IHK/bogus/empty all forced to Aga Khan — no cross-facility write).
- **Auth fail-closed** on missing/empty/bad key; default operator key dead on both header forms; revoked key 401 on read+write.
- **Contract ceiling** server-enforced; over-ceiling approve blocked.
- **Maker/checker SoD** enforced (self-approve blocked); **GL balanced**; **supplementary run** works; **double-capture detection** cross-rail with sibling listing.
- Member-existence + future-date validation on the API.

## Severity rationale
No Critical/High this pass. BB2-DEF-01/03 are Medium because the downstream money-leak is blocked (negative floors at 0; duplicates caught by double-capture) — the defects are intake-validation/parity gaps, not open financial leakage. OBS-H1 is a genuine control gap (fraud should gate settlement) but caused no wrong payment in evidence, so Medium. BB2-DEF-02 is Low (robustness only).
