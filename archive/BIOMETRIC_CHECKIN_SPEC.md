# Biometric Member Check-In — Build Specification

> **Module name (suggested):** `secure-checkin`
> **Status:** Spec for implementation. Read the full document before writing code.
> **Companions:** Conforms to `AGENTS.md` and `GEMINI.md` at the project root. Where this document and those documents disagree, those documents win — flag the conflict, do not silently resolve it.

---

## 1. Why this module exists

Avenue Healthcare's largest fraud exposure on the AiCare members club is **identity substitution at the point of care** — a non-member receiving services using an active member's credentials. The Association of Kenya Insurers ranks "servicing non-members" as a top-tier prevalence fraud in the local market, and the SHA's 2024–2025 fraud audit confirmed that biometric verification at intake is the single highest-leverage control. Plastic membership cards and SMS OTPs do not solve this — cards are transferable, SMS is SIM-swappable.

The goal of this module is to make it **cryptographically and physically infeasible** for a person standing at an Avenue reception desk to be confirmed as a member unless they actually are that member, while preserving graceful degradation for legitimate members who cannot complete the primary flow (lost phone, dead battery, elderly member without a smartphone, emergency presentation).

This is a fraud-prevention module first, a UX module second. Where the two trade off, fraud prevention wins — but never to the point of denying emergency care. That balance is the design's central tension and must be preserved through every implementation decision.

---

## 2. The four design principles

These principles override prescriptive details below. If an implementation choice violates one of these, the choice is wrong even if it appears to satisfy a specific requirement.

### Principle 1 — Cryptographic anchor on a member-controlled device

The system trusts a check-in only when a private key, held in a hardware secure enclave on a device the member has previously enrolled, signs a fresh server-issued challenge after a successful local biometric. The biometric itself never leaves the device; we only ever see signatures.

**Why:** This is the only architecture where a stolen card, stolen SIM, stolen ID, or compromised password — individually or in combination — is insufficient to pass check-in. Use the **WebAuthn** standard (the same primitive that powers passkeys). It is built into iOS Safari and Android Chrome, works inside a PWA, and gives us origin-bound, replay-resistant signatures for free.

### Principle 2 — Two-channel proof of physical presence

A valid WebAuthn signature proves *someone with biometric access to the registered device authenticated*. It does **not** prove that person is standing at the Avenue reception desk. To close that gap, every check-in must complete a **bidirectional code exchange**: the server displays a short code on both the reception screen and the member's phone, and reception confirms they match before the visit opens.

**Why:** Without this, a member could authenticate from home while a confederate presents a card at the hospital. The code-match step forces co-location of the authenticated phone and the human at the desk. WebAuthn alone is necessary but not sufficient.

### Principle 3 — Tiered graceful degradation, never hard denial

The flow degrades through three tiers — biometric → SMS+photo → photo+knowledge — and ends, in extremis, with a clinically-authorized override for emergency presentation. **No tier blocks emergency care.** Every override is logged, signed, and retrospectively audited.

**Why:** Kenya's SHA learned this lesson in public during 2024–2025: rigid digital gates denied legitimate care to elderly patients and rural members on flaky networks, generating a national-scale reputational crisis. We will not repeat that. The audit trail, not the front-desk gate, is where overrides are held accountable.

### Principle 4 — Tamper-evident audit on every event

Every check-in attempt — successful, failed, fallback, override — produces an append-only audit record signed with the issuing actor's identity (member device, reception staff, clinical staff). The audit log is the foundation of the PSHP self-scrutiny problem: Avenue is both insurer and provider, and the only thing that keeps internal collusion in check is a record nobody can quietly edit later.

**Why:** Reference the Healthcare Fraud Detection research (`/Healthcare_Fraud_Detection_System_Research.pdf`, §"Mitigating the Insider Threat through System Design"). Without immutable audit, a colluding reception staffer can wave through non-members and the financial damage will only surface months later in claims analytics. With immutable audit, the override pattern surfaces in real time.

---

## 3. The three flows

Implement all three. The system selects the flow based on the member's enrollment state and live conditions, not based on user choice (a member should never have to know which flow they're in — they just see what their phone offers them).

### 3.1 Primary — Biometric path

This is the path for members with a registered device that has a working platform authenticator (Face ID, Touch ID, Android biometric).

**Sequence:**

1. Member arrives at reception. Reception identifies the member by name, member number, NFC tap, or QR scan from the member's PWA — whichever is fastest.
2. Reception clicks **"Initiate secure check-in"** in the AiCare admin app.
3. Server generates a single-use challenge nonce (≥32 bytes of cryptographic randomness), binds it to `{ member_id, facility_id, workstation_id, initiated_at }`, sets a short TTL (90 seconds is the recommended ceiling — long enough for a real human, far too short for an attacker to intercept and replay).
4. Server pushes a notification to **all** of the member's registered devices. Member taps the notification. PWA opens and immediately invokes the WebAuthn `get()` ceremony with the challenge.
5. OS-level biometric prompt appears on the member's phone: *"Verify check-in at Avenue Westlands"*. Member authenticates. The secure enclave signs the challenge.
6. Signed assertion returns to the server. Server verifies the signature against the public key stored at enrollment. If invalid, the challenge is consumed and the flow fails to fallback.
7. On valid signature, server generates a **6-digit visit code** displayed simultaneously on the reception screen and the member's PWA.
8. Reception visually confirms the code matches what the member shows on their phone. Reception taps **"Confirm match"**. Visit opens. Audit record is written.

**Failure modes that must drop to fallback rather than abort:**
- Push notification fails to deliver (common on Kenyan networks). The PWA must offer a "Pull pending check-in" button that polls for an outstanding challenge — do not depend on push exclusively.
- Member taps the notification but biometric fails three times. Auto-lock the device's role in the flow for 10 minutes; route to SMS+photo fallback.
- Challenge TTL expires. Reception sees a clear "expired — restart" state, not a generic error.

### 3.2 Fallback — SMS OTP plus IPRS photo match

Path for members whose registered phone is reachable but lacks a working biometric (no Face ID/Touch ID hardware, biometric disabled, or three failed biometric attempts in the primary flow).

**Sequence:**

1. Server sends OTP to the verified phone number on the member's profile (not a number the member offers at the desk — that vector is exactly what SIM-swap attacks exploit).
2. Reception captures a live photo of the member at the desk.
3. System runs face match against the IPRS-sourced photo on the member's record (the photo retrieved at enrollment via the IPRS API).
4. Both must pass: OTP entered correctly **and** face match score above the configured threshold. Either alone is insufficient — that's the whole point of two-factor.

**Threshold guidance (not a hard rule for implementation):** Face match thresholds should be configurable per facility because lighting at reception desks varies. Default to a conservative threshold and tune from production data, not from vendor marketing claims. Any vendor SDK chosen must publish its accuracy on African skin tones — algorithmic discrimination is both an ethical red line and a practical onboarding-friction killer.

### 3.3 Last-resort — Photo plus knowledge-based verification

Path for members with no phone access at all (lost, dead battery, elderly member who has never owned a smartphone).

**Sequence:**

1. Reception captures a live photo. Face match against IPRS photo on record.
2. Member answers a knowledge-based check generated from their chart: date of birth, full name of a registered dependent, date of last visit, name of the GP they last saw — pick three from a rotating set.
3. Both must pass.
4. **The visit is flagged for retrospective audit** regardless of pass/fail. This tier has the highest false-positive risk and must not be a silent path.

### 3.4 Emergency override

Path for unconscious or otherwise incapacitated patients presenting to the ED.

**Sequence:**

1. Authorized clinical staff (role: `clinician_emergency_override` or equivalent) initiates an override.
2. Clinical staff enters their own credentials and a free-text clinical justification.
3. Visit opens immediately. There is no biometric, no photo, no code.
4. The override is cryptographically signed with the clinician's identity, queued for next-business-day audit, and surfaces in a dashboard the compliance team reviews daily.

**This path is the SHA lesson made operational.** Do not gate emergency care on identity verification. Gate the *audit* on identity verification, and act on the audit.

---

## 4. Data model considerations

The agent must design the schema to fit cleanly into the existing Prisma schema specified in the build documents. Do not duplicate entities that already exist (e.g., `Member`, `Visit`, `Facility`, `User`). Extend.

**New entities the module needs at minimum** (names indicative, not prescriptive):

- A **registered credential** entity binding `member_id` to the WebAuthn public key, credential ID, device metadata (model, OS version, registration timestamp, last-used timestamp), and an active/revoked status. A member may have multiple credentials. **Never store private keys.** WebAuthn's design guarantees we never see them; do not build any pathway that would change that.
- A **check-in challenge** entity — single-use, short-TTL, with the bound context (member, facility, workstation, initiated-by-staff, initiated-at, expires-at, status). Once consumed (success, failure, expired), it cannot be reused. Treat this table as hot and prune aggressively; old challenges have no business value.
- A **check-in event** entity — the immutable audit record. One row per attempt regardless of outcome. Includes which flow was used, which tier the attempt landed at, the staff member who initiated, the clinician who overrode (if applicable), face-match score (if applicable), final outcome, and a hash chain or signature pattern that makes silent edits detectable.

**The audit table is append-only.** No `UPDATE`, no `DELETE`. If the schema layer or ORM doesn't enforce this natively, enforce it at the database level with triggers or revoked permissions. Treat any code path that mutates a check-in event row as a bug to be rejected at review.

---

## 5. Security invariants

These must hold true at all times. If any of them can be violated by any code path in the module, the module is not done.

1. **Challenges are single-use and server-bound.** A signature for a challenge issued for facility A cannot be replayed against facility B, even within the TTL.
2. **WebAuthn ceremonies are origin-bound.** The relying party ID is the production PWA domain. Phishing sites cannot harvest signatures usable against the real system. This is a property of the standard — do not weaken it with permissive RP ID configuration.
3. **A credential can only be added to a member account through one of two paths:** (a) approval from an existing registered credential on that account, or (b) in-person verification at an Avenue branch with photo+IPRS match. Password alone is never sufficient to add a new credential. This closes the phishing-then-enroll attack.
4. **A member can revoke a credential from the web portal at any time.** Revocation is immediate. This is the stolen-phone control.
5. **Rate limits are enforced server-side, not client-side.** Three failed biometric attempts per device per 10 minutes triggers fallback. Five failed challenges per member per hour triggers an account-level review flag.
6. **Geolocation is a soft signal, never a hard gate.** Capture coarse location at signature time; if it's not within a reasonable radius of the facility, flag for review — but do not block the check-in. Members may authenticate from a parking lot, a wheelchair entrance, or anywhere else GPS misbehaves. Hard geofencing produces more support tickets than it prevents fraud.
7. **No PII or biometric data is logged outside the immutable audit table.** Application logs, debug logs, error reporters — none of them ever contain face match scores, ID numbers, IPRS payloads, or signature material. This is not negotiable and must be enforced through structured logging configuration, not developer discipline.
8. **The override path requires a real, named clinician.** Service accounts and shared logins must not be able to invoke emergency override. If the role system permits this today, it must be tightened as part of this module's work.

---

## 6. PWA implementation gotchas (Kenya-specific)

Flagging in advance because they will bite if not designed for:

- **iOS push notifications work only when the PWA is installed to the home screen** (iOS 16.4+). For iOS members who haven't installed it, fall back to a QR code shown on the reception screen that the member's PWA can scan to pull the pending challenge. Do not assume push works.
- **Android Chrome WebAuthn platform authenticator support** is reliable from Chrome 70+, but older devices common in Kenya may report support and then fail silently in the ceremony. Detect this at enrollment time, mark the credential as "soft", and have the fallback path ready by default.
- **Push delivery on Kenyan mobile networks is unreliable.** Always offer a manual "Pull pending check-in" action in the PWA that polls the server. Members should never be stuck waiting for a notification that never arrives.
- **PWAs cannot prompt for biometric outside of an active user gesture.** The biometric prompt must be triggered by the member tapping inside the PWA, not automatically on push arrival. Design the UX accordingly: notification → tap → in-app screen → tap "Verify" → biometric.
- **Battery and storage constraints.** Members' phones may be old and full. Keep the PWA payload lean. Defer non-critical assets. The check-in path must work on a 2GB-RAM Android phone with a slow connection.

---

## 7. Out of scope for this module

To keep the scope tight, these are explicitly *not* this module's responsibility, even though they're related:

- **Biometric enrollment at first use.** That belongs in the onboarding flow which integrates with IPRS. This module assumes a member arrives with credentials already registered (or arrives without and lands in fallback).
- **IPRS API integration.** Already specified elsewhere in the build. This module *consumes* the photo retrieved at enrollment; it does not call IPRS.
- **Pricing or premium logic.** Untouched.
- **Claims adjudication.** A successful check-in opens a visit; what happens on that visit is downstream.
- **Fraud analytics ML layer.** The audit table this module produces is the *input* to that future work, not the work itself. Build the audit table such that downstream ML has clean, complete, structured records to learn from.

---

## 8. Acceptance criteria

The module is done when all of the following are demonstrably true in a staging environment:

1. A member with a registered iOS device receives a push, completes Face ID, and sees a 6-digit code that matches the reception screen — and the visit only opens after reception taps confirm.
2. The same flow works on Android with fingerprint.
3. A member whose phone has no signal can complete check-in via the SMS+photo fallback.
4. A member with no phone at all can complete check-in via photo+knowledge.
5. A clinician can invoke emergency override, the visit opens immediately, and the override appears in the audit dashboard the same day.
6. Three failed biometric attempts auto-route to fallback. The member is never stuck.
7. A revoked credential cannot complete a check-in, even if the device still has the keypair locally.
8. A challenge issued for facility A cannot be used at facility B. Verified by integration test.
9. Adding a new credential requires either an existing credential's approval or a branch visit. Password alone fails. Verified by integration test.
10. The audit table contains a row for every attempt — successful, failed, overridden — with no gaps, and attempts to UPDATE or DELETE rows in that table fail at the database level.

---

## 9. Open questions for the human (do not assume — ask)

1. **Push provider.** Which push service is the PWA expected to use? FCM via the existing app infrastructure, or a new integration? This has a material impact on iOS reliability.
2. **Face match SDK.** Is Avenue already committed to a vendor (Smile ID, FACEKI, Accura Scan, in-house)? The choice affects accuracy on African skin tones, cost per check, and onboarding latency. Do not pick one unilaterally.
3. **Knowledge-based questions in the last-resort tier.** Which fields from the chart are acceptable to use? Some are PII-sensitive in ways legal may have a view on.
4. **Clinical override role.** Does the existing role system have a `clinician_emergency_override` equivalent, or does this module need to introduce it? If introducing, who is the approver of role assignments?
5. **Audit retention.** How long does the immutable audit table need to be retained? Kenyan insurance regulation and any white-label client requirements both bear on this.

Surface answers to these before implementation, not during.

---

## 10. Implementation order

Suggested phasing within this module. Do not collapse phases — each one has a verification checkpoint.

1. **Schema and audit table** (with append-only enforcement at the DB layer). Verify with failing UPDATE/DELETE tests.
2. **WebAuthn enrollment ceremony** wired into existing member onboarding. Verify with a real iOS and a real Android device.
3. **Primary check-in flow** end to end, including the bidirectional code exchange. Verify with both devices and a staged reception interface.
4. **Fallback flow** (SMS + IPRS photo match). Verify including the three-failed-biometric auto-route.
5. **Last-resort flow** (photo + knowledge). Verify the retrospective-audit flag fires.
6. **Emergency override flow** with role gating and same-day audit dashboard surfacing.
7. **Credential management UI** (list, revoke, add-with-approval) in the member web portal.
8. **Rate limiting, geolocation soft signal, anomaly flags.** Verify rate limit cannot be bypassed client-side.
9. **End-to-end integration test suite** covering all acceptance criteria from §8.
10. **Security review** before staging promotion. Specifically: a senior reviewer must trace each invariant in §5 to the code that enforces it.

---

## 11. Regulatory language reminder

Per project-wide policy, this module is part of a **membership** system, not an insurance system. Throughout the codebase, comments, error messages, and any user-facing text:

- Use **member**, not policyholder.
- Use **check-in** or **visit verification**, not claim authorization.
- Use **contribution**, not premium.
- Use **package** or **benefit**, not coverage.

This is not stylistic. It is regulatory positioning. Any drift will be flagged in review and reverted.

---

*End of specification.*
