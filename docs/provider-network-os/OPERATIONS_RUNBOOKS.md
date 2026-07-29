# F11.7 — Operations & incident runbooks (HMS integration + capitation)

Named owners diagnose and recover **without database improvisation**. Every action is a service call or an approved, reversible, audited state change — **never a manual `UPDATE`/`DELETE`** on financial/clinical/audit rows (§0.4). Queries below are READ-ONLY diagnostics.

> Covers the F9 (integration control plane) + F10 (capitation) surfaces. F1–F8 incidents (lockout, entitlement false-deny, quarantined document, stuck PA/SLA, remittance mismatch, notification backlog) follow the existing per-phase ops docs referenced in `PROGRESS.md`.

---

## RB-1 — HMS delivery stuck (RETRYING / not processed)

**Symptoms:** a facility reports services not appearing on cases; `ProviderIntegrationDelivery.status = RETRYING`/`ACCEPTED` with `nextAttemptAt` in the past.
**Diagnose (read-only):**
```sql
select id, status, attemptCount, maxAttempts, nextAttemptAt, quarantineReason
from "ProviderIntegrationDelivery"
where "connectionId" = $conn and status in ('ACCEPTED','RETRYING') and "nextAttemptAt" <= now();
```
Check the attempt ledger for the failure class: `select attemptNumber, resultClass, safeErrorCode, retryable from "ProviderIntegrationAttempt" where "deliveryId"=$id order by attemptNumber`.
**Actions:** the sweeper (`DeliveryRetryService.sweep`) drains retry-due deliveries; if a transient upstream cleared, an authorized operator re-drives with the **re-supplied body** via `DeliveryRetryService.manualRetry(ctx, deliveryId, rawBody)` (idempotent — already-applied records replay). **We never retain the raw body**, so the sender re-POSTs (PUSH) or the puller re-fetches (F9.7). Do NOT edit `CaseServiceEntry` by hand.
**Escalation:** if `attemptCount ≥ maxAttempts` → it auto-quarantines (RB-2). If the sweeper is not running, page the worker owner.
**Reconciliation:** the delivery aggregate (`appliedCount/rejectedCount/quarantinedCount/replayedCount`) must equal the record-result rows; a manual retry must not increase `CaseServiceEntry` counts for already-applied lines.
**Closure:** delivery `status=COMPLETED`/`PARTIAL`; ops-view retry-due count returns to 0; audit shows `INTEGRATION_DELIVERY:MANUAL_RETRY` if used.

## RB-2 — Poison / quarantined delivery record

**Symptoms:** `status=QUARANTINED` with a `quarantineReason`; a specific record won't apply.
**Diagnose:** `select recordIndex, outcome, safeReason from "ProviderIntegrationRecordResult" where "deliveryId"=$id and outcome in ('QUARANTINED','REJECTED','UNMATCHED')`. A poison record is a deterministic data problem (e.g. future-dated entry, no open case) — retrying alone won't fix it.
**Actions:** remediate the SOURCE (fix the record at the HMS, open/adjust the case), then `manualRetry` with the corrected body. The good rows in the same batch already applied (per-record isolation) — do not reprocess them.
**Closure:** the corrected record reaches `APPLIED`; the delivery moves off QUARANTINED.

## RB-3 — Integration circuit open (pull) / repeated transport failure

**Symptoms:** `ProviderIntegrationConnection.circuitState=OPEN`, `consecutiveFailures ≥ threshold`, `lastFailureAt` recent; no new pulled deliveries.
**Diagnose:** confirm the endpoint is reachable + HTTPS + resolves to a **public** address (a DNS-rebind to a private IP is blocked by design — `http-safe.ts`). Check `apiBaseUrl` + `endpointAllowlistRef`.
**Actions:** after the upstream recovers, the next poll after the cool-down half-opens the circuit; a successful poll closes it and resets `consecutiveFailures`. If the endpoint changed, an integration admin updates the connection via `ProviderIntegrationConnectionAdmin.updateConfig` (SSRF-validated). Never disable SSRF checks.
**Escalation:** if the endpoint legitimately needs a private/allowlisted host, that is an F9.7 activation decision (contract + allowlist policy), not an ops override.

## RB-4 — Connection credential rotation / suspected secret exposure

**Symptoms:** a partner reports a leaked/expired credential.
**Actions:** `ProviderIntegrationConnectionAdmin.rotateSecret(ctx, connectionId)` mints a new secret (revealed once) and **retires the prior** — the old secret stops authenticating immediately. Share the new secret out-of-band. The secret material is bcrypt-hashed and never readable from any view (F11.4). To stop all traffic: `pause` (reversible) or `disable` (terminal). Every transition is audited (`INTEGRATION_CONNECTION:*`).
**Closure:** the partner authenticates with the new secret; `credentialVersion` incremented; audit trail complete.

## RB-5 — Capitation ledger mismatch / conservation breach

**Symptoms:** a provider disputes a pool statement; a period's `closingBalance` ≠ opening + accrual + adjustments − payments.
**Diagnose (read-only):**
```sql
select period, status, "eligibleLifeCount", rate, "grossAccrual", "adjustmentTotal",
       "openingBalance", "amountPayable", "amountPaid", "closingBalance"
from "CapitationPeriod" where id=$id;
```
Recompute `opening + gross + adj − paid` and compare to `closing` (must match to 4dp — F11.3 enforces this in tests). Inspect adjustments: `select category, amount, reason, "actorId", "approvedById" from "CapitationAdjustment" where "periodId"=$id`.
**Actions:** a FROZEN period is **immutable** — a correction is an **append-only adjustment** (`recordAdjustment`) in the open ledger or a **governed reopen** (maker/checker + reason + audit), never a silent rewrite (PNO-CAP-003). Re-run `calculateAccrual` only while the period is CALCULATED (pre-freeze).
**Escalation:** finance owner signs off any reopen; legal reviews a contested rate/eligibility change.
**Closure:** the recomputed conservation equation holds; the adjustment is audited with actor + approver.

## RB-6 — Failed / reversed capitation payment

**Symptoms:** a disbursement bounced; the period shows PAID but the bank rejected.
**Actions:** `CapitationStatementService.reversePayment(ctx, periodId, {amount, reason})` restores `amountPaid` and the balance and returns the period to FROZEN — the balance is **not** reduced until a real reversal is recorded (PNO-CAP-006/007). Re-approve is not needed (already approved); re-run `recordPayment` once the disbursement succeeds.
**Closure:** conservation holds post-reversal (F11.3); the re-payment reaches PAID; period may then CLOSE.

## RB-7 — Zero-pay capitated line appearing in FFS settlement

**Symptoms:** a settlement run flags a capitated (INCLUDED) line for FFS payment.
**Diagnose:** `select funding, "arrangementId", "periodId" from "CapitationEncounterLink" where "entityType"=$t and "entityId"=$id`. An INCLUDED line is pool-paid and must be zero FFS.
**Actions:** `CapitationEncounterLinkService.assertFfsSettlementAllowed` hard-denies it (once wired into the live settlement path at activation). A genuine carve-out must be linked explicitly as CARVE_OUT (never both — the `@@unique` prevents double-count). Preserve the encounter for utilization; never delete it.

## RB-8 — Privacy / security incident (marker leak, credential compromise)

**Actions:** run the F11.4 marker scan against the affected read models; rotate the exposed credential (RB-4) or revoke the provider API key (`ProviderApiKeyService.revoke`); `pause`/`disable` the connection. Preserve audit evidence (never hard-delete). Follow the org incident-response process for notification.

---

**Cross-cutting rule:** no undocumented manual DB edit. Any state change goes through the named service (audited, reversible where possible). If a scenario is not covered here, escalate rather than improvise.
