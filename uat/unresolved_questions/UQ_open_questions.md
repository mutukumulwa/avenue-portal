# Open questions for the product owner (plan §13) + this run's additions

## Carried from plan §13 (still open)
1. **Unimplemented modules in scope?** Terminology Engine, advanced fraud (configurable rules/anomaly/investigations/append-only fraud audit), biometric liveness + fallback tiers, Case Management (Report R-19) are listed unimplemented in `AICARE_TODO.md`. Contractually required for this client's go-live?
2. **Stub integrations at launch?** Is M-Pesa (Daraja) expected live, or is manual confirmation acceptable? Same for IPRS. Is there a real SMS/WhatsApp gateway, and which?
3. **Deployment of record + commit.** Vercel or Docker/nginx self-host? Does the deployed build match the intended commit? (Prior UAT flagged a stale deploy — DEFECT-014. The deployed commit could **not** be confirmed in this run.)
4. **RBAC completeness.** Is the fine-grained `Permission`/`RolePermission` matrix fully seeded for every role, or do some screens rely only on the coarse `UserRole`? May staff roles view non-admin portals?
5. **Audit immutability.** Has the check-in/fraud append-only guard been applied to the production DB?
6. **Multi-tenancy.** Is more than one tenant live (expand isolation testing if so)?
7. **Actuarial sign-off** of pricing/co-contribution/MLR math?
8. **Required env config.** No `.env.example`. → **Partially answered by this run: `API_KEY` is NOT set in production** (default dev key in effect — DEF-001). Confirm the full list and that no other insecure defaults remain (SMTP/mailtrap, M-Pesa callback secret, `upload` route's `av-local-secret`).
9. **Data retention** policy for check-in/audit?
10. **Test environment.** Will UAT run on a seeded **staging clone** or the live client tenant? A disposable staging tenant is required to safely run the destructive/creating workflows (W2–W22) — none was available here.

## New questions raised by this run
A. **Member-portal guard model.** Is `/member/dashboard` intentionally protected only client-side (returns HTTP 200 unauthenticated) while all other portals redirect server-side? If so, confirm no authenticated member data is ever server-rendered into an unauthenticated response (DEF-004).
B. **`/api/v1` read endpoints 500.** Why do `eligibility`/`benefits` return 500 (not the coded 404) for an unknown member in production (DEF-002)? Is the read path broken in the deployed build, or only on edge input?
C. **Security headers.** Is the absence of CSP/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy intentional (DEF-005)?
D. **Access for completing UAT.** Can the team provide either (a) a runnable staging stack, or (b) a connected browser session against staging with the seeded accounts, so the blocked 95% of the plan can be executed?
