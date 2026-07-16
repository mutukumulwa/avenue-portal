# Busy TPA Day - Adversarial Resilience and Integration UAT Test Plan

**Campaign:** Second-wave bug-bounty UAT
**Target:** Vercel deployment under test
**Primary aim:** Find severe defects in real operational handoffs, alternate intake rails, offline recovery, exception handling, concurrency, data scope, and financial reconciliation that were not deeply exercised by the earlier outpatient and Busy TPA Day campaigns.

## 1. Why This Campaign Exists

The earlier campaigns proved much of the straight-through claim and settlement spine, but their most valuable findings came from attacking the joins between otherwise working components:

- a valid login followed by a failing redirect;
- a coded line combined with an uncoded line;
- an approved claim arriving after the first settlement run;
- a provider credential crossing an API scope boundary;
- a successful sync acknowledgement that did not produce an operational record;
- a normal-sized settlement that failed only when the batch became large.

This plan therefore treats every handoff, retry, stale snapshot, role boundary, status transition, and alternate input channel as hostile. A screen passing by itself is not enough. The test passes only when the originating event can be traced through every downstream record and when retries, conflicts, and failures create neither lost work nor duplicate money.

## 2. Non-Negotiable Test Rules

1. **No direct database access or mutation.** No Prisma Studio, SQL, database console, seed script, data patch, or direct table inspection may be used to create, repair, move, approve, delete, or verify test data.
2. **All users and setup data are created through the Vercel UI.** Missing users are invited from `/settings`. Provider keys are created and revoked from `/provider/api-keys`. Offline codes are issued and revoked from `/offline-auth`.
3. **API mutation is allowed only when the API or system-to-system handoff is the feature under test.** Use a black-box HTTP client or facility simulator only for `/api/v1/*`, HMS push, mobile-money callback, SMS/USSD, and upload boundary tests. Do not use an API as a shortcut for a UI workflow.
4. **Every API-created effect must be verified in the UI.** A `200`, `201`, or `accepted` response is not a pass. Confirm the claim, PA, case entry, exception, notification, queue item, utilisation, settlement eligibility, report row, and audit trail as applicable.
5. **Never expose live secrets in evidence.** Record only key label, prefix, facility, creation time, revocation time, HTTP status, and a redacted request. Do not paste passwords, API keys, cookies, tokens, health records, or full NINs into screenshots or logs.
6. **Use each persona as themselves.** Do not use SUPER_ADMIN to simulate provider, member, claims, medical, HR, broker, fund, reports, or finance activity.
7. **Do not repair failed records out of band.** A record that cannot be corrected, retried, voided, released, or resolved through the UI is a defect or product gap.
8. **Preserve uncertainty.** If the browser times out after Submit, Mark Paid, Approve, Sync, or Import, do not immediately retry. First inspect the authoritative UI lists, queues, history, notifications, vouchers, and GL to determine whether the first operation committed.
9. **Use disposable, clearly labelled data.** Prefix narratives, external references, filenames, batch references, and descriptions with `BB2-<family>-<case>`.
10. **Stop on uncontrolled financial or privacy impact.** Do not exploit a proven cross-scope write against real records, pay a deliberately inflated claim, or repeat a destructive test after the defect is established.

## 3. Bug-Bounty Severity and Stop Rules

| Severity | Trigger examples | Execution rule |
|---|---|---|
| **Critical** | Cross-tenant/member/provider PII exposure; foreign-facility write; ineligible or exhausted member paid; rejected/unpriced line paid without override; duplicate claim payment or GL posting; offline/HMS retry doubles money; unauthorised role can approve or settle; audit evidence can be erased or falsified | Stop the affected flow, preserve evidence, notify product/engineering immediately, and test only non-destructive adjacent boundaries |
| **High** | Valid work silently lost; accepted sync has no claim or exception; core API/HMS/offline flow unavailable; stale PA or contract bypass; batch claims stranded; wrong member/facility attribution; claim source changes business controls; error uncertainty can reasonably cause duplicate submission/payment | Isolate the scenario, finish read-only evidence, and prevent the record entering payment |
| **Medium** | Recoverable queue or notification gap; wrong status/timestamp; partial import has unclear disposition; incorrect exception ownership; stale report; misleading currency/amount label; retry requires supervisor workaround | Continue if no money/privacy risk and record exact recovery steps |
| **Low** | Copy, focus, layout, minor navigation, or evidence-quality issue without operational ambiguity | Continue and aggregate related defects |

Automatic NO-GO conditions are listed in Section 28.

## 4. Required Personas and Separation

Create only missing personas via `/settings`; never repurpose a portal account into a staff role.

| Persona | Minimum scope | Main duties in this campaign |
|---|---|---|
| SUPER_ADMIN | Tenant | Setup, integrations, offline codes, exceptions, audit, security, emergency access checks |
| Claims Officer A | Tenant operations | Intake, capture, first adjudication, queues, exceptions |
| Claims Officer B | Tenant operations | Concurrent review, conflict and stale-page tests |
| Medical Officer A | Clinical | PA review, medical exceptions, fraud/clinical escalation |
| Medical Officer B | Clinical | Second-person approval and concurrent decision tests |
| Customer Service | Operations | Complaints, member corrections, service requests, status enquiries |
| Underwriter A | Underwriting | Contract/package/quotation and approval requests |
| Underwriter B | Underwriting | Maker/checker and stale approval tests |
| Finance Maker A | Finance | Settlement creation, invoices, reconciliation |
| Finance Maker B | Finance | Concurrent batch creation and duplicate-run tests |
| Finance Checker | Finance | Independent approval and payment |
| Reports Viewer | Read-only | Reports, exports, analytics scope and tie-out |
| Provider A Portal | Facility A | Eligibility, online claim, own API key, statements |
| Provider B Portal | Facility B | Cross-facility controls and collision tests |
| Provider C Portal | Same-client sibling exposure probe | Shared-client/group scope tests |
| Member Principal | Group A | Check-in, PA, claims, alerts, wallet, health privacy |
| Member Dependant | Family A | Dependant routing and principal notification |
| HR Manager A | Group A only | Roster, endorsements, utilisation, service request |
| HR Manager B | Group B only | Cross-employer isolation |
| Fund Administrator | One self-funded group | Fund balance, claims, statement |
| Broker User | Own brokerage | Quote, group, commission, support isolation |
| Facility Offline Clerk | Facility A | Work-code unlock, capture, reconnect, conflict response |
| HMS Simulator | Facility A key | Claims, eligibility, PA, sync, HMS batches, retries |

No user may act as both maker and checker for the same controlled action.

## 5. Minimum Test Portfolio

Prepare the following through the UI. Record IDs and baselines before execution.

| Data set | Required variants |
|---|---|
| Clients/groups | Client A with Group A1 and Group A2; Client B with Group B1; at least one self-funded and one insured group |
| Members | Active principal and dependant; near-limit member; exhausted member; suspended member; terminated member; newly activated member; member transferred between group/tier where UI supports it |
| Providers | Facility A and B active; Facility C suspended or expiring; two branches if available; distinct provider portal users and API keys |
| Contracts | Active FFS tariff; unlisted-service rule; PA-required service; exclusion; expiring/replaced contract; at least one non-base currency or an explicit single-currency configuration |
| PAs | Approved unused; declined; expired; partially used/attached; wrong provider; wrong member; amount below and above eventual claim |
| Cases | Open outpatient episode; open inpatient case; pending closure; closed/filed case; two simultaneous open cases for the same member where allowed |
| Finance | Open settlement cycle; previously settled cycle capable of supplementary run; self-funded balance near threshold; unmatched bank-statement row if reconciliation is enabled |
| Integration | Facility A key, Facility B key, revoked key, redacted operator integration posture, offline work code, and HMS batch reference series |

### 5.1 Mandatory Naming Convention

Use identifiers such as:

- `BB2-API-A-001`
- `BB2-OFF-A-001`
- `BB2-HMS-A-20260713-01`
- `BB2-COLLISION-001`
- `BB2-SETTLE-UNCERTAIN-001`

The same identifier must appear in the request reference, service description, notes, screenshots, and run log.

## 6. Evidence and Reconciliation Controls

For every mutating test capture:

1. actor, role, facility/group scope, browser profile, and time;
2. route and exact click/action;
3. input values and any client reference/idempotency key, with secrets redacted;
4. browser-visible response and HTTP status where an integration is under test;
5. resulting claim/PA/case/exception/batch/voucher/journal number;
6. before and after member benefit, PA hold, fund balance, provider total, and GL values where relevant;
7. notifications and audit/history events, including actor and timestamp;
8. retry count and whether the first attempt was known, unknown, accepted, conflicted, or rejected;
9. final disposition of every input row or offline operation.

Maintain four control ledgers throughout the run:

| Ledger | Required equation |
|---|---|
| **Input conservation** | submitted operations = created records + duplicates + conflicts + rejected records; unexplained difference must be 0 |
| **Claim money** | billed = approved payer share + member share + rejected/excluded/unpriced amount, subject only to documented taxes/rounding |
| **Settlement** | batch total = sum of eligible approved payer shares included exactly once |
| **Accounting** | approval, fund, voucher, payment, GL, provider statement, and report totals reconcile under the signed accounting timing policy |

## 7. Entry Gate - Re-Prove the Previously Fixed Weak Points

Do this before creating the larger portfolio. A failure stops the campaign because later evidence would be unreliable.

| ID | Exact probe | Expected result |
|---|---|---|
| GATE-01 | Log in and out 3 times each as admin, claims, provider, finance, member, HR, fund, reports; include one cold browser | No `/post-login` 5xx, redirect loop, wrong portal, or role bleed |
| GATE-02 | Present the retired/default operator credential and one random key to `/api/v1/eligibility` | Both return 401; no difference revealing whether a member exists |
| GATE-03 | Use Facility A key to request Facility B claim and an out-of-scope member | 404 or policy-approved non-enumerable denial; no PII or amount leakage |
| GATE-04 | Submit one coded line plus one uncoded/unlisted line | Unpriced line contributes 0 or routes to explicit override; full billed is not preselected or payable |
| GATE-05 | Approve a late claim after a same-provider/cycle batch is settled, then create the supplementary run | Run 2 includes only late eligible claims and can settle once |
| GATE-06 | Rapidly submit the same portal claim twice and retry after the duplicate window | Accidental retry does not create two payable claims; later deliberate duplicate is clearly flagged and cannot silently settle twice |
| GATE-07 | Open foreign provider claim/batch URLs as Provider B | Branded denial or not found; no content flash or metadata leak |

## 8. Campaign Timeline - One Hostile Operating Day

Run the families in this order so later tests can collide with realistic in-flight records.

| Time | Operational wave | Test families |
|---|---|---|
| 06:30 | Worker, integration, and opening controls | A, N |
| 07:00 | Facility A loses connectivity; work code issued | C |
| 07:15 | Facility B remains online; same families seek care | B, E |
| 08:00 | Check-ins, PA requests, emergency and routine visits | F, G |
| 09:00 | HMS/API traffic, malformed rows, delayed acknowledgements | A, B, D |
| 10:30 | Membership and contract changes occur while claims are in flight | F, J |
| 12:00 | Facility A reconnects; offline operations arrive out of order | C, E, H |
| 13:00 | Claims teams work queues concurrently | H, O |
| 15:00 | Corrections, appeals, complaints, imports, attachments | K, L, M |
| 16:00 | Maker creates settlement while late records continue arriving | I, O |
| 17:00 | Checker approves; one payment response becomes uncertain | I |
| 18:00 | Reports, statements, notifications, audit, and end-of-day tie-out | K, L, Q |
| Next day | Scheduled jobs, expiry, SLA, pack refresh, reconciliation | N, Q |

## 9. Family A - Credential Lifecycle, Identity, and API Scope

### A1. Facility Key Lifecycle Through the UI

1. Log in as Provider A and open `API Keys` (`/provider/api-keys`).
2. Record existing key labels, prefixes, status, and last-used values.
3. Click `Generate key`, label it `BB2 Facility A primary`, and submit.
4. Verify plaintext appears once. Store it only in the approved test secret store.
5. Refresh and revisit the page. Confirm plaintext is no longer visible.
6. Use the key for one successful own-facility eligibility lookup. Refresh the key page and confirm `Last used` advances.
7. Click `Revoke`; confirm status becomes REVOKED.
8. Retry eligibility, benefits, claim read, claim write, PA write, sync, HMS batch, and upload with the revoked key.
9. Expected: every endpoint rejects it consistently; no write, queue item, exception, notification, or audit event falsely indicates clinical success.

### A2. Credential and Body Identity Mismatch

Using Facility A key, send otherwise valid requests while changing body identifiers one at a time:

| ID | Request mutation | Expected result |
|---|---|---|
| A2-01 | Facility B `providerCode` on claim POST | Rejected or forcibly attributed to Facility A with a clear response; never attributed to B |
| A2-02 | Facility B `providerCode` on PA POST | 403/non-enumerable rejection; no PA at either facility |
| A2-03 | Facility B `facilityCode` on HMS batch | Rejected; no service can be appended to Facility B case |
| A2-04 | Facility B provider code inside offline claim payload under Facility A work code | Work code wins or operation conflicts; never becomes Facility B claim |
| A2-05 | Out-of-scope member in same tenant/client | Non-enumerable denial; no PII, PA, claim, or eligibility balance |
| A2-06 | Member in sibling group under a shared client | Access only if explicit entitlement says so; document the business decision and verify portal/API parity |
| A2-07 | Foreign tenant member/provider if a disposable second tenant exists | Reject before any read/write; do not create a live foreign-tenant record merely to prove impact |

### A3. Authentication Parser and Fail-Closed Behaviour

Test missing key, empty key, random key, revoked key, key with leading/trailing spaces, lowercase `bearer`, duplicate `Authorization`, both `Authorization` and `x-api-key` containing different keys, oversized header, and an unset/misconfigured operator integration in an approved non-production deployment.

Expected: authentication is deterministic, documented, logged without the secret, rate-limited where required, and never falls back to a built-in or cross-tenant credential.

### A4. Secret Exposure and Administration

1. As SUPER_ADMIN, open `/settings/integrations`.
2. Inspect API key/secret fields before and after save, refresh, role change, browser back, and page-source/devtools view.
3. Verify stored secrets are masked and are not returned to the browser as default field values.
4. Open audit logs and confirm creation/update/revocation is logged with actor, integration/facility, and redacted identifier only.
5. As Claims, Reports, HR, Provider B, and Member, attempt direct access to integration and Provider A key routes.
6. Expected: no secret, prefix beyond policy, connection metadata, or test response is exposed outside authorised roles.

## 10. Family B - Cross-Rail Business Rule Parity

Create equivalent claims through provider portal, admin wizard, facility API, offline sync, reimbursement, import, and case closure where supported. Use the same member/provider/date/category pattern but distinct `BB2-PARITY-*` labels.

For each rail verify the same result for:

| ID | Business rule | Adversarial variant |
|---|---|---|
| B-01 | Member eligibility | ACTIVE, SUSPENDED, TERMINATED, group lapsed, future activation |
| B-02 | Provider eligibility | active, suspended, expired contract, wrong branch/facility |
| B-03 | Date validity | future date, leap date, month boundary, midnight Africa/Kampala, old submission window |
| B-04 | Line validity | empty list, zero/negative quantity, zero/negative price, decimal quantity, huge amount, blank description |
| B-05 | Coding | valid CPT, wrong CPT/description pair, duplicate CPT, uncoded line, mixed coded+uncoded, unknown category |
| B-06 | PA | correct, wrong member, wrong provider, expired, declined, already attached, amount lower than claim |
| B-07 | Contract ceiling | coded tariff, name-matched tariff, excluded line, unlisted line, mixed priced/unpriced |
| B-08 | Fraud and duplicate controls | same member/date/provider/category, same invoice ref, high variance, after-hours |
| B-09 | Currency | base currency, non-base if enabled, missing FX, decimals/rounding |
| B-10 | Notifications and audit | exact originating source, actor/system attribution, one intake notification |

A rule that blocks in the UI but passes through API, offline, HMS, import, or case closure is at least High and Critical if it can create payable money.

## 11. Family C - Offline Work and Reconnection War Game

This is the primary new campaign. Use a dedicated browser profile representing a shared facility workstation.

### C1. Authorisation and Pack Acquisition

1. As SUPER_ADMIN or authorised operations user, open `/offline-auth`.
2. Select Facility A, enter caller name/phone/reason `BB2 outage`, set the shortest practical validity, and click `Issue code`.
3. Record the masked register row, facility, issuer, validity, status, and operation count. Do not put the full code in evidence.
4. In the facility browser, open `/offline-capture`, enter the code, and click `Unlock offline work`.
5. Verify the pack shows Facility A member and tariff counts and a valid-until timestamp.
6. Search the offline roster for an entitled member, a sibling-group member, an out-of-client member, suspended member, and unknown member.
7. Expected: the pack contains only policy-entitled active members and Facility A tariffs; it does not expose Provider B or unrelated group data.
8. Issue a second code for Facility A. Confirm the first is revoked/superseded and cannot unlock a new browser session or sync new work.

### C2. True Offline Capability

1. While still online and unlocked, capture screenshots of the page and outbox baseline.
2. Use browser network controls or physically disconnect the test device.
3. Verify the status changes to `Offline` without a page crash.
4. Capture three claims for different members and service types. Record the local time and expected totals before clicking each `Capture (offline-safe)` button.
5. Refresh the current route while still offline.
6. Close and reopen the tab while still offline.
7. Restart the browser while still offline.
8. Expected: the supported offline screen and its necessary assets load, the unlocked session follows the signed security policy, and all pending operations remain visible exactly once. A fallback to `/login`, blank page, inaccessible admin route, or lost outbox is a functional failure of the offline claim.
9. Click `End session`, then verify work code and cached roster are no longer available to the next workstation user while already-captured outbox items follow the approved custody policy.

### C3. Reconnect and Exact-Once Assimilation

1. Restore connectivity but do not click Sync immediately.
2. Observe whether automatic sync starts. Record every request/status without retrying manually.
3. If operations remain pending, click `Sync now` once.
4. While the request is in flight, simulate one of: connection drop, slow 3G, response blocked after server commit, page refresh, and tab close. Use separate operations for each variant.
5. Reopen and click `Sync now` again only after checking outbox and server-facing UI lists.
6. For each operation verify exactly one of: claim created, duplicate recognised, conflict created, or explicit rejection.
7. Search `/claims`, `/claims/queues`, `/settings/exceptions`, member utilisation, provider claims, notifications, and audit log using the marker.
8. Expected: no input disappears; no claim is duplicated; source is `OFFLINE_SYNC`; captured event date is preserved; final state and reason appear locally and operationally.

### C4. Stale Snapshot Conflicts

After acquiring the offline pack and disconnecting, change the authoritative state online through another persona, then capture offline and reconnect.

| ID | Online change while Facility A is offline | Expected on sync |
|---|---|---|
| C4-01 | Suspend member | Conflict; no payable claim; reason and exception visible |
| C4-02 | Terminate/lapse group | Conflict; no claim or benefit usage |
| C4-03 | Another facility consumes the remaining benefit | Deterministic conflict/member-liability route; no overspend |
| C4-04 | Approve a PA that places a hold | Available balance accounts for the hold |
| C4-05 | Expire/revoke PA before reconnect | Claim cannot silently use it |
| C4-06 | Suspend Facility A contract | Conflict or policy-approved retrospective handling based on captured event time |
| C4-07 | Replace tariff/contract after service time | Pricing uses signed effective-date policy, not simply latest tariff |
| C4-08 | Transfer member to another group/tier | Eligibility and benefits follow effective-date policy with visible rationale |
| C4-09 | Self-funded balance falls below threshold | No unauthorised drawdown; exception/hold follows policy |
| C4-10 | Revoke or expire offline work code before reconnect | Buffered work is retained but quarantined for review, not discarded or trusted |

### C5. Ordering, Volume, and Device Collisions

1. Capture 10 sequential operations for one member with known totals, then sync newest-first and oldest-first from two device profiles.
2. Capture the same clinical event independently on two offline devices under the same facility code.
3. Capture at Facility A offline while Facility B submits the same event online.
4. Queue 100 small operations, reconnect, interrupt at approximately 30%, and retry the entire pending set.
5. Reuse a client UUID/op key deliberately with changed payload through the integration harness.
6. Send the same client UUID under a different op key and the same op key under a different device ID.
7. Expected: server idempotency is payload-safe, duplicates do not become money, changed-payload replay cannot overwrite the first event silently, and all outcomes reconcile to the input-conservation ledger.

### C6. Unsupported Offline Entity Types

Submit offline operations labelled `CheckIn`, `PreAuth`, and `Image` through the supported client/harness.

Expected: each creates the promised domain record or returns a visible unsupported/rejected/conflict state. It must never say `SYNCED` merely because the envelope was accepted while creating no check-in, PA, image, or exception.

### C7. Conflict Operations Workflow

1. Create conflicts for unknown member, insufficient balance, invalid/revoked code, malformed line, and unresolved provider.
2. Open `/settings/exceptions` as the intended operational owner.
3. Verify marker, member/facility context, source, captured time, reason, payload summary, and safe next action are visible.
4. Attempt correct, retry, assign, resolve, dismiss, and reopen actions if the UI exposes them.
5. Verify the original operation cannot be both resolved manually and later auto-reconciled into a second claim.
6. Confirm Claims/Medical/Customer Service can access the exceptions they are expected to work; a queue visible only to SUPER_ADMIN is an operational gap.

## 12. Family D - HMS Batch and Delayed Hospital Feeds

Run both the manual HMS upload exposed by the case UI and the push API with a facility-generated key. Never infer success from the response alone.

### D1. Valid Daily Feed and Conservation

1. Open a case for an eligible member at Facility A through `/cases/new`.
2. Record case number, provider, admission/event dates, PA/LOU links, and accrued amount 0.
3. Submit a version-1 batch containing consultation, lab, imaging, pharmacy, procedure, and other lines on separate dates.
4. Verify response counts: total = applied + duplicates + unmatched/rejected.
5. Open the case and recompute each line and total manually.
6. Verify source/reference, entry date, code, description, quantity, unit amount, and line total.
7. Replay the identical batch and confirm accrued amount does not move.

### D2. Facility and Case Attribution Attacks

| ID | Attack | Expected result |
|---|---|---|
| D2-01 | Facility A key sends Facility B code | Rejected before case lookup; no B case mutation |
| D2-02 | Correct facility, foreign case number | Unmatched exception; no cross-facility append |
| D2-03 | Member fallback with exactly one open case | Correct case only |
| D2-04 | Member fallback with two open cases | Ambiguous exception; no arbitrary selection |
| D2-05 | Member fallback when only a closed case exists | Exception; closed claim remains immutable |
| D2-06 | Same batch reference used by Facility A and B | Provider-scoped idempotency; no cross-facility collision or suppression |
| D2-07 | Hidden/internal provider ID, display name, renamed provider, SMART/HMS code variants | One documented stable identifier works; ambiguity or rename cannot redirect feeds |

### D3. Clinical-Date and Money Validation

Test entry before admission, after discharge, in the future, on a closed case, during pending closure, wrong timezone day, quantity 0, negative quantity, decimal quantity, unit amount 0, negative amount, extremely large amount, too many decimal places, unknown category, blank service code, and blank/whitespace description.

Expected: unsafe lines are rejected or quarantined individually with reasons; safe lines continue only if partial acceptance is documented. No invalid line accrues to the case, files into a claim, consumes benefits, or reaches settlement.

### D4. Corrections and Replay Mutation

1. Submit a valid line.
2. Replay it with changed amount only, changed description only, different whitespace/case, and a new batch reference.
3. Submit a negative/cancellation line if the contract supports corrections.
4. Attempt to correct after case closure and after claim approval.
5. Expected: corrections use an explicit adjustment/void path with audit and linkage. A tiny payload change must not bypass duplicate protection and create a second full charge.

### D5. Partial Failure and Exception Storm

1. Send one batch containing valid, duplicate, unknown case, invalid date, wrong provider, and malformed money lines.
2. Replay it three times after an uncertain response.
3. Confirm valid entries apply once, duplicates remain duplicates, and unmatched rows do not create a fresh identical exception on every retry unless each occurrence is intentionally linked/deduplicated.
4. Verify operations can see and resolve the exception set without counting retry noise as new clinical events.

### D6. Integration Configuration Honesty

1. As admin open `/settings/integrations`, configure HMS as enabled with a harmless approved UAT endpoint.
2. Observe connection status, last sync, error state, and scheduled poll evidence.
3. Disable the endpoint, expire credentials, and make it unreachable.
4. Expected: the UI never reports CONNECTED or recent sync solely because configuration saved; a push-only/stub poll transport is clearly represented and failed polling becomes operationally visible.

## 13. Family E - Duplicate and Collision Attacks Across Intake Rails

Use the same member, provider, date, category, amount, diagnosis, invoice reference, and service marker while submitting through combinations of portal, API, offline, HMS/case, import, reimbursement, and admin wizard.

| ID | Collision | Required proof |
|---|---|---|
| E-01 | Portal then API | One payable event; second blocked or routed as duplicate |
| E-02 | API timeout then identical retry | Idempotent response or duplicate quarantine; no new claim number/payable |
| E-03 | Offline then online before reconnect | Reconnected operation detects online record |
| E-04 | Two offline devices | Same clinical event cannot settle twice |
| E-05 | HMS case line plus direct claim | Case closure cannot create a second payable event unnoticed |
| E-06 | Import file plus portal claim | Row-level duplicate detection and clear import disposition |
| E-07 | Reimbursement plus provider claim | Member reimbursement and provider payment cannot both pay the same service without explicit coordination |
| E-08 | Same invoice ref, changed one amount/description/date | Fuzzy controls route suspicious near-duplicates to review |
| E-09 | Same family principal/dependant identifiers | No false merge across different covered persons |
| E-10 | Two simultaneous valid new claims | Claim numbers remain unique and neither request fails from count-based race |

For any pair that creates two claims, carry both only to pre-settlement review. Verify duplicate controls prevent both from entering the same or separate batches.

## 14. Family F - Check-In, Eligibility, and Encounter Binding

1. Start member self check-in and reception check-in for the same visit in parallel.
2. Replay the QR/reception challenge, reuse it at Provider B, use it after expiry, and attempt verification after member suspension.
3. Complete check-in for a dependant and verify the correct member/family identity.
4. Start claim intake before check-in completes, then complete it in another tab.
5. Use a valid check-in for a second claim/date/provider.
6. Disconnect after challenge creation and reconnect after expiry.
7. Expected: challenges are one-time, time-bound, facility-bound, member-bound, auditable, and cannot be replayed to legitimise another encounter. Claim/check-in linkage and fraud board show the correct source without exposing biometric or fallback secrets.

## 15. Family G - PA, LOU, Hold, and Case Lifecycle Races

### G1. PA Source and Retry Parity

Create equivalent PAs through member portal, admin UI, and facility API. Test repeated Submit, timeout retry, wrong provider code, out-of-scope member, zero/negative estimate, missing diagnosis, huge estimate, and unsupported category.

Expected: one PA per intended request, unique reference under concurrency, correct submitter/facility, consistent validation, and no PII disclosure.

### G2. Decisions, Holds, and Attachments

1. Have Medical A and Medical B open the same submitted PA.
2. Approve in one tab while declining in the other.
3. Verify one terminal decision and one friendly stale-state rejection.
4. Confirm the approved amount places the correct benefit hold exactly once.
5. Attach the PA to a smaller claim, a larger claim, a wrong-member claim, wrong-provider claim, expired PA, and a second claim.
6. Verify partial use, release, conversion, expiry, and cancellation follow policy without destroying unused cover or double-consuming benefit.

### G3. Case Evolution

1. Create an empty case and attempt closure.
2. Add manual and HMS lines concurrently.
3. Void one line, attach PA/LOU, mark pending closure, and submit a late HMS line.
4. Close/file the case twice from separate tabs.
5. Attempt edits after close and after the resulting claim is captured/approved.
6. Expected: exactly one claim, only valid non-voided lines, immutable closed financial facts, correct PA/LOU utilisation, and a visible exception for late services.

## 16. Family H - Queues, Exceptions, Overrides, Fraud, and Appeals

1. Trigger duplicate, contract-unpriced, insufficient-benefit, PA mismatch, offline conflict, HMS unmatched, suspicious variance, and missing-document conditions.
2. Verify each appears in the correct queue with source, age/SLA, owner, severity, and safe deep link.
3. Assign and reassign to another officer; refresh in both sessions.
4. Resolve from one tab while another submits a decision.
5. Raise an override for above-contract payment and attempt self-approval.
6. Clear or escalate a fraud alert and attempt claim approval before clearance.
7. Appeal a declined/partial claim; attempt settlement before appeal completion; approve/decline appeal and verify resulting amount/state.
8. Void a claim before and after approval; confirm benefit, fund, payable, settlement, and GL reversals follow policy.
9. Expected: no queue item vanishes, no original officer self-approves controlled exceptions, no pre-clearance settlement, and every state transition has actor, reason, timestamp, and financial reversal where required.

Any status listed in the product but unreachable through the UI must be recorded as an operational gap, not treated as passed by code existence.

## 17. Family I - Settlement Under Uncertainty and Concurrent Finance

### I1. Concurrent Batch Creation

1. Finance Maker A and B select the same provider/cycle at the same time.
2. Both click `Create Batch` within one second.
3. Expected: claims belong to one batch/run only; the loser receives a clear current-state message.
4. Repeat when a settled Run 1 exists and late approved claims require Run 2.
5. Approve another claim while batch creation is in flight; document the deterministic cutoff.

### I2. Claim Changes After Batching

Before checker approval, attempt to void, appeal, reduce, re-adjudicate, or fraud-hold a batched claim. Also suspend the provider and change bank/payment details.

Expected: either the batch locks a reviewable snapshot and blocks changes, or it revalidates/removes changed claims before approval. Checker must see what changed. No stale amount can be paid silently.

### I3. Batch Rejection and Release

1. Maker submits a batch.
2. Checker rejects with reason.
3. Confirm every claim is released to the correct unsettled state.
4. Create a replacement batch and verify totals.
5. Reject twice, abandon a draft, and create a supplementary run.
6. Expected: no stranded claims, duplicate assignment, lost rejection reason, or run-number collision.

### I4. Uncertain Payment Response

1. Open a checker-approved test batch.
2. Record batch, claims, voucher count, provider statement, fund, and GL baselines.
3. Click `Mark Paid` once under slow network and interrupt the response after the request leaves the browser.
4. Do not retry. Reopen batch/list/claims/GL/provider statement first.
5. If still uncertain, retry once.
6. Expected: exactly one settled transition, voucher, bank/cash posting, payable clearing, claim PAID update, provider statement entry, and payment notification.

### I5. Money Edge Cases

Test partial approval, member share, co-contribution collection, tax/rounding if configured, zero payer share, non-base currency, missing FX, mixed currencies, negative/reversal entries, self-funded insufficient balance, and a 250+ claim batch.

Expected: no raw cross-currency sum, no rejected/member-paid amount in provider payment, no second debit, GL balanced, and user-friendly timeout/error handling.

## 18. Family J - Membership, Endorsement, and Effective-Date Hardening

1. HR submits add member, remove member, tier change, dependant change, salary/limit change, and demographic correction requests.
2. Admin and HR open the same endorsement; submit/approve/reject concurrently.
3. Verify maker/checker where required and prevent requester self-approval.
4. Use effective dates before service, on service date, after service, month end, renewal boundary, and in the future.
5. Create a claim before an endorsement, adjudicate after it, and settle after another change.
6. Transfer a member between groups or tiers while PA, hold, case, and claim are open.
7. Terminate principal while dependant has an open claim; reinstate later.
8. Verify pro-rata contributions to the smallest supported currency unit, invoice/fund impact, roster, portal access, package limits, and historical claim preservation.
9. Expected: coverage is resolved by signed effective-date policy, not whichever state happens to be current when an asynchronous process runs.

## 19. Family K - Scope, Privacy, and Portal Propagation

For every record created in this campaign, test both list visibility and direct URL access.

| Actor | Must see | Must not see |
|---|---|---|
| Provider A | Own eligible members per contract, own claims, own settlements, own key metadata | Provider B claims, batches, keys, bank data, unrelated members/groups |
| Member/principal | Own and policy-approved dependant benefits, claims, PAs, alerts | Other families, provider internal notes, fraud investigation notes |
| HR A | Group A roster and aggregate utilisation | Diagnoses/clinical notes beyond policy, Group B or sibling-client data |
| Fund admin | Assigned self-funded group balances/claims/statements | Other funds, provider keys, unrelated member PII |
| Broker | Own book, quotes, groups, commissions | Other broker clients, claim-level clinical detail beyond policy |
| Reports viewer | Approved read-only tenant reports | Mutation controls, secrets, private health-vault data |
| Customer service | Support and minimum member context | Finance approval, integration secrets, private health-vault contents |

Specific high-value probes:

1. Shared-client sibling groups: test UI, API eligibility/benefits, exports, analytics drill-downs, and direct member URLs.
2. Search enumeration: compare unknown vs forbidden member/claim responses and timing.
3. Export filters: alter group/provider IDs in the URL and downloaded request.
4. Health vault: attempt member-to-member, staff, provider, HR, and Reports access to documents, vitals, voice notes, and shares.
5. Sensitive diagnosis: verify member, HR, broker, fund, provider, and report views receive only the approved minimum.
6. Browser history and cached pages: sign out Provider A, sign in Provider B in the same profile, and use Back/refresh.

## 20. Family L - Notifications, Correspondence, and Support Chains

1. Trace exact-once in-app notifications for intake, PA decision, claim decision, payment, dependant claim, appeal, co-contribution, and conflict where policy requires it.
2. Retry each originating action and verify no duplicate alert/email/SMS job.
3. Verify the principal receives dependant notifications without exposing them to an unrelated family account.
4. Click every notification deep link after status change, sign-out/sign-in, and as the wrong user.
5. Mark one/all read in two tabs and verify unread counts converge.
6. Raise a member complaint and HR service request; assign, reply, resolve, reopen/dismiss, and verify both portals see consistent status and correspondence.
7. Include markup, long text, Unicode names, HTML/script text, spreadsheet formula prefixes, phone numbers, and attachments in safe test fields.
8. Expected: content is escaped, recipients are scoped, statuses agree, and no delivery failure breaks the underlying financial/clinical transaction.

Where SMS/email/mobile money is stubbed or not configured, test that the UI says so honestly and that the clinical workflow has a documented fallback. A fake success status is a defect.

## 21. Family M - Imports, Uploads, and File Boundaries

### M1. Claims and Member Imports

Create files through ordinary spreadsheet tools; do not generate records directly in the database.

Test valid file, duplicate rows, duplicate file replay, reordered columns, missing column, extra column, blank rows, BOM, quoted comma/newline, `dd/mm/yyyy` vs `mm/dd/yyyy`, leap day, decimals, negative/zero amounts, mixed currency, unknown member/provider/code, 1 row, maximum agreed rows, and a file with valid and invalid rows interleaved.

Expected: a preview states exactly what will create, skip, conflict, or reject; commit is idempotent; partial success is explicit; every row has a terminal disposition; replay cannot create new payable claims.

### M2. Spreadsheet Injection

Place values beginning `=`, `+`, `-`, and `@` in names, references, descriptions, and notes. Export them through claims, provider statements, HR roster, fund statement, and reports.

Expected: exported CSV/XLSX neutralises spreadsheet formulas without corrupting legitimate values.

### M3. Documents and Media

Test correct PDF/image, wrong MIME extension, executable renamed as PDF, oversized file, zero-byte file, duplicate upload, corrupt image, password-protected PDF, long filename, traversal-like filename, and image/voice operation captured offline.

Expected: type/size validation, malware-control policy, private storage, role-scoped download, stable retry, and no `SYNCED` state without a retrievable document or exception.

## 22. Family N - Worker, Jobs, Time, and Operational Visibility

Run only in an approved UAT environment where the worker can be paused safely.

1. Establish job health through the UI/logging approved for testers: last analytics refresh, pending approvals, SLA age, PA expiry, offline pack generation, fund alert, billing/admin fee, quotation expiry, and notifications.
2. Pause or isolate the worker/Redis for an approved window without changing database records.
3. Create one event for each time-based workflow through the UI.
4. Verify the application exposes degraded/stale state instead of appearing healthy.
5. Restore the worker and confirm backlog drains once, in a deterministic order, without duplicate notifications, accruals, expiry, claim decisions, or packs.
6. Restart the worker twice and confirm repeatable schedules do not double-register materially.
7. Test Africa/Kampala midnight, month/year end, leap day, DST-free timezone assumptions, and server/browser clock skew.
8. Expected: every delayed job is observable, retry-safe, and reconciled. Silent dependence on an absent worker is at least High for approvals, expiry, billing, or offline assimilation.

## 23. Family O - Browser, Session, Concurrency, and Deployment Resilience

### O1. Session and Form State

Test session expiry while filling and while submitting claim, PA, endorsement, offline sync, import, approval, settlement, and profile forms. Use refresh, browser Back/Forward, duplicate tab, two accounts in separate profiles, and sign-out in another tab.

Expected: no wrong-user commit, lost draft without warning, duplicate operation, cached foreign data, or raw error. Re-authentication returns to a safe, current state.

### O2. Stale Concurrent Decisions

Open the same claim, PA, fraud alert, override, endorsement, complaint, and settlement in two authorised sessions. Make conflicting decisions within one second.

Expected: one transition wins; the other receives a friendly stale-state response and refreshes to the authoritative state. Both cannot create irreversible side effects.

### O3. Network and Vercel Behaviour

For critical actions test online, Slow 3G, 2% packet loss where available, response abort, cold route, and a controlled deployment between page load and Submit.

Expected: no `/post-login` recurrence, hydration/application error, stale service-worker bundle, secret-bearing URL, duplicate submit, or uncertainty without an idempotent recovery path.

### O4. Device Matrix

At minimum run critical facility and portal journeys on current Chrome desktop, one Safari/WebKit path, one Android-sized viewport, and one low-memory/slow-network profile. Verify long tables, buttons, totals, modals, and offline status remain usable without overlap or hidden controls.

## 24. Family P - Audit, Security, and Abuse Hardening

1. Verify every mutation in this plan appears in audit/history with actor/system identity, source rail, before/after state, reason, and timestamp.
2. Verify API key use is attributed to the facility/key ID, not a generic unscoped operator.
3. Verify offline operations link to code, issuer, facility, device/client UUID, captured time, sync time, and outcome.
4. Attempt direct URLs and actions for every lower-privileged role, not only hidden navigation.
5. Submit HTML/script, SQL-like strings, long input, control characters, Unicode confusables, and formula prefixes into safe text fields. Confirm no execution, broken export, log forging, or layout takeover.
6. Check that raw exceptions, Prisma/schema names, environment values, stack traces, internal IDs, signed URLs, and secrets are not shown in pages, query strings, exports, or notifications.
7. Verify login/reset/2FA/WebAuthn rate limits, token single use, password policy, deactivated-user session invalidation, and member device revocation.
8. Verify audit filtering/export cannot be used to view another tenant/scope and that ordinary users cannot edit/delete audit history.

## 25. Family Q - End-of-Day Conservation and Tie-Out

At 18:00 and next morning, reconcile every `BB2-*` record without database queries.

| Control | UI evidence | Pass equation |
|---|---|---|
| Offline/HMS/API conservation | Outbox, HTTP reports, exception register, claims/cases | inputs = created + duplicate + conflict + rejected |
| Claim adjudication | Claim lines and summary | billed = approved + member share + rejected/excluded/unpriced |
| PA and benefit | PA/hold panels, member benefits/utilisation | opening available - approved usage - active holds + releases = closing available |
| Self-funded account | Fund portal/statement | opening + deposits - approved drawdowns +/- reversals = closing |
| Settlement | Batch detail, claims, provider statement | batch total = unique eligible approved payer shares |
| Voucher and GL | Voucher, trial balance, ledgers | one payment = one voucher = one payable clearing/cash entry; debits = credits |
| Reports | CSV/PDF and source screens | counts and totals match the same filters/as-of time |
| Notifications | Member inbox and event history | one policy-required event = one intended notification |
| Audit | Audit log and entity history | every mutation has one truthful, scoped attribution |

Investigate every zero only when zero is expected. A balanced GL does not excuse a wrong claim amount, wrong payer, wrong provider, duplicate voucher, or missing operational record.

## 26. Family R - Under-Tested Portfolio Operations

These workflows are not all part of a single outpatient claim, but they alter who is covered, what can be paid, which provider rates apply, how the TPA earns revenue, and what management sees. Test them as connected operational chains rather than isolated forms.

### R1. Provider and Contract Lifecycle During Live Work

1. Create or select a disposable provider and progress it through pending, active, suspended, expired, and reactivated states only through supported UI actions.
2. At each state inspect eligibility, check-in, PA, claim, offline-code, case, API-key, HMS, and settlement selectors.
3. Start an encounter while active, suspend the provider before submission, reactivate before adjudication, and expire/replace the contract before settlement.
4. Replace an active contract with a successor effective on the service date boundary. Test one line before, on, and after the boundary.
5. Change tariff, unlisted-service rule, PA rule, exclusion, payment terms, branch applicability, and currency while claims remain RECEIVED, CAPTURED, APPROVED, and BATCHED.
6. Expected: new work follows operational status; historical work uses the signed effective-date and snapshot policy; existing legitimate payables are not stranded; no user can backdate a contract/rate change without required override and audit.

### R2. Quotation, Binding, and Initial Membership

1. Broker creates a quote for their own prospect; another broker attempts direct access.
2. Underwriter assesses, adds exclusions/waiting periods/loadings, builds rates, sends, and records acceptance.
3. Use two underwriters to test maker/checker binding and stale decisions.
4. Bind insured and self-funded variants. Verify group, tiers/packages, initial members, effective dates, debit note/deposit request, broker relationship, and portal visibility.
5. Interrupt between each binding step and retry after an uncertain response.
6. Attempt to bind expired, rejected, already-bound, incomplete, and altered-after-acceptance quotes.
7. Expected: one group and one set of memberships per accepted quote, no partial invisible state, no requester self-approval, and every financial document ties to the accepted version.

### R3. Client Billing, Receipts, and Admin Fees

1. Establish group/member counts, contribution rates, invoice period, funding mode, and admin-fee agreement through the UI.
2. Trigger or await the approved billing/admin-fee run; do not use database/job shortcuts.
3. Verify one invoice/accrual per group/period and recompute quantity, rate, tax, total, due date, and currency.
4. Replay/restart the run, change member count/effective date at period boundary, and correct a prior-period endorsement.
5. Record full, partial, duplicate-reference, over-, under-, and wrong-invoice receipts if supported.
6. Expected: runs are idempotent, proration is deterministic, receipts allocate once, outstanding balances agree across finance/HR/client views, and GL entries balance.

### R4. Bank Reconciliation and Uncertain Cash Events

1. Upload an approved disposable bank statement containing exact match, amount mismatch, date mismatch, duplicate, reversal, unknown reference, and one-to-many candidates.
2. Review automatic matches before accepting; attempt concurrent matching by two finance users.
3. Reject/unmatch and rematch where supported, preserving history.
4. Replay the same statement and a renamed copy.
5. Expected: one bank row can settle one intended cash event only, ambiguous rows require review, replay is recognised, and reconciliation cannot create a second receipt/payment/GL effect.

### R5. Broker Commission and Renewal Propagation

1. Verify commission schedule and broker assignment before a relevant billing/settlement event.
2. Change broker or tier effective mid-period and run/retry reconciliation.
3. Compare broker portal ledger, finance record, source premium/admin-fee basis, rate, tax/withholding, and payout batch.
4. Attempt cross-broker direct URLs/exports and self-approval of payout where controlled.
5. Create a renewal scenario from actual utilisation, change a source claim after snapshot, and refresh/recompute.
6. Expected: commission accrues exactly once to the correct broker/effective period; renewal analytics disclose their as-of time and do not silently use stale or foreign data.

### R6. Member Wallet and External Payment Callbacks

Run only with approved sandbox credentials and disposable amounts.

1. Initiate a member co-contribution payment from `/member/wallet` and record the pending reference.
2. Send valid callback, invalid signature, wrong amount, wrong phone/member, unknown reference, duplicate callback, delayed callback after timeout, success-after-failure, and failure-after-success.
3. Refresh/back/retry initiation during an uncertain response.
4. Expected: signature and reference are mandatory, terminal success is immutable without explicit reversal, duplicate callback is idempotent, one payment updates member liability once, and claim/provider settlement/GL cannot collect the same share again.
5. If the Uganda payment rail is unimplemented or stubbed, the UI must state that honestly and must not present a simulated response as real settled funds.

### R7. Cross-Border and FX Case

1. Create a cross-border case with facility, referral, preauthorisation/LOU, transaction currency, estimated and actual line items, coordination fee, and rate date.
2. Test missing FX, expired FX, rate changed between approval and payment, partial approval, cancelled trip, duplicate foreign invoice, and domestic provider entered as foreign.
3. Compare member benefit, fund, provider/foreign payee amount, base-currency GL, reports, and audit.
4. Expected: transaction and base currency are explicit, no raw currency addition occurs, rounding follows policy, cancellation/reversal releases holds, and foreign-care data remains correctly scoped.

### R8. Compliance and Data-Subject Operations

1. Create a disposable consent record, correction/access request, deletion/restriction request, breach incident, and processor record through `/compliance/privacy` where supported.
2. Route, assign, update, and close requests using distinct actors; test deadline/SLA and attachment visibility.
3. Attempt a privacy request that conflicts with legally retained claim/GL/audit records.
4. Export or fulfil an access request and verify it contains only the subject's approved data, not another family/group/provider or internal secret.
5. Expected: privacy workflow is auditable, scoped, deadline-visible, and preserves mandatory financial/audit records while applying lawful restrictions to operational views.

### R9. Wellness, Health Vault, and Clinical Separation

1. Enrol a member in a wellness programme, record activity/points, and retry the same event.
2. Verify cadence, funded amount, eligibility, and reports without creating a provider claim unless product policy explicitly does so.
3. Add health-vault document, vitals, journal, and share; revoke the share and retry the old link.
4. Expected: wellness events are idempotent and financially separated from claims; private health data remains member-controlled and is never exposed to HR, broker, fund, reports, or unrelated provider/staff roles.

## 27. High-Value Bounty Needles

These hypotheses deserve deliberate effort because current and prior behaviour make them plausible:

1. A facility key may be correctly scoped on eligibility/claims but not on `/sync`, `/hms-batch`, upload, or another write endpoint.
2. An accepted offline entity other than `Claim` may be marked synced without creating a domain record.
3. An admin-scoped offline route may not actually reload while disconnected even though local outbox data survives.
4. Automatic reconnect sync may use different authentication or outcome handling from the manual `Sync now` action.
5. A stale work code or pack may retain readable member data on a shared workstation after logout/end session.
6. Reverse-order offline claims may overspend benefits if each validates before prior operations update usage/holds.
7. Changed-payload retries may evade idempotency while preserving the appearance of one batch/reference.
8. HMS replay may deduplicate applied lines but create duplicate exceptions for every unmatched retry.
9. A future, pre-admission, post-discharge, zero, or negative HMS line may accrue because envelope validation is weaker than UI validation.
10. Claim/PA reference generation based on current count may collide under concurrent API submissions.
11. API claim creation may allow same-tenant but non-entitled members even though API reads are entitlement-scoped.
12. An invalid PA reference may be silently ignored, creating an apparently ordinary claim without the expected PA control.
13. A claim changed after batch creation may still pay the stale snapshot.
14. A rejected settlement batch may leave claims attached and unavailable to a replacement run.
15. A timed-out Mark Paid request may commit once and then commit again on operator retry.
16. Shared-client modelling may leak sibling employers through provider/API/report scope.
17. Integration configuration may expose stored keys to the browser or report a stub connector as connected.
18. Worker downtime may silently stop offline reconciliation, expiry, escalation, billing, or analytics without an operator alert.
19. Cross-channel near-duplicates may both pass because each rail uses a different duplicate key.
20. CSV/PDF exports may be correctly scoped on screen but accept a foreign group/provider ID in the download request.

Finding one of these does not close the family. Test the nearest analogous endpoints and downstream financial effects without causing real harm.

## 28. Automatic NO-GO Conditions

The release remains or returns to NO-GO if any of the following is observed:

- any cross-tenant, cross-provider, cross-employer, cross-family, or health-vault privacy breach;
- any facility credential can create or alter another facility's claim, PA, case, service, upload, or sync operation;
- any accepted operation is neither materialised nor visible as a resolvable conflict/rejection;
- retry, replay, concurrency, import, offline reconnect, or uncertain response can create duplicate payable money;
- current eligibility, benefit, PA, contract, exclusion, fraud, member share, fund, or approval rules can be bypassed by changing intake rail;
- invalid/future/negative service data can become billable or settleable;
- a controlled action allows self-approval or a stale second irreversible decision;
- a claim can be paid twice, paid to the wrong provider, paid at a stale amount, or posted inconsistently to fund/voucher/GL;
- worker or integration failure is silent and strands time-critical work without an operator-visible recovery path;
- required evidence cannot be produced through supported UI/API interfaces and would need a database repair or query to operate safely.

## 29. Exit Criteria

The campaign may declare GO only when:

1. all entry-gate fixes pass on the exact deployed build;
2. every scenario is PASS, accepted N/A with product rationale, or has a closed/retested defect;
3. every integration/offline/HMS input has a terminal, UI-visible disposition and the conservation difference is zero;
4. all cross-rail parity checks produce the same eligibility, pricing, fraud, approval, member-share, and notification rules;
5. no open Critical or High defect remains;
6. all Medium financial, privacy, exception-ownership, and recovery issues are fixed or explicitly accepted by named owners with compensating controls;
7. concurrent settlement and uncertain-response tests produce exactly one voucher/payment/GL result;
8. member, provider, HR, fund, broker, reports, and API scope tests pass in both list and direct-object access;
9. worker outage/recovery and next-day scheduled behaviour are observable and duplicate-safe;
10. reports, exports, notifications, fund, benefit, provider statement, voucher, and GL tie to the source records;
11. test API keys and offline codes are revoked and all disposable artifacts are inventoried through the UI;
12. the final GO/NO-GO record names the build/deployment, test window, residual gaps, waivers, and evidence locations.

## 30. Execution Run Log Template

| Field | Value |
|---|---|
| Test ID | |
| Date/time/timezone | |
| Build/deployment ID | |
| Actor/role/scope | |
| Browser/device/network | |
| Preconditions and baselines | |
| Exact clicks/request | |
| Redacted inputs and client reference | |
| Expected result | |
| Observed immediate result | |
| Retry/uncertainty sequence | |
| Claim/PA/case/exception/batch/voucher/journal IDs | |
| Downstream UI checks | |
| Computation/tie-out | |
| Audit/notification evidence | |
| Result: PASS/FAIL/BLOCKED/N/A | |
| Defect ID/severity | |
| Cleanup/revocation status | |

## 31. Defect Register Template

| ID | Severity | Family/Test | Source rail | Persona/scope | Title | Preconditions | Exact reproduction | Observed | Expected | Financial/privacy impact | Input and downstream IDs | Evidence | Workaround | Status | Fix build | Re-test result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BB2-DEF-001 | | | | | | | | | | | | | | OPEN | | |

## 32. Final Tester Mindset

Do not ask only whether the button works. Ask:

- What if the first request committed but the user never saw the response?
- What if the source system sends it twice, late, out of order, under the wrong facility, or with one field changed?
- What if eligibility, contract, PA, benefit, fund, or membership changed while the event was offline?
- What if another user is looking at an older version of the same record?
- What if the queue worker or connector is absent but the screen still looks healthy?
- What proves that every submitted event became exactly one operational outcome and at most one payment?
- Can the person who sees the exception actually resolve it without a database intervention?
- Does every portal, export, API, notification, statement, and journal tell the same story?

The highest-value defect is usually not a broken screen. It is a screen that reports success while the wrong record, wrong person, wrong provider, wrong amount, duplicate amount, or no recoverable record exists downstream.
