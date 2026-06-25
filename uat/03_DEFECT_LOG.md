# 03 — Defect Log

**Environment for all rows below:** `https://avenue-portal.vercel.app` · deployed commit **unknown** (local HEAD `4429474`) · tester: UAT agent · 2026-06-25 UTC · no browser (HTTP probes). Severity defs per plan §12.

## Defects found in THIS run (evidence captured)

| Defect ID | Severity | Priority | Workflow | Step | Role/User | Summary | Expected | Actual | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| **DEF-001** | **Critical** | Must fix before client use | W8 / §7 | 8.8c, 8.8e | B2B caller (no session) | Default hardcoded dev API key `av-slade360-dev-key` is accepted in production on `/api/v1/{eligibility,benefits,preauth,claims}` → `API_KEY` is unset in prod | Default/dev key rejected with 401 in production | Dev key passes auth: claims/preauth → 400 (reached logic), eligibility/benefits → 500. No-key/wrong-key → 401 (gate works, but default not overridden) | network_logs/01_api_auth_matrix.txt; POST_claims_devkey.body.json; [WF08](workflows/WF08_b2b_api_auth.md) | OPEN |
| **DEF-002** | Medium | Should fix soon | W8 | — | B2B caller | `GET /api/v1/eligibility` & `/benefits` return **500 Internal Server Error** for an unknown member instead of coded **404 "Member not found"** | 404 with JSON error | 500 `{"error":"Internal Server Error"}` | network_logs/01_api_auth_matrix.txt | OPEN |
| **DEF-003** | Low | Should fix soon | W8 / §7 | — | B2B caller | Inconsistent API auth: `upload` reads `authorization` header + default `av-local-secret`; other v1 routes read `x-api-key`/`authorization` + default `av-slade360-dev-key` (two insecure defaults) | One consistent, externally-provisioned key scheme | Divergent header names + two different hardcoded defaults (`apiAuth.ts:7`, `upload/route.ts:9`) | source + WF08 | OPEN |
| **DEF-004** | Medium (High if data leaks) | Must fix before client use | W1 / §7 | 1.7-area | Unauthenticated | `/member/dashboard` returns **HTTP 200** unauthenticated (client-side guard only) while all other portals redirect server-side (307→/login) | Server-side redirect to /login like other portals | 200 + client shell referencing `/login`/`notFound`; no PII embedded in unauth body (needs authed retest to fully clear) | network_logs/GET_member_dashboard.body.html; [WF01](workflows/WF01_authentication_routing.md) | OPEN |
| **DEF-005** | Medium | Should fix soon | §7 | — | any | Missing baseline security headers on a PHI+financial app: no CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (HSTS present) | Standard security headers set | Only `strict-transport-security` present | network_logs/GET_login.headers.txt; [SEC01](security_permissions/SEC01_unauthenticated_surface.md) | OPEN |

## Defects surfaced while provisioning the local environment (2026-06-25)

Environment: local stack (Node 26.3.1, Postgres 16, Redis 8, MinIO) provisioned for live UAT — see [01_ENVIRONMENT_AND_SETUP.md](01_ENVIRONMENT_AND_SETUP.md).

| Defect ID | Severity | Priority | Area | Summary | Expected | Actual | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| **DEF-006** | High | Must fix before client use | DB migrations | Committed migrations do **not** reproduce `schema.prisma`. A fresh DB built with `prisma migrate deploy` (all 24 migrations) is out of sync with the generated client → **`db:seed` crashes** with `P2022 ColumnNotFound` on a `Provider` nested write (`prisma/seed.ts:303`). Required `prisma db push` to reconcile. | `migrate deploy` yields a DB matching the schema; seed runs clean | Migrate-built DB missing column(s) the client expects; seed fails until `db push` | seed error log (P2022); `db push` reported drift reconciled | OPEN |
| **DEF-007** | Medium | Should fix soon | Background worker | `npm run worker` (`tsx src/server/jobs/worker.ts`) does **not** load `.env`. With `DATABASE_URL` unset, `pg` silently connects to the OS-username DB and **every scheduled job fails** with `P1003 Database … does not exist` (e.g. `intake-allocation.job.ts:11`). Worker stays "up" while all jobs fail. | Worker loads config and runs jobs against the configured DB | Jobs fail until launched with `--env-file=.env`; no startup guard/validation of `DATABASE_URL` | worker boot log (P1003 / DatabaseDoesNotExist) | OPEN (worked around locally via `--env-file`) |

> **Note on DEF-001 retest:** the local instance has a real `API_KEY` set, so the default-dev-key is correctly rejected locally — confirming the production failure is purely a missing-env-var/config issue, not a code gap. The fix is to set `API_KEY` in the production environment.

## Live UAT retests on the local seeded instance (2026-06-25)

Now executing the plan against `http://localhost:3000` (seeded). Key results so far:

| Plan/Defect | Area | Result | Detail |
|---|---|---|---|
| W1 1.2–1.10 | Auth & routing | ✅ PASS | empty/invalid login → generic error (no enumeration); all 10 seeded roles land on correct portal; member→/dashboard → branded Access Denied; logout OK. Evidence: `evidence/network_logs/02_role_login_matrix.txt`, [WF01](workflows/WF01_authentication_routing.md) |
| **DEFECT-005 / DEFECT-001** | PDF generation | 🟢 **RE-FRAMED — code is OK; it's a runtime/browser-provisioning issue, not a code bug** | `GET /api/quotations/<id>/pdf` returned **200, valid 56 KB PDF** once a real Chrome was provided (`evidence/exports/WF02_quotation_pdf_PASS_local.pdf`). The PDF service (`pdf.service.ts`, Puppeteer HTML→PDF) works. The prior 500s are caused by **Chrome/Chromium not launching in the target runtime** — on Vercel via `@sparticuz/chromium` (the production concern), and locally because Puppeteer's own `browsers install` produced a broken 420 KB stub (had to extract Chrome-for-Testing manually). **Member letters (DEFECT-001) share the same `pdfService`** → same root cause; not directly exercised yet. |
| DEFECT-015 | Self-funded fund KPIs | 🟢 **RESOLVED** | Fund dashboard shows real data: Total Fund Balance KES 34,928,000, **Total Claims Paid KES 8,022,000** (no longer 0), per-scheme balances. [WF13_14](workflows/WF13_14_finance_fund.md) |
| **DEFECT-016** | Fund deposit / top-up | 🟢 **RESOLVED (Critical blocker cleared)** | Record Deposit (KES 1,000,000) → no crash; balance 3,800,000 → **4,800,000**; FundTransaction (DEPOSIT, balanceAfter, postedBy) persisted in DB. |
| **DEFECT-014** | Fund statement + export | 🟢 **NOT REPRODUCED** locally | Statement page renders (not 404); export → 200 CSV, closing balance 4,800,000 matches. Prior 404 was a production **stale-deploy** artifact. |
| W13 13.5 | GL trial balance | ✅ PASS | 24 accounts; Trial Balance flagged **Balanced**; DB Σdr=Σcr=3,048,700. |
| **W15.9 M-Pesa safety** | Wallet co-pay | 🟢 **PASS (Critical)** | Fake M-Pesa code → outstanding unchanged (Ksh 5,200), Paid-Through-Wallet Ksh 0, status PENDING; no CONFIRMED payment created. Fake code cannot mark paid. [WF15_16](workflows/WF15_16_member_selfservice.md) |
| **DEFECT-017** | Member documents | 🔴 **CONFIRMED open (Medium)** | `/seed-docs/*.pdf` links 404 locally too (`public/seed-docs` absent); members can't open plan documents. |
| W16 check-in | WebAuthn | ⚠️ Manual-only | Security/check-in pages render, WebAuthn supported; real biometric flow not executable headlessly (needs virtual authenticator). |
| W19 reports | Reports hub + exports | ✅ PASS | 34 reports; membership CSV export = 249 rows (full member count); **PDF export 200, 8 pages** (report PDF works). [WF18_19_22](workflows/WF18_19_22_service_analytics_hr.md) |
| **DEFECT-012** | Renewals drill (individual) | 🔴 **CONFIRMED open (Medium)** | Group-scheme renewal drill works (Safaricom); **individual scheme → 404** in page shell. |
| W18 complaints | Resolve | ✅ PASS | INVESTIGATING→RESOLVED with note (KPIs 1→0 / 1→2). |
| W22 HR scope | Cross-employer isolation | ✅ PASS (Critical) | HR sees only own 78 Safaricom members; zero other-group rows. |
| **DEFECT-013** | `/hr` index | 🔴 **CONFIRMED open (Low)** | `/hr` → 404 (fetch + page); does not redirect to /hr/dashboard. |
| W2/W3 | Quote intake + member enrol | ✅ PASS | QUO-2026-00004 created; member AVH-2026-00250 created + persisted (249→250). [WF02_03_06](workflows/WF02_03_06_sales_pipeline.md) |
| **DEFECT-006** | Quotation prospect name | 🟢 **RESOLVED** | Intake quote shows legal name "UAT Phase3 Prospect Ltd" (not "Unnamed Prospect"). |
| **DEFECT-004** | Pricing model create | 🟢 **RESOLVED** | "Create Model" opens a form and creates a PricingModel (was a dead placeholder). |
| **DEFECT-003** | Group duplicate/double-submit | 🟢 **RESOLVED** | Duplicate group name blocked with clear error "A group named … already exists." |
| **DEFECT-008** | Grammar "0 lifes" | 🔴 **CONFIRMED open (Low)** | Assessment shows "0 lifes" → should be "lives". |
| **DEFECT-009** | Claims adjudication | 🟢 **NOT REPRODUCED** | Clicking "Submit Decision" on a CAPTURED claim did **not** crash — claim adjudicated cleanly to APPROVED (KES 18,500) + AdjudicationLog. (Retest the exact no-line-decision edge to fully close.) [WF09](workflows/WF09_adjudication_settlement.md) |
| **DEFECT-010a** | Settlement create batch | 🟢 **FIXED** | Create Batch → MAKER_SUBMITTED, no crash (8 claims, KES 656,314). |
| **DEFECT-010b** | Settlement self-approve | 🟢 **FIXED** | Maker approving own batch → blocked "Maker and checker must be different users", no crash. |
| **DEFECT-010c** | Settlement → SETTLED | 🟢 **FIXED (Critical blocker cleared)** | Finance checker approves → CHECKER_APPROVED → Mark Paid → **SETTLED**; 8 claims → PAID; maker≠checker enforced; GL balances (Σdr=Σcr). |
| **NEW: DEF-008** | Settlement → GL/voucher | 🟠 Medium | Settlement reaches SETTLED but creates **no PaymentVoucher and posts no new GL JournalEntry** — claim status updates but the accounting ledger isn't posted (reconciliation/audit gap). See WF09. |

| **NEW: DEF-009** | Pre-auth benefit holds | 🔴 High | Approving a pre-auth places **no `BenefitHold`**; the table is **empty system-wide (0 rows)**. Limits are not reserved → a member can hold an approved pre-auth AND claim the full limit (**double-spend risk**, plan W7). Pre-auth status workflow itself works. See [WF07_08_20](workflows/WF07_08_20_preauth_claims_fraud.md). |
| W7 7.4 | Pre-auth approve | ✅ PASS | SUBMITTED → APPROVED (KES 16,000), no crash (hold gap = DEF-009). |
| W8 8.8/8.9/8.10 | B2B claims API | ✅ PASS | no-key/dev-key → 401 (DEF-001 config-fixable, confirmed); missing fields → 400; **SUSPENDED member → 403 eligibility gate works**. `evidence/network_logs/03_b2b_api_local.txt` |
| W20 20.1/20.2 | Fraud desk | ✅ PASS | alerts render; dismiss-with-reason → resolved=true + audit (resolvedBy/At). |

> **Phase-4 headline:** the prior **Critical** settlement blocker (DEFECT-010, "batches cannot reach SETTLED") and the DEFECT-009 adjudication crash are **resolved** on this build. Working: preauth approve, claims list, B2B API eligibility gate, fraud dismiss. New concerns: **DEF-009 (benefit holds never placed — double-spend risk, High)** and DEF-008 (settlement posts no GL/voucher, Medium).

**Production implication of the PDF reframing:** the fix is **runtime browser provisioning** (ensure a working headless Chromium in the deploy target / verify the `@sparticuz/chromium` + `VERCEL` branch actually launches), **not** rewriting the PDF code. This lowers the remediation risk for DEFECT-001/005 but they remain **High** until proven working in the *production* runtime. Also note a related env gap: a clean `npm install` does **not** provision a browser (postinstall only runs `prisma generate`) — see DEF-006 family.

## Carry-forward: prior UAT defects (from `uat/DEFECTS.md`) — NOT re-verified this run

These were found by a **prior** UI-only run and could **not** be re-tested here (require login / server logs). Listed so they are not lost; status = **UNVERIFIED THIS RUN** (treat as open until retested). Mapping to plan §12 severity in brackets.

| Prior ID | Prior sev | Area | Summary | This run |
|---|---|---|---|---|
| DEFECT-001 | S2 [High] | Members → Letters | "Generate & Download" letter crashes (Digest 2671985791); PDF-on-Vercel | Not re-tested (login) |
| DEFECT-002 | S4 [Low] | Scaffold routes | Empty `members/[id]/{portal,transfer,webauthn}`, `groups/[id]/{self-funded,tiers}` 404 direct | Not re-tested |
| DEFECT-003 | S3 [Med] | Groups → Enroll | Double-submit creates duplicate groups (no disabled state / dup-name check) | Not re-tested |
| DEFECT-004 | S3 [Med] | Settings → Pricing Models | "Create Model" dead placeholder button | Not re-tested |
| DEFECT-005 | S2 [High] | Quotations → PDF | `/api/quotations/[id]/pdf` 500 for all quotes | Not re-tested (login) |
| DEFECT-006 | S3 [Med] | Quotation detail | Intake quotes show "Unnamed Prospect" | Not re-tested |
| DEFECT-007 | S3 [Med] | Accept → Create Group | No feedback/redirect; invites double-click | Not re-tested |
| DEFECT-008/011 | S4 [Low] | Copy/grammar | "0 lifes"→"lives"; "scheme have"→"has"; "— · —" headers | Not re-tested |
| DEFECT-009 | S3 [Med] | Claims adjudication | "Submit Decision" before "Compute Outcome" crashes (Digest 2813583153) | Not re-tested |
| DEFECT-010 | S2 [Critical] | Settlement | Create Batch crash (Digest 3362540806); maker self-approve crash; "Paid" does nothing → cannot reach SETTLED | Not re-tested — **core financial blocker** |
| DEFECT-012 | S3 [Med] | Analytics → Renewals | Drill-down 404 for individual schemes | Not re-tested |
| DEFECT-013 | S4 [Low] | HR nav | `/hr` index 404s (no redirect to /hr/dashboard) | **Corroborated** at HTTP level (route absent) |
| DEFECT-014 | S2 [High] | Deployment | Prod stale vs origin/main; fund statement page + export 404 | **Not confirmable** — deployed commit unknown; still a risk |
| DEFECT-015 | S3 [Med] | Fund portal | Dashboard "CLAIMS PAID KES 0" vs claims "KES 17,777,251" (fund not initialised) | Not re-tested |
| DEFECT-016 | S2 [Critical] | Fund deposit | "Record Deposit" crashes (Digest 2550466935), does not persist; fund unusable | Not re-tested — **self-funded blocker** |
| DEFECT-017 | S3 [Med] | Member documents | `/seed-docs/*.pdf` 404 (files absent in deployment) | **Corroborated** — dir absent in source; `/seed-docs/...` → 404 |
| DEFECT-018 | S4 [Low] | 404 page | Unbranded default Next.js 404 | **Corroborated** — default 404 text in app shell |

## Stub integrations & insecure defaults (verify before go-live)
- M-Pesa (Daraja) STUB → fake-code-marks-paid safety check **untested**.
- IPRS STUB → manual-verify gate **untested**.
- SMS gateway presence **unconfirmed**.
- Insecure defaults: `API_KEY` **confirmed unset in prod** (DEF-001); SMTP/mailtrap default, M-Pesa callback secret, `upload` `av-local-secret` — **unconfirmed**.
