# Busy TPA Day — RE-VERIFICATION Verdict (Phase R)

**Date:** 2026-07-08 · **Target:** https://avenue-portal.vercel.app (Vercel prod, origin/main @ `dbca188`)
**Method:** independent re-test through the live UI as each persona + read-only API boundary probes.

## VERDICT: **NO-GO**

The BD-01..BD-05 remediation is **mostly successful** — four of five blockers are fixed and
verified live, and the money spine + GL are re-proven. But this pass **fails on a new
Critical** and **one High that reopens BD-04**, both found by hunting adjacent surfaces:

- **BD-06 (Critical):** a guessable, in-source **default operator API key** (`av-slade360-dev-key`)
  is **live in production** because `API_KEY` is unset in Vercel. It authenticates as an
  unscoped operator and exposes **every member's PII (name, DOB, gender, group, package) and
  every claim**, enumerable by member/claim number, plus claim **injection** on the write
  endpoints. Proven read-only (404-past-auth vs 401 for a bad key). This alone is stop-the-line.
- **BD-07 (High, reopens BD-04):** the contract-ceiling bypass the remediation claimed to close
  **still leaks for mixed claims** — bundle one coded line with an uncoded/unlisted line and the
  uncoded amount is approvable **at full billed with no override**. Proven end-to-end: CLM-2026-00295
  approved 83,500 and **settled to cash**, of which 80,000 was the uncoded line.

## Spine questions

1. **Can it pay only what the contract says?** — **NO.** Coded lines are capped, but an uncoded/
   unlisted line bundled with a coded one escapes the ceiling and pays at full billed (BD-07).
2. **Can member/claim data stay within its tenant/scope?** — **NO.** Provider *portal* isolation
   is solid, but the default operator API key exposes all-member PII and all claims (BD-06).
3. **Can money leave only with the required approvals?** — **Mostly YES.** Maker/checker
   segregation, GL balance, and settlement controls all hold — but the amount that leaves can be
   inflated by BD-07.

## Blocker scoreboard (independent re-verification)

| ID | First-pass | Re-test | 
|---|---|---|
| BD-01 RBAC escalation | High | ✅ FIXED-VERIFIED |
| BD-02 intake dup | Low/Med | ✅ FIXED-VERIFIED (2-min window; by-design beyond) |
| BD-03 login 503 | Critical | ✅ FIXED-VERIFIED (6/6 role logins clean) |
| BD-04 ceiling bypass | High | ⚠️ PARTIAL → reopened as **BD-07 (High, OPEN)** |
| BD-05 stranded settlement | High | ✅ FIXED-VERIFIED (supplementary Run 2) |
| **BD-06 default API key** | — (new) | 🔴 **CRITICAL, OPEN** |

## What is genuinely strong (verified live)
- Money spine intake→adjudicate→maker/checker→settle→**balanced GL** (9,548,180=9,548,180),
  only approved amounts post; maker self-approve blocked; supplementary settlement run works.
- Contract ceiling fail-closed for coded lines; RBAC nav trimming + branded Access Denied;
  provider portal facility-scoping (claims + settlements); login stability restored.
- Error feedback improved (on-page banners, not blank pages).

## Blocking issues (why each blocks)
1. **BD-06 Critical** — mass PII disclosure + claim injection via a shipped default key. Regulatory
   (DPPA) + fraud exposure; trivially exploitable. **Fix before any go-live.**
2. **BD-07 High** — contract ceiling (a core money control) bypassable on realistic mixed claims;
   fail-toward-overpay with the UI pre-filling full approval. Waivable only by ops+finance with a
   compensating manual control — not recommended.

## Conditions that survive even if BD-06/BD-07 are fixed
- **Untested surfaces (residual risk):** member IDOR, HR/Fund/Reports data scope, fraud gate ON
  (ADJ-12), inpatient money path, preauth, reports/CSV export tie-out — none cleared this pass.
- **N3 (data model):** co-tenant employers under a shared client aren't isolated at the API
  member-scope layer (Med).
- **OBS-1:** KES-magnitude tariff data mislabelled UGX (cross-border pricing integrity).
- Scale (2,997 members claimed) not load-verified this pass.

## Scope caveat
Re-verified: all 5 prior blockers, money spine + GL, provider isolation, RBAC, login across 6
roles, intake/adjudication/settlement. Newly found: BD-06, BD-07. Not tested: the residual list
above. A NO-GO stands on BD-06 alone; BD-07 independently blocks the "pay only the contract" spine.

## Path to GO
1. Fix **BD-06** (set/rotate `API_KEY`, delete the default fallback, tenant-bind operator scope).
2. Fix **BD-07** (unpriced lines contribute 0 to the ceiling on both engine + FFS branches).
3. Re-run this pass + clear the untested residual list (member/HR/fund/reports scope, fraud gate,
   inpatient, preauth) before flipping to GO.
