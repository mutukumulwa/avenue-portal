# Avenue Portal — UAT Defects & Missing Items

Target: https://avenue-portal.vercel.app/ · Logged during UI-only UAT.
Severity: **S1** blocker · **S2** major (workflow broken) · **S3** minor (workflow completes with friction) · **S4** cosmetic.

| # | Sev | Area | Ref | Summary | Status |
|---|-----|------|-----|---------|--------|
| DEFECT-001 | S2 | Admin → Members → Letters | 2.6 | "Generate & Download" letter crashes with server-side exception (Digest 2671985791) | OPEN |
| DEFECT-002 | S4 | Admin → scaffold routes | 2.8/2.9, 3.7/3.8 | Empty scaffold route dirs 404 if visited directly: /members/[id]/{portal,transfer,webauthn}, /groups/[id]/{self-funded,tiers} (no page.tsx; UI lives inline on detail pages) | OPEN |
| DEFECT-003 | S3 | Admin → Groups → Enroll | 3.3 | Double-submitting the Enroll Group form creates duplicate groups — submit button not disabled during server action, no duplicate-name check ("UAT Test Co Ltd" x2 now in prod data) | OPEN |
| DEFECT-004 | S3 | Settings → Pricing Models | 4.5 | "Create Model" button does nothing — placeholder with no onClick (src/app/(admin)/settings/pricing-models/page.tsx:26 comment confirms). Pricing models cannot be created via UI; list is empty in prod | OPEN |
| DEFECT-005 | S2 | Quotations → PDF | 5.4 | GET /api/quotations/[id]/pdf returns 500 {"error":"Failed to generate PDF"} for all quotes (seeded + new). "Download PDF" link on build page broken. Same family as DEFECT-001 (PDF generation broken on Vercel) | OPEN |
| DEFECT-006 | S3 | Quotations → Detail | 5.4 | Intake-created quotations show "Unnamed Prospect" header + Prospect Name "—" on detail page, though the legal name ("UAT Prospect Ltd") was captured and displays correctly on the bind page — display field mapping gap | OPEN |
| DEFECT-007 | S3 | Quotations → Accept→Create Group | 5.5 | "Create Group" on an ACCEPTED quotation gives zero feedback: no redirect to the new group, no success toast, button remains active (invites double-click). Group IS created (status PENDING) but appears in the groups list only after cache refresh — tester believed it failed. UPDATE 2026-06-11: group "UAT Prospect Ltd" confirmed created | OPEN (revised) |
| DEFECT-008 | S4 | Quotations → Assess | 5.2 | Pluralisation: "0 lifes" / "1 lifes" should be "lives" | OPEN |
| DEFECT-009 | S3 | Claims → Adjudication | 6.7 | Clicking "Submit Decision" on a CAPTURED claim before "Compute Outcome" crashes the page with a server-side exception (Digest 2813583153) instead of a validation message. Happy path (line ✓ → Compute Outcome → auto-APPROVED) works | OPEN |
| DEFECT-010 | S2 | Settlement | 9.5 | Provider settlement: (a) Create Batch crashes post-action with server exception Digest 3362540806 (batch IS created); (b) maker clicking Approve on own batch crashes instead of "cannot approve own batch" message (and does not persist); (c) "Paid" button on CHECKER APPROVED batch does nothing — no dialog, no status change; batches cannot reach SETTLED | OPEN |
| DEFECT-011 | S4 | Copy/grammar bundle | 9.2 | "1 scheme have a depleted fund balance" → "has"; "0 lifes" (see DEFECT-008); individual scheme header "— · —" for blank industry/county (3.4) | OPEN |
| DEFECT-012 | S3 | Analytics → Renewals | 13.4 | Renewal pipeline's own drill-down link (/analytics/renewals/cmovn0vd800fr7ouv6osadsor — Patricia Wanjiru individual scheme) renders a 404 inside the page shell. Pipeline links to schemes its detail page can't resolve (suspect individual schemes unsupported by renewal detail query) | OPEN |
| DEFECT-013 | S4 | HR portal nav | 15.x | A nav link targets /hr which has no page.tsx — every HR page logs a 404 RSC prefetch (/hr?_rsc=…); clicking the link would 404. Add /hr → redirect to /hr/dashboard | OPEN |
| DEFECT-014 | S2 | Deployment | 17.4 | Vercel production is STALE vs origin/main: /fund/[groupId]/statement (page exists in pushed commit 22a231e) 404s in prod — the fund portal's "Statement" nav tab is broken for customers. Statement export API also 404s. Additionally local HEAD (d8c4661, bulk claims import) is unpushed. **Action: push + redeploy, then retest** | OPEN |
| DEFECT-015 | S3 | Fund portal | 17.1 | Confusing fund data: dashboard shows "TOTAL CLAIMS PAID KES 0" while scheme claims page shows "PAID FROM FUND KES 17,777,251" — because no fund account is initialised, ledger-based KPIs read 0 while claims aggregates don't. Either auto-initialise fund accounts for self-funded schemes or label KPIs explicitly | OPEN |
| DEFECT-016 | S2 | Fund portal → Deposit | 17.2 | "Record Deposit / Top-Up" (first deposit, KES 1,000,000, type default) crashes with server exception Digest 2550466935 AND does not persist — fund account remains uninitialised. Fund administrators cannot manage self-funded floats at all | OPEN |
| DEFECT-017 | S3 | Member → Documents | 18.5 | Seeded member documents link to /seed-docs/*.pdf (Safaricom_Benefit_Schedule_2025.pdf, Avenue_Member_Benefit_Guide_2025.pdf, Safaricom_Group_Contract_2024.pdf) which 404 — files not present in deployment public/. Members cannot open their plan documents | OPEN |
| DEFECT-018 | S4 | 404 page | 19.2 | Bad URLs render the default unbranded Next.js 404 page; add a branded not-found page with navigation back | OPEN |

## Cross-cutting root-cause hypotheses
1. **PDF generation broken on Vercel** — DEFECT-001 (letters) + DEFECT-005 (quotation PDF) share symptoms; suspect @react-pdf/renderer or puppeteer usage inside serverless functions. Fixing the PDF service layer likely clears both.
2. **Server actions crash post-success** — DEFECT-009/010(a)/016 all crash AFTER or DURING server actions; 010(a) and 009 persisted partially, 016 not at all. Inspect Vercel function logs for digests 2813583153, 3362540806, 2550466935, 2671985791.
3. **Stale deployment** — DEFECT-014: redeploy latest origin/main (and push local d8c4661) before customer UAT, then retest §17.4 and claims-import.
4. **No-feedback server actions** — DEFECT-003/007: add pending/disabled states and success redirects to all create actions.

## Details

### DEFECT-001 — Letter generation crashes (S2)
- **Where:** /members/[id]/letters → select letter type → "Generate & Download"
- **Observed:** Full-page "Application error: a server-side exception has occurred… Digest: 2671985791"
- **Repro:** 100% — fails for both a freshly created member and seeded member (Patricia Wanjiru AVH-2024-00249)
- **Impact:** Welcome/renewal/lapse/reinstatement letters cannot be produced at all.
- **Likely cause (code):** letter PDF generation server action fails in the Vercel serverless runtime (PDF renderer dependency). Needs server log / Vercel function log inspection for digest 2671985791.

### DEFECT-002 — Dead scaffold member routes (S4)
- src/app/(admin)/members/[id]/{portal,transfer}/ are empty dirs; webauthn/ has actions.ts but no page.tsx. Direct navigation 404s. Not linked from UI, so cosmetic; delete dirs or add pages.
