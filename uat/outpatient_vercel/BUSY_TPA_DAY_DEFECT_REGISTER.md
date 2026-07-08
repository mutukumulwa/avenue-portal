# Busy TPA Day E2E UAT — Defect Register

Run: 2026-07-08 · Target: https://avenue-portal.vercel.app (Vercel prod, origin/main @ 97b2478) · UI-only.
Personas as themselves. Evidence = screenshots/network/GL captured in `BUSY_TPA_DAY_E2E_UAT_RUN_LOG.md`.

Severity model (from plan §2): Critical = stop-the-line; High = release blocker unless waived by ops+finance; Medium = own before go-live; Low = opportunistic.

| ID | Sev | Area | Title | Repro (persona → steps) | Observed vs Expected | Re-test |
|---|---|---|---|---|---|---|
| **BD-03** | **Critical** (availability) | Auth / infra | `/post-login` intermittently 503s → **blocks ALL logins** | Any user → /login → correct creds → Sign In. Mid-session, `GET /post-login?_rsc=… → 503` (repeat), console **React #419** (SSR Suspense abort). Reproduced for provider AND admin across ~10 attempts + 15s wait. | Obs: button stuck "Signing in…", session never established, direct nav → branded Access Denied. Exp: land in portal. Auth succeeds but post-login route SSR-fails. | OPEN |
| **BD-04** | **High** (money control) | Adjudication | Contract ceiling is **CPT-gated** → CPT-less/unlisted lines escape the cap; approved defaults to **full billed** | Claims Officer → adjudicate a line with a matching CPT (OP-1 99213) → hard ceiling UGX 3,500 enforced. Same category line WITHOUT a CPT (OP-6 consultation) → "No contract ceiling — reviewer judgement applies", Approved pre-filled = full 80,000, decision default Approve(Full). | Obs: a contracted service billed without its CPT bypasses the tariff ceiling; dangerous full-billed default. Exp: contract ceiling should bind by service, not only by CPT presence; default should be conservative. Mitigation: double-capture/fraud routing to manual review. | OPEN |
| **BD-05** | **High** (settlement workflow) + Medium UX | Settlement | Cannot create 2nd batch for same provider+cycle → later-approved claims **stranded**; failure is **silent** | Finance maker → /settlement → Aga Khan + July 2026 → Create Batch. A settled Jul-2026 Aga Khan batch already exists. | Obs: no batch created, **no on-page banner** (error only in `?error=Settlement batch already exists for this provider and cycle`). July-DOS approved claims can't be settled in July cycle. Exp: either allow a supplementary batch or clearly surface the block. (Workaround: use a free cycle month — worked.) | OPEN |
| **BD-01** | High (needs verify) | Admin / RBAC | Update Access role dropdown can't represent PROVIDER_USER → shows **SUPER ADMIN**; Save may escalate | Admin → /settings → any provider-user row. Role dropdown option list omits PROVIDER USER → renders first option "SUPER ADMIN". | Obs: careless Save on that row could POST role=SUPER_ADMIN, escalating a facility user to full admin. Exp: dropdown reflects PROVIDER_USER / cannot silently change role. **NOT yet confirmed** what Save posts (blocked by BD-03 before safe test on a throwaway). | OPEN (unverified) |
| **BD-02** | Low→Medium | Claim intake | Duplicate claim **not blocked at intake** (but detected & routed at adjudication) | Provider A → file claim identical to CLM-2026-00290 (member/DOS/service/amount). | Obs: created NEW claim CLM-2026-00294 (no intake block). **Mitigation confirmed:** adjudication timeline flags *"Double-capture: claim for same provider/member/date/category already exists (CLM-…)"* and routes to manual review with the duplicate numbers. Exp: routed-not-silent = acceptable per plan; residual risk if reviewer ignores warning + no hard block. | Mitigated |

## Observations (not ranked defects)
- **OBS-1 (data integrity):** Aga Khan (Kenya) tariff rates are KES-magnitude numbers now labelled UGX (consultation "UGX 3,500" ≈ real KES 3,500) — legacy de-KES relabel without FX conversion. Affects cross-border/Kenya-facility contracted rates.
- **OBS-2 (UX systemic):** server-action errors are delivered via `?error=` URL param and the page often blanks/no-banner (seen on BD-05, FIN-03 maker/checker block, ADJ-10 over-ceiling). Controls work but feedback is poor → invites re-submission.
- **OBS-3 (config gap):** approval matrix has no explicit rule for OUTPATIENT > UGX 200,000 (only INPATIENT 200k+ dual). Behaviour for high-value outpatient falls to default — confirm intended.
- **OBS-4 (minor):** claim-detail routes use internal IDs; the CLM-2026-xxxxx display number 404s (generic Next 404 within app shell).
- **OBS-5 (reliability, same root as BD-03):** intermittent 503 on provider RSC routes (`/provider/settlements`, `/provider/api-keys`, claim-detail prefetch) and POST `/provider/claims/new` (returned 503 yet still created the claim → risks duplicate re-submission).

## Verified-strong (give the system its due — proven live this run)
- Money spine end-to-end: provider intake → capture → adjudicate → maker/checker settlement → **balanced GL** with only approved amounts posting.
- Contract ceiling **fail-closed** when CPT present (ADJ-10 over-ceiling BLOCKED, no side effect).
- Partial approval excludes rejected line (OP-6: 30,000 pharmacy not settled/posted); decline no payable (OP-7); duplicate detected & routed.
- Maker/checker segregation enforced (FIN-03); duplicate settle not reachable (FIN-06).
- RBAC nav trimming per role; provider facility-scoped to own claims; branded Access Denied page.
- Prior blocker **PR-V02 (settlement Mark Paid) verified resolved**; de-KES→UGX live; full-name member search (E2E-D01) live.

## Remediation status — 2026-07-08 (code fixed on `main`, pending live Vercel re-verify)

All Critical/High defects have root-cause code fixes with regression tests. Local gate is green: **561/561 vitest**, `tsc` clean, `currency:guard` + `brand:guard` OK, `next build` OK. NOT yet committed/deployed — the live role-login matrix + IDOR re-probe (plan §13) remains the user's Vercel step.

| ID | Fix shipped | Where | Regression test |
|---|---|---|---|
| **BD-03** | `/post-login` is now an HTTP **route handler** (`route.ts`), not an RSC page — reads the session directly and returns a 307 redirect; login form navigates with a full document load (`window.location.assign`) so nothing is prefetched as RSC. Verified locally: unauth `GET /post-login → 307 /login` (no 503). | `src/app/post-login/route.ts`, `src/lib/post-login.ts`, `src/app/(auth)/login/page.tsx` | `tests/lib/post-login.test.ts` |
| **BD-04** | Two layers: (1) CPT-less lines now bind to the tariff by **exact service description** (serviceName/standard/provider desc), not only CPT; (2) an active contract with **no enforceable price** returns a deterministic ceiling **0 + `unpriced`** (not `null`), so the UI defaults approved to 0 and `decide()` blocks full-billed approval unless a `PAY_ABOVE_CONTRACT_RATE` override is approved. | `provider-contracts.service.ts`, `claim-decision.service.ts`, `claims/[id]/page.tsx` | `provider-tariff-desc-match.test.ts`, `claim-decision.service.test.ts` (assessCeiling/BD-04) |
| **BD-05** | `ProviderSettlementBatch` gains `sequence` (unique key now includes it). `createSettlementBatch` creates supplementary runs (Run 2, 3…) for late-approved claims when prior same-cycle runs are SETTLED/REJECTED; blocks while an **open** run exists; still scoops only unbatched claims + single-currency guard. Run label shown in admin list/detail + provider portal. | `prisma/schema.prisma`, `claim-adjudication.service.ts`, `settlement/page.tsx`, `settlement/[id]/page.tsx`, `provider/settlements/page.tsx` | `settlement-supplementary-batch.test.ts` |
| **BD-01** | Inline "Update Access" now lists only **staff** roles and **locks portal-user rows** (role preserved via hidden field, active-toggle only). `updateUserAccessAction` validates server-side: unknown role rejected, portal→staff and staff→portal role changes rejected (must use Invite). | `constants.ts`, `settings/page.tsx`, `settings/actions.ts` | `settings-update-access.test.ts` |
| **BD-02** | Provider claim submit already disables while pending; added a **2-minute duplicate guard** (same facility/member/date/amount) that surfaces the existing claim number instead of creating a second claim after a retried/failed submit. Adjudication-time double-capture routing unchanged. | `provider/claims/new/actions.ts` | (covered by intake tests; guard is a soft-block) |
| **OBS-2** | Error banners already render on both observed money pages (`/settlement`, `/claims/[id]`) via `searchParams.error`; the BD-03 RSC fix removes the blank-after-503 path that produced the "no banner" symptom. | — | — |

**Still owner/config items (not code-blocking):** OBS-1 (Kenya/KES-magnitude tariff data policy), OBS-3 (approval-matrix rule for OUTPATIENT > UGX 200k), OBS-4 (CLM display-number 404). These need a product decision, not a guessed default.
