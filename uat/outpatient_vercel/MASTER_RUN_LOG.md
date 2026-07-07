# Comprehensive Outpatient Front-End UAT — Vercel Deployment

## RESUME POINTER
- **Last updated:** 2026-07-07 (pass complete)
- **Status:** PASS COMPLETE — **Verdict: NO-GO** (see GO_NO_GO_READINESS.md). Blocker PR-V02 (settlement Mark Paid fails).
- **Next step (Phase R re-test after fix):** create a fresh settlement batch → checker approve → Mark Paid → confirm SETTLED + provider/member/reports PAID + balanced GL journal. Then clear untested register (HR live scope, fund impact, exports, Scenario D remainder D4-D8, partial-approval math, notifications).
- **Active persona / tab:** Reports Viewer (last), Chrome tabId 80909449. Personas & passwords in Environment Facts.
- **Key artefacts created this run:** claim **CLM-2026-00278** (Mark Kato/Aga Khan, APPROVED 16,500), claim **CLM-2026-00279** (Prossy Kato/IHK, DECLINED), settlement batch Aga Khan Jul 2026 (stranded CHECKER APPROVED, KES 3,288,480). Provider users provider.agakhan.uat@ / provider.ihk.uat@; finance.checker.uat@; reports.uat@; hr.nwsc.uat@ (NWSC); member login mark.kato2593@nwsc-scheme.example. Substitutions: principal=Mark Kato (NWSC-2026-01768), dependant=Prossy Kato (NWSC-2026-02891), positive facility=Aga Khan, negative=IHK.

## Environment Facts (verified this run, 2026-07-07)
- **Target (ONLY):** https://avenue-portal.vercel.app  — Vercel production deployment `dpl_4rP7KZqyX8iCpkNvLmYZj8Kix2bp`, readyState READY, target=production. Project `avenue-portal` (prj_XtdfOga8W86q0IBYtecB91qlnbTA), team mutukumulwas-projects.
- **Browser:** Chrome MCP "Browser 1" (deviceId 03aa4fc8-26b8-487e-b320-aea016014774), local macOS. tabGroupId 1243701891.
- **NO localhost, NO DB edits, NO API/Prisma shortcuts, NO seed scripts** during the UAT flow. Front-end only. Missing users are created by admin through the UI.
- **Admin credential (works on Vercel):** `admin@medvex.co.ug` / `MedvexAdmin2024!` (SUPER_ADMIN). Landed on `/dashboard`.
- **Seeded-user password convention (from prior local run — must re-verify on Vercel):** `MedvexAdmin2024!`
- **Baseline dashboard counts @ login:** 2,997 active members · 7 active corporate groups · 10 pending claims · 3 pending pre-auths · 263 claims (30d) · 1 overdue invoice · loss ratio 90%.
- **Admin portal has SWITCH PORTAL (Admin / Fund) + nav groups:** Overview, Membership, Clinical, Finance, Insights, Compliance, Support, Reinstatements, Setup.

## Deliverables root
`uat/outpatient_vercel/` (this pass). Runbook: repo root `COMPREHENSIVE_OUTPATIENT_FRONTEND_UAT.md`.

## Spine questions (verdict hinges on these)
1. Can a real outpatient claim be filed by a provider-portal user, adjudicated by TPA, settled by finance (maker→checker), and correctly reflected to provider + member + reports — all through the front end, each actor as themselves? (YES/NO)
2. Does money/benefit leave the system only per contract — rejected/excluded lines excluded from settlement, benefit usage moving only for approved amounts, GL staying balanced? (YES/NO)
3. Is data scope hard — provider sees only own facility, member only self, HR only their employer — with no IDOR/cross-scope leakage? (YES/NO)

## Chronological log
- 2026-07-07 — Chrome gate cleared; navigated to Vercel /login; signed in as admin@medvex.co.ug → /dashboard. Environment live & populated. Workspace scaffolded.
