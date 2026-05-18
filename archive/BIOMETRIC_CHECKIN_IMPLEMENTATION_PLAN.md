# Biometric Check-In Implementation Plan

## Purpose

Implement `secure-checkin` as a self-contained Avenue member visit verification module. The module must let reception initiate a check-in, let members verify from the mobile/PWA experience, support degraded fallback flows, and produce immutable audit evidence for every attempt.

This plan is based on `BIOMETRIC_CHECKIN_SPEC.md` and the current app shape: Next.js App Router, Prisma/PostgreSQL, NextAuth JWT sessions, enum-based roles, `Member`, `Provider`, and existing admin/member portals.

## Non-Negotiable Invariants

- The app never stores biometric data or private keys.
- WebAuthn challenges are single-use, short-lived, and bound to member, facility, workstation, staff user, and tenant.
- A successful WebAuthn assertion alone does not open a visit; reception must confirm the matching 6-digit code.
- Fallbacks never silently bypass audit.
- Emergency care is never blocked by failed identity verification.
- Check-in audit events are append-only and protected at the database layer.
- Password-only account access is not enough to enroll a new biometric credential.
- No member route, API response, app log, or service worker cache should leak PII, face-match details, ID numbers, or WebAuthn assertion material.

## Decisions and Deferred Items

1. Push provider: defer native push provider selection. First build uses an in-app/PWA notification center plus polling from `/member/check-in`.
2. Face match vendor: defer until Avenue operational/vendor discussions begin. Do not block the first secure-checkin build on face-match SDK selection.
3. SMS provider: Africa's Talking is the likely market default, but leave direct SMS integration open for now. First build may use in-app/PWA notifications and manual fallback handling.
4. IPRS: do not implement IPRS integration in this module. Do not assume `Member.photoUrl` is an IPRS-verified photo.
5. Knowledge questions: use bank-style identity questions generated from allowed data, including full name, age/date of birth, last visit, group/employer, registered dependent name, registered phone/email fragments, and recent provider/facility visited.
6. Emergency override: allow the check-in staff user to perform an override with a mandatory reason. Treat overrides as reportable operational exceptions, not as a restricted clinical-only capability for this pass.
7. Audit retention: defer final retention period to production deployment readiness. Track in `PRODUCTION_DEPLOYMENT_FLAGS.md`.
8. WebAuthn domain strategy: use environment-specific RP settings. Development uses `localhost`; staging must use one stable staging domain; production must use the final custom Avenue portal domain. Do not use disposable Vercel preview URLs for passkey credentials because WebAuthn credentials are origin/RP-bound and will not move cleanly between changing preview domains.

The first build should use adapter interfaces and mockable services so SMS, native push, IPRS, and face match can be switched on later without rewriting the check-in workflow.

## Phase 0: Technical Foundation

### Steps

1. Add dependencies:
   - `@simplewebauthn/server`
   - `@simplewebauthn/browser`
   - no SMS, IPRS, native push, or face-match SDK dependency in the first build
2. Add env vars:
   - `WEBAUTHN_RP_ID`
   - `WEBAUTHN_RP_NAME`
   - `WEBAUTHN_ORIGIN`
   - `CHECKIN_CHALLENGE_TTL_SECONDS=90`
   - `CHECKIN_VISIT_CODE_TTL_SECONDS`
   - `CHECKIN_RP_ENV=development|staging|production`
   - vendor secrets only after Africa's Talking, push, or face-match integrations are explicitly selected
3. Add server utilities:
   - `src/server/services/secure-checkin/webauthn.ts`
   - `src/server/services/secure-checkin/audit-chain.ts`
   - `src/server/services/secure-checkin/rate-limit.ts`
   - `src/server/services/secure-checkin/adapters/{notification,sms,face-match}.ts`
4. Add shared DTO/types under `src/server/services/secure-checkin/types.ts`.
5. Add strict logging rules for this module: errors may include check-in IDs and statuses, never ID numbers, face scores, OTPs, challenges, assertion payloads, or photo payloads.

### Acceptance

- Dependencies install cleanly.
- `npx tsc --noEmit` passes.
- Service adapters can be mocked in tests without network calls.
- The default notification adapter creates in-app/PWA notifications and does not require a third-party provider.

## Phase 1: Schema and Append-Only Audit

### Prisma Additions

Add enums:

- `CheckInChallengeStatus`: `PENDING`, `SIGNED`, `CODE_CONFIRMED`, `EXPIRED`, `FAILED`, `CANCELLED`, `FALLBACK_STARTED`
- `CheckInFlow`: `BIOMETRIC`, `SMS_PHOTO`, `PHOTO_KNOWLEDGE`, `EMERGENCY_OVERRIDE`
- `CheckInOutcome`: `SUCCESS`, `FAILED`, `EXPIRED`, `OVERRIDDEN`, `FLAGGED_FOR_REVIEW`
- `CredentialStatus`: `ACTIVE`, `REVOKED`, `LOCKED`
- `AuthenticatorAttachment`: `PLATFORM`, `CROSS_PLATFORM`, `UNKNOWN`

Add models:

- `MemberWebAuthnCredential`
  - `tenantId`, `memberId`, `credentialId`, `publicKey`, `counter`, `transports`, `deviceName`, `deviceModel`, `osName`, `osVersion`, `attachment`, `status`, `isSoftCredential`, `lastUsedAt`, `revokedAt`, `createdAt`
  - unique `credentialId`
  - indexes on `tenantId`, `memberId`, `status`
- `CheckInChallenge`
  - `tenantId`, `memberId`, `providerId`, `workstationId`, `initiatedById`, `challengeHash`, `expiresAt`, `status`, `attemptCount`, `consumedAt`, `signedCredentialId`, `visitCodeHash`, `visitCodeExpiresAt`, `createdAt`, `updatedAt`
  - indexes on `memberId`, `providerId`, `status`, `expiresAt`
- `CheckInEvent`
  - `tenantId`, `memberId`, `providerId`, `challengeId`, `flow`, `outcome`, `initiatedById`, `overrideById`, `credentialId`, `photoEvidenceUrl`, `faceMatchScore` as a nullable future/vendor field, `knowledgeQuestionKeys`, `geoLatitude`, `geoLongitude`, `ipAddressHash`, `userAgentHash`, `reviewRequired`, `reasonCode`, `notesHash`, `previousEventHash`, `eventHash`, `createdAt`
  - no `updatedAt`
  - indexes for compliance dashboards and fraud analytics
- `MemberDevicePushSubscription`
  - `tenantId`, `memberId`, `credentialId?`, endpoint/token fields, device metadata, `isActive`, `lastPushAt`, `createdAt`, `updatedAt`
- Optional future-friendly `Visit`
  - If no existing visit entity exists, add a minimal `VisitVerification`/`MemberVisit` record opened only after successful code confirmation or emergency override.

Extend existing models:

- `Tenant`: add relations.
- `Member`: add credentials, challenges, check-in events, push subscriptions.
- `Provider`: add check-in challenges/events as facility.
- `User`: add initiated/override event relations.

### Database Hardening

1. Add a SQL migration trigger that rejects `UPDATE` and `DELETE` on `CheckInEvent`.
2. Add a database function or migration comments documenting that corrections must be new compensating events.
3. Hash-chain check-in events using the latest previous event for the same tenant/member.

### Acceptance

- Migration applies locally.
- Tests prove `UPDATE "CheckInEvent"` and `DELETE FROM "CheckInEvent"` fail.
- Creating a compensating event succeeds.
- `prisma generate` and typecheck pass.

## Phase 2: WebAuthn Credential Enrollment and Management

### Member PWA

1. Add `/member/security` page.
2. Show registered devices with status, last used, and revoke action.
3. Add "Add this device" only when allowed by policy:
   - Approved by an existing active credential, or
   - Branch/reception in-person verification token.
4. Use `@simplewebauthn/browser` to start and complete registration.
5. Store credential public key and metadata through server actions/API routes.

### Reception/Admin Enrollment Support

1. Add branch-assisted enrollment from member detail, likely `/members/[id]`.
2. Require staff role from `ROLES.OPS` or stricter.
3. Verify identity through the approved knowledge-check flow before creating a one-time enrollment approval token.
4. Audit every enrollment approval and every revocation.

### Server/API

1. Add endpoints/actions:
   - generate registration options
   - verify registration response
   - revoke credential
   - generate in-person enrollment approval
2. Enforce RP ID/origin strictly.
3. Mark unreliable devices as `isSoftCredential` if browser/platform support is partial.

### Acceptance

- Member can register a platform authenticator from phone PWA.
- Member can revoke a credential immediately.
- Revoked credential cannot be used for check-in.
- Password-only member session cannot add a second credential without existing credential approval or branch approval.

## Phase 3: Reception Check-In Console

### Admin UI

1. Add top-level admin route `/check-ins`.
2. Add provider/facility selector using existing `Provider` records, defaulting to Avenue-owned facilities where applicable.
3. Add member search by member number, name, ID number, phone, QR payload, or smart card number.
4. Add "Initiate secure check-in" action.
5. Show live challenge state:
   - pending push/pull
   - signed, awaiting code confirmation
   - expired
   - fallback required
   - completed
6. Add reception-side "Confirm match" button that opens the visit only when the server-side state is signed and the visit code is still valid.

### Server

1. Create `SecureCheckInService.initiateChallenge`.
2. Generate random challenge nonce using Node crypto.
3. Store only challenge hash where possible.
4. Bind to tenant, member, provider, workstation, and staff user.
5. Create an in-app/PWA notification for the member and mark all active registered devices as eligible to pull the challenge.
6. Add polling endpoint so member PWA can pull pending check-ins.

### Acceptance

- Reception can start a check-in for a member.
- Challenge expires after configured TTL.
- Expired challenge cannot be signed or confirmed.
- No visible check-in action appears to roles outside the chosen staff set.

## Phase 4: Member Biometric Check-In Flow

### Member PWA

1. Add `/member/check-in` page.
2. Add "Check pending check-ins" button for pull mode.
3. When a pending challenge exists, show facility name and require a user gesture: "Verify at this facility".
4. Invoke WebAuthn `get()` with server-provided options.
5. Send assertion and optional coarse geolocation to server.
6. Display the 6-digit visit code after server verification.
7. Show expiry/retry/fallback states clearly.

### Server

1. Add assertion options endpoint.
2. Verify assertion using stored public key and counter.
3. Reject inactive/revoked/locked credentials.
4. Increment failed attempt counters.
5. Lock credential for 10 minutes after three failed attempts.
6. On success, consume challenge, generate visit code, store hash and expiry, and append audit event.

### Acceptance

- Real iOS Safari installed PWA completes Face ID check-in.
- Real Android Chrome completes fingerprint check-in.
- Visit only opens after reception confirms matching code.
- Facility A challenge cannot be replayed at facility B.
- Three failed biometric attempts route to fallback.

## Phase 5: In-App Notification and Optional SMS Fallback

### UI

1. Add fallback panel inside `/check-ins/[id]` or the live check-in console.
2. First build: send the member an in-app/PWA notification and allow reception to trigger a visible member-side code prompt.
3. Future SMS build: send OTP only to the verified phone stored on `Member.phone`; never to a number offered at the desk.
4. Add live photo capture/upload control for audit context only, not automated face-match approval in this pass.
5. Show pass/fail/manual-review state without exposing sensitive details to casual operators.

### Server

1. Add OTP issue/verify service with hashed OTP storage, expiry, and rate limits.
2. Keep the SMS adapter disabled by default until Africa's Talking or another gateway is configured.
3. Add face-match adapter interface, but default it to `NOT_CONFIGURED`.
4. Do not compare against IPRS photos in this pass.
5. Require successful in-app confirmation or configured OTP plus staff confirmation.
6. Append audit event.
7. Flag all fallback use for review as configured.

### Acceptance

- Fallback succeeds only when the configured fallback factors pass.
- When SMS is enabled, OTP to a desk-provided phone number is impossible.
- Failed fallback attempts create audit events.

## Phase 6: Photo + Knowledge Last Resort

### UI

1. Add last-resort panel after staff explicitly selects "No phone available".
2. Capture live photo.
3. Generate three approved knowledge questions from whitelisted member/chart fields:
   - full name
   - age/date of birth
   - last visit date or last facility visited
   - group/employer name
   - registered dependent name
   - masked registered phone/email
   - recent provider/facility visited
4. Accept answers through staff-controlled form.

### Server

1. Add deterministic question generator with rotation and no client-side answer leakage.
2. Verify answers server-side.
3. Require staff photo capture plus knowledge pass.
4. Always set `reviewRequired = true`.
5. Append audit event.

### Acceptance

- Last-resort check-in opens visit only when photo is captured and knowledge checks pass.
- Every last-resort attempt appears in compliance review.

## Phase 7: Emergency Override

### Role and Access

1. Allow the authenticated staff user performing check-in to invoke emergency override in this pass.
2. Require a real named user account. Shared/service accounts must not be able to invoke override.
3. Log override count by user, facility, day, and reason.
4. Use reporting to detect non-working verification methods or lax front-office behavior.

### UI

1. Add emergency override action in reception check-in flow.
2. Require step-up confirmation where possible.
3. Require free-text reason/justification.
4. Open visit immediately after valid override.

### Server

1. Append override audit event with staff user identity.
2. Create visit record immediately.
3. Queue for same-day compliance review and daily override reporting.

### Acceptance

- Authenticated check-in staff can override.
- Unauthenticated users or non-staff users cannot see or invoke override endpoint by URL guessing.
- Override appears on compliance dashboard the same day.

## Phase 8: Compliance and Fraud Review

### Dashboard

1. Add `/fraud/check-ins` or `/settings/check-in-audit`.
2. Show events needing review:
   - emergency overrides
   - last-resort check-ins
   - repeated failed biometric attempts
   - geolocation anomalies
   - high fallback rate by facility/staff member
3. Add filters by facility, member, staff, flow, outcome, date, and review state.
4. Add review disposition action that appends a review event rather than mutating the original event.

### Reports

1. Add check-in audit export.
2. Add provider/facility check-in summary.
3. Add member-level check-in history on member detail.
4. Add daily override report with counts by staff user, facility, hour, and reason category.

### Acceptance

- Compliance can review same-day exceptions.
- Review disposition does not update/delete original check-in event.
- Daily override reports make it obvious when a facility is bypassing verification too often.

## Phase 9: PWA, Push, and Offline Behavior

### PWA

1. Keep member PWA installable.
2. Add `/member/check-in` to mobile nav.
3. Add QR/pull check-in path for iOS users without installed PWA push.
4. Keep authenticated routes network-only in the service worker.
5. Add in-app/PWA notification center for check-in requests.
6. Add push subscription registration and revocation later when the push provider is chosen.

### Acceptance

- Installed iOS PWA can see pending check-ins through in-app notification/polling in the first build.
- Non-installed iOS browser can still pull a pending challenge via QR/manual button.
- Slow-network member can complete check-in without large extra bundle downloads.

## Phase 10: API, Integration, and Workflow Boundaries

### Internal APIs

1. Add route handlers under `/api/check-ins/*` or server actions colocated with pages.
2. Use server-side tenant and role checks on every action.
3. Never trust `memberId`, `providerId`, or `challengeId` without tenant and ownership validation.

### External Systems

1. Do not expose raw WebAuthn assertion data to SMART/Slade360.
2. Provide only visit verification status if needed.
3. Make downstream claims/preauth flows consume visit verification ID optionally.

### Acceptance

- Provider/claim creation can record check-in/visit verification reference.
- Direct API calls cannot confirm a visit without the proper challenge state and role.

## Phase 11: Tests and Security Review

### Unit Tests

- Challenge TTL, single-use behavior, and facility binding.
- Audit hash chain.
- Append-only trigger behavior.
- Credential revocation and lockout.
- In-app notification delivery state.
- OTP hashing/expiry/rate limit once SMS is enabled.
- Knowledge question generation without answer leakage.

### Integration Tests

- Registration ceremony mocked with SimpleWebAuthn fixtures.
- Biometric check-in success.
- Facility replay failure.
- Three failed assertions route to fallback.
- In-app fallback success/failure.
- SMS + photo fallback success/failure once SMS is enabled.
- Last-resort review flag.
- Emergency override access gating.
- Audit dashboard query coverage.

### Manual Device Tests

- iOS installed PWA with Face ID.
- iOS browser without installed PWA using QR/pull mode.
- Android Chrome fingerprint.
- Android older/low-memory device fallback behavior.

### Acceptance

- `npm run lint` passes.
- `npx tsc --noEmit` passes.
- Existing unit tests pass.
- New secure-checkin test suite passes.
- Security reviewer maps each spec invariant to code/tests before staging promotion.

## Recommended Delivery Order

1. Lock environment domain values for local, stable staging, and production.
2. Phase 0 foundation and adapter interfaces.
3. Phase 1 schema and append-only audit.
4. Phase 2 credential enrollment/revocation.
5. Phase 3 reception console.
6. Phase 4 primary biometric flow.
7. Phase 5 in-app/PWA fallback.
8. Phase 6 photo + knowledge fallback.
9. Phase 7 emergency override.
10. Phase 8 compliance dashboard and reports.
11. Phase 9 PWA polish.
12. Phase 10 downstream integration.
13. Phase 11 full test/security review.

## First Implementation Slice

The first safe slice should avoid vendor lock-in while making irreversible architecture decisions correctly:

1. Add schema for credentials, challenges, events, subscriptions, and visit verification.
2. Add append-only SQL trigger for check-in events.
3. Add `SecureCheckInService` skeleton with in-app notification adapter and mocked SMS/face adapters.
4. Add admin `/check-ins` page with member/facility search and challenge initiation.
5. Add member `/member/security` and `/member/check-in` shells.
6. Add tests for challenge lifecycle and append-only audit.

This creates the rails for the module without prematurely choosing push, SMS, or face-match vendors.
