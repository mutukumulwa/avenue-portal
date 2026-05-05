# Production Deployment Flags

This file tracks decisions that are intentionally deferred during build but must be resolved before production launch.

## Biometric Check-In

1. **Audit retention period**
   - Status: Deferred until production deployment planning.
   - Decision needed: how long immutable check-in audit events, override reports, captured photo references, and related review dispositions must be retained.
   - Inputs: Kenyan insurance/member care obligations, Avenue legal/compliance policy, enterprise client requirements, and storage cost.

2. **Final production WebAuthn domain**
   - Status: Deferred until production domain is confirmed.
   - Current strategy: WebAuthn RP settings must be environment-specific.
   - Development: `localhost`.
   - Staging: one stable staging domain, not rotating Vercel preview URLs.
   - Production: the final custom Avenue portal domain.
   - Reason: passkeys are origin/RP-bound; credentials registered on a preview URL will not cleanly work on a different domain.

3. **SMS provider**
   - Status: Deferred.
   - Expected default: Africa's Talking.
   - First build: use in-app/PWA notification and polling, with SMS adapter disabled unless configured.

4. **Face-match vendor**
   - Status: Future implementation after Avenue vendor/operations discussions.
   - First build: no automated face matching and no IPRS dependency.

5. **IPRS integration**
   - Status: Explicitly out of scope for first biometric check-in build.
   - First build: do not call IPRS and do not treat `Member.photoUrl` as an IPRS-verified image.

## Performance Deployment

1. **Vercel and database region alignment**
   - Status: Required before production launch.
   - Decision needed: choose the Vercel serverless region closest to the production Postgres primary region.
   - Reason: every server-rendered protected route performs auth and data reads; cross-region database latency is visible in login and navigation.

2. **Runtime pooled database URL**
   - Status: Required before production launch.
   - Expected setup: `DATABASE_URL` should point at the provider's pooled/serverless-safe connection string when available.
   - Migration setup: `DIRECT_URL` should point at the direct database connection and remain the URL used by Prisma migrations through `prisma.config.ts`.

3. **Auth and database environment consistency**
   - Status: Required before production launch.
   - Required checks: production and preview environments must have stable `AUTH_SECRET`/`NEXTAUTH_SECRET` values and must point to the intended database target.
   - Reason: changing auth secrets invalidates sessions and mis-targeted database URLs make production latency/debugging misleading.

4. **Performance timing logs**
   - Status: Optional for production debugging.
   - Development: timing logs are enabled automatically.
   - Production: set `AICARE_PERF_LOGS=1` temporarily to log server timings for auth, layouts, and dashboard loaders.
