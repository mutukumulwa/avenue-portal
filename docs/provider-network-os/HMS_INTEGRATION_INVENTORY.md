# F9.1 — HMS Integration Control-Plane Inventory (characterized 2026-07-28)

**Branch/commit:** `feat/provider-network-os` @ `b39494e`
**Package:** F9.1 (phase F9 — HMS integration control plane). Size S. Depends F0.3 (+ security/integration owners).
**Outcome sought (spec):** the call/data flow covers *push, stubbed pull, HMS batch apply, connection records, secrets, logs, retries, and domain writes.*
**Scope:** every inbound/outbound integration and store-and-forward data-exchange surface, its authentication + provider/branch scope, its secret storage + log exposure, its payload→domain write path (canonical vs direct), and its existing idempotency/receipt/reconciliation/retry behavior.
**Method:** read-only static trace of routes, services, jobs, queue config, and schema. **No connector, route, schema, or config changed** (package stop condition: *no connector changes*).

> This is a characterization artifact (like the F0.x maps). It records *what exists today* and *where the gaps are relative to spec §7.11 / §8.12*. It does **not** implement anything. Each gap is tagged with the downstream F9 package that closes it; nothing here is "fixed now."

---

## 1. Surface inventory — every integration / data-exchange channel (step 1)

All inbound partner traffic enters through the B2B API prefix `src/app/api/v1/*`, guarded by `withApiKey` (`src/lib/apiAuth.ts:122`). Two credential channels exist: an **operator key** (env `API_KEY`, optionally tenant-bound by `OPERATOR_TENANT_ID`) and a **per-facility `ProviderApiKey`** (`apiAuth.ts:5-9,48-62`).

| # | Channel | Route / entrypoint | Dir. | Auth | Domain write | Idempotency / receipt |
|---|---|---|---|---|---|---|
| **I1** | **HMS daily service batch** | `POST /api/v1/hms-batch` → `HmsBatchService.apply` | push (in) | `withApiKey` (provider or operator) | **canonical** `CaseService.addServiceEntry` (`hms-batch.service.ts:185`) | per-line hash on `CaseServiceEntry.hmsBatchRef`; **no delivery record**; unmatched/poison → `ExceptionLog` |
| **I2** | **HMS poll (pull)** | `HmsBatchService.pollConfiguredEndpoints` (`hms-batch.service.ts:226`) | pull (in) | n/a (server job) | **none — STUB** | n/a — TODO, transport not implemented |
| **I3** | **Offline store-and-forward sync** | `POST /api/v1/sync` → `SyncService.ingest` → reconcile | push (in, async) | `withApiKey` | **canonical** `ClaimIntakeService.submit` (`sync.service.ts:256`) | durable buffer `SyncOperation`, idempotent by `opKey`; reconcile job (attempts 5) |
| **I4** | **B2B claim submit** | `POST /api/v1/claims` → `ClaimIntakeService` | push (in) | `withApiKey` | **canonical** claim intake | `Idempotency-Key` header **required** (422 without, `claims/route.ts:185`); `ClaimIntakeReceipt` |
| **I5** | **B2B claim receipt status** | `GET /api/v1/claims/receipts/{receiptId}` | pull (out) | `withApiKey` | none (read) | reads `ClaimIntakeReceipt`; non-enumerating + rate-limited |
| **I6** | **B2B pre-auth submit** | `POST /api/v1/preauth` → `PreauthIntakeService.submit` | push (in) | `withApiKey` | **canonical** PA intake | `Idempotency-Key` optional; `PreauthIntakeReceipt`; conflict → 409 |
| **I7** | **B2B eligibility check** | `GET /api/v1/eligibility` | pull (out) | `withApiKey` | none (read) | entitlement-scoped member read |
| **I8** | **B2B benefit query** | `GET /api/v1/benefits` | pull (out) | `withApiKey` | none (read) | entitlement-scoped benefit read |
| **I9** | **B2B document upload** | `POST /api/v1/upload` | push (in) | `withApiKey` | **none** — returns raw public URL, no record (see F0.4 §U2) | none |
| **I10** | **Integration configuration** | `(admin)/settings/integrations` + `settings` tRPC | config | session `ADMIN_ONLY` (page) / `protectedProcedure` (tRPC) | `IntegrationConfig` upsert | n/a |
| **I11** | **Bulk claims import** (adjacent) | `POST /api/claims/import` → `ClaimIntakeService` | file (in) | **session** (SUPER_ADMIN/CLAIMS_OFFICER/MEDICAL_OFFICER), **not** an API key | **canonical** claim intake | durable key `csv:<fileSha256₁₆>:<sheet>:<row>:<providerId>`; per-row receipt + conservation |
| — | **M-Pesa payment callback** (out of HMS scope) | `POST /api/member/payments/mpesa/callback` | webhook (in) | **HMAC signature** (`MPESA_CALLBACK_SECRET`) | `MemberPaymentService.applyMpesaCallback` | signature verify, fails closed in prod |

**Push vs pull vs batch (the outcome's required coverage):**
- **Push (inbound writes):** I1 hms-batch, I3 sync, I4 claims, I6 preauth, I9 upload — all API-key-authenticated over `/api/v1/*`.
- **Stubbed pull:** I2 only. `pollConfiguredEndpoints` reads enabled `IntegrationConfig(provider="HMS")` rows and returns `{ polled, note: "connector transport not yet implemented — push API is live" }` (`hms-batch.service.ts:230-235`). It is invoked once daily from `runOfflinePackJob` (`offline-pack.job.ts:26`), scheduled `offline-pack-refresh-daily` at `SIX_AM_CRON` (`queue.ts:120`). **No HTTP fetch, no cursor, no circuit — a placeholder only.**
- **HMS batch apply:** I1 is the live HMS channel; §2/§5/§6 below trace it end to end.
- **No live vendor transport exists** for the `IntegrationConfig.provider` enum values (`SMART, SLADE360, HMS, SHA, ERP`, schema:5208). A repo-wide search found **no outbound HTTP client** to any of these; the enum + `Provider.smartProviderId` (schema:2921) / `Provider.slade360ProviderId` (schema:2922) are used only to **route inbound payloads to a facility**, never to call out.
- **Only one signed webhook receiver exists in the whole codebase** — the M-Pesa callback (`member-payment.service.ts:246-252`). It is a *payment* callback, not HMS, but it is the **sole existing precedent** for the signature+replay verification that F9.4 requires for HMS callbacks.

---

## 2. Connection records & configuration (step 1 cont.)

### `IntegrationConfig` (`prisma/schema.prisma:5205`) — the only existing "connection record"

| Field | Value / note |
|---|---|
| `tenantId` + `provider` (`@@unique`) | Scope is **tenant + vendor string** (`SMART/SLADE360/HMS/SHA/ERP`). **One row per tenant per vendor.** |
| `provider` | The integration *vendor*, **not** a Medvex `Provider` facility. There is **no `providerId`/`providerBranchId`.** |
| `apiKey` / `apiSecret` | Commented `// Encrypted` — **but stored verbatim** (see §4). |
| `apiBaseUrl`, `config` (Json), `isEnabled`, `lastSyncAt` | Free config; `config` is an untyped JSON blob. |
| `status` | Free string `CONNECTED/DISCONNECTED/ERROR`, set naively to `CONNECTED` whenever `isEnabled` (`settings/actions.ts:234`) — **no real connection test.** |

**Consumers (complete):**
- read+write UI: `(admin)/settings/integrations/page.tsx:10` (read) + `upsertIntegrationAction` (`settings/actions.ts:208`, `ADMIN_ONLY`);
- read+write tRPC: `settings.getIntegrations` / `settings.upsertIntegration` (`trpc/routers/settings.ts:102-125`, `protectedProcedure`);
- read by the pull stub: `hms-batch.service.ts:227`.

### §7.11 target models — **absent** (confirmed)

`ProviderIntegrationConnection`, `ProviderIntegrationDelivery`, `ProviderIntegrationAttempt` (spec §7.11) **do not exist**. There is no delivery-grain record, no attempt/retry ledger, no circuit-state, no cursor, no per-connection scope. These are entirely **additive in F9.2** — nothing to preserve except `IntegrationConfig` (which F9.2 step 5 explicitly preserves during migration).

---

## 3. Provider/branch mapping and missing scope (step 2)

| Channel | Tenant resolution | Facility (Provider) resolution | Branch resolution |
|---|---|---|---|
| I1 hms-batch | key's `tenantId`, else `tenant.findFirst()` scaffold (`hms-batch/route.ts:29-30`) | **key-bound** (`providerFromKey`, FG-C3) or payload `facilityCode` → `id`/`name`/`smartProviderId`; a facility key **cannot retarget** another facility (`hms-batch.service.ts:93-102`) | **NONE** — case matched by `providerId` only (`service.ts:144,150`) |
| I3 sync | **`tenant.findFirst()` scaffold** (`sync/route.ts:35`, `TODO(G8)`), **not** key-derived | via `offlineAuthCode` (offline work authorization), **not** the API key | via the offline work auth's branch (indirect) |
| I2 poll | per `IntegrationConfig` (tenant only) | **cannot** — config has no facility mapping | none |
| I10 config | `session.user.tenantId` | n/a (vendor-level) | n/a |

**Missing-scope findings:**
- **F9-SCOPE-1 (branch).** No inbound channel resolves a `ProviderBranch`. `ProviderBranch` (schema:3190) carries a human `code` (3197) but **no external integration id** to map an HMS payload to a branch. `ClinicalCase` *has* a branch relation, yet hms-batch matches on `providerId` only. Provider keys already carry `allowedBranchIds` (`apiAuth.ts:9`), but **hms-batch and sync never consult it.** → F9.2 (branch on connection/delivery) + F9.3/F9.5 (enforce).
- **F9-SCOPE-2 (sync tenant).** I3 resolves the tenant with `tenant.findFirst()` — a single-operator scaffold (`sync/route.ts:33-35`). In a multi-tenant deployment a sync post is **not** pinned to the caller's tenant by the key. → F9.3/F9.4 (authenticate connection → tenant).
- **F9-SCOPE-3 (config not facility-scoped).** `IntegrationConfig` is tenant+vendor, so the poll stub (I2) could never target a specific facility's endpoint even once implemented. → F9.2 (connection carries provider/optional branch).
- Operator key breadth is already bounded (BD-06: no in-source default; `OPERATOR_TENANT_ID` binding, `apiAuth.ts:25,54`). Provider-key least-privilege (scopes/expiry/branch/rotation) exists from F1.6 (`ProviderApiKey`, schema:2956) but is enforced per-route only where wired (F1.7).

---

## 4. Secret storage and log exposure (step 3)

### Secret storage

| Secret | Storage | Verdict |
|---|---|---|
| `IntegrationConfig.apiKey` / `apiSecret` | **Plaintext** DB columns. Written verbatim by `upsertIntegrationAction` (`settings/actions.ts:231-232`) and `settings.upsertIntegration` (`settings.ts:122-123`). The `// Encrypted` comment is aspirational. | ⚠️ **Not encrypted; no secret-reference indirection** (spec §7.11 wants a *secret reference + credential version*). → F9.2/F9.3. |
| `ProviderApiKey.keyHash` | **bcrypt hash** of the full key; `keyPrefix` (first 12 chars) for lookup (schema:2963-2964); constant-time compare (`apiAuth.ts:31-36`); `expiresAt`/`revokedAt`/rotation family. | ✅ Hashed at rest, reveal-once, rotatable. The model to emulate. |
| Operator key | env `API_KEY`; **no in-source default** (BD-06, `apiAuth.ts:25`); constant-time compare. | ✅ |
| `MPESA_CALLBACK_SECRET` | env; HMAC-SHA256; production fails closed if unset (`member-payment.service.ts:251`). | ✅ (out of HMS scope; reference pattern). |

### Log / UI / API exposure

- **F9-SECRET-1 (config secrets echoed to the browser).** `settings/integrations/page.tsx:56-57` renders the stored `apiKey`/`apiSecret` straight back into form `defaultValue=...` — the cleartext secret is shipped to the admin's HTML on every page load (the `apiSecret` field is `type="password"`, i.e. visually masked but present in the DOM/page source). → violates spec §7.11 / F9.3 ("*without seeing stored secrets*").
- **F9-SECRET-2 (config secrets returned by tRPC, weak gate).** `settings.getIntegrations` / `upsertIntegration` are `protectedProcedure` (**authenticated-only, not `ADMIN_ONLY`** like the page) and return full rows including `apiKey`/`apiSecret` (`settings.ts:102-125`). → F9.3 (secret never returned; role/scope gate).
- **Application logs are clean of raw bodies/secrets/headers.** hms-batch logs only the error object on failure (`hms-batch/route.ts:42`); the poll logs only its note (`offline-pack.job.ts:27`). No route logs the request body, `Authorization`, or a decrypted secret.
- **Payload content persisted in domain rows (by design, not a log leak, but worth flagging):**
  - `ExceptionLog.notes` for unmatched/rejected hms-batch lines embeds the service **description + amount + member/case ref** (`hms-batch.service.ts:170-172,208-210`) — clinical-ish free text in a reviewable exception register.
  - `SyncOperation.payload` (schema:1755) stores the **raw operation payload** verbatim — this is the durable buffer's reason for being, but F9.4's "*never store raw clinical body in log metadata; approved encrypted retention only if policy requires*" should be weighed when designing the delivery record.

---

## 5. Payload → canonical vs direct writes (step 4)

Every inbound channel that mutates domain state routes through a **canonical service** — **no adapter writes a domain table directly** (spec §8.12: "*Adapters never write domain tables directly*"). Verified:

| Channel | Canonical service invoked | Evidence | Direct table write? |
|---|---|---|---|
| I1 hms-batch | `CaseService.addServiceEntry` | `hms-batch.service.ts:185` | No (only `ExceptionLog.create` for unmatched/poison — the exception register, not a domain apply) |
| I3 sync | `ClaimIntakeService.submit` (in `reconcile`) | `sync.service.ts:256` | No (writes only its own `SyncOperation` buffer state) |
| I4 claims | `ClaimIntakeService` | `claims/route.ts` header | No |
| I6 preauth | `PreauthIntakeService.submit` + `executeAutoDecision` handoff | `preauth/route.ts:89,23` | No |
| I11 import | `ClaimIntakeService.submit` | `claims/import/route.ts:5` | No |

So F9.5 ("route inbound HMS records through canonical domain services") is **already the established pattern** — the new work is the *versioned mapping layer + per-record delivery receipt* around these calls, not re-plumbing the writes. The one gap: I1's canonical call happens **inline in the request** with no durable delivery envelope around it (see §6).

---

## 6. Idempotency, receipt, reconciliation, retry (step 5)

**Maturity ladder (most → least durable):**

1. **I11 bulk import** — durable content-addressed key (`csv:<fileSha256>:<sheet>:<row>:<providerId>`), per-row terminal disposition + receipt, and an explicit **conservation block** (`file total = imported + replayed + linked + skipped`); a matching invoice **links** rather than duplicates (`claims/import/route.ts:11-20`). Bounded 10 MB / 2000 rows. *The exemplar for F9.5/F9.6.*
2. **I4 claims** — `Idempotency-Key` **required**, `ClaimIntakeReceipt` persisted, replay returns the original (200) with a status URL (I5), duplicate detection (`claims/route.ts:162-188`).
3. **I6 preauth** — `PreauthIntakeReceipt` persisted; same-key/different-body → **409 conflict** (`preauth/route.ts:115`); replay flagged.
4. **I3 sync** — durable `SyncOperation` buffer, **idempotent by `opKey`**; reconcile enqueued with **attempts 5, exponential backoff 5 s** (`queue.ts:240`); PENDING ops retried on the next pass; canonical apply never double-applies (`sync.service.ts:12,273`).
5. **I1 hms-batch** — per-line hash idempotency on `CaseServiceEntry.hmsBatchRef` (`hms-batch.service.ts:127-137`); unmatched → `ExceptionLog(HMS_BATCH_UNMATCHED)`, poison line → `ExceptionLog(HMS_BATCH_REJECTED)` individually quarantined without aborting the batch (`service.ts:160-214`). Returns a `{ total, applied, duplicates, unmatched, rejected }` report.

**Idempotency/receipt/reconciliation gaps on the live HMS channel (I1):**
- **F9-IDEM-1 (no delivery receipt).** The per-post report is **returned but never persisted** (`service.ts:217`). There is **no delivery-grain record** — a client that loses the HTTP response cannot query "did batch `AGA-2026-07-03` land?", and there is no status URL. Idempotency is *per line*, not *per delivery*; there is no batch-level RECEIVED→ACCEPTED→COMPLETED state machine. → F9.4.
- **F9-IDEM-2 (check-then-act race).** `CaseServiceEntry.hmsBatchRef` is `@@index` **not `@@unique`** (schema:2794). Apply does `findFirst({hmsBatchRef})` → `create` (`service.ts:130-196`) with no transaction/unique guard, so two concurrent posts of the same line can both miss and both create → a **double-applied service entry** (a downstream double-billing exposure). Serial daily cadence makes this low-probability today, but it is exactly the invariant F9.4's durable-delivery-with-conflict closes. → F9.4 (+ a unique constraint).
- **F9-IDEM-3 (no source↔target reconciliation).** Nothing reconciles the facility's asserted counts/amounts against Medvex-applied totals across posts (spec §8.12 step 10). The single-post report is the only control total, and it is ephemeral. → F9.4/F9.6/F9.7.
- **F9-RETRY-1 (no HMS retry path).** I1 is fully synchronous — a transient failure surfaces as an HTTP 500 to the caller; there is no queue, lease, backoff, or sweeper for hms-batch (contrast I3 sync, which has all of these via BullMQ). The daily poll (I2) that *could* re-pull is a stub. → F9.6.

**Ingress hardening gaps (inbound envelope, spec §8.12 steps 1-3 / §7.11):**
- **F9-INGRESS-1.** `withApiKey` provides bearer-key auth only — **no HMAC signature and no replay-window/nonce** for the push channels (I1/I3). A captured `(body + key)` replays; the only guard is content-hash idempotency. → F9.4.
- **F9-INGRESS-2.** No explicit **body-size cap** or content-type enforcement at the wrapper or the hms-batch/sync handlers (`req.json()` directly). Entry count is unbounded on I1 (sync validates presence but not a max length). → F9.4.

---

## 7. Coverage check against the F9.1 outcome

| Required coverage | Where characterized | State today |
|---|---|---|
| push | §1 (I1/I3/I4/I6/I9), §5 | live, canonical, key-authed |
| stubbed pull | §1 (I2), `hms-batch.service.ts:226` | placeholder only — no transport/cursor/circuit |
| HMS batch apply | §1 (I1), §5, §6 | live; canonical write; per-line idempotency; **no delivery receipt** |
| connection records | §2 | only `IntegrationConfig` (tenant+vendor, plaintext); §7.11 models absent |
| secrets | §4 | config secrets **plaintext + echoed**; provider keys **bcrypt** |
| logs | §4 | app logs clean; payload content lives in `ExceptionLog.notes` / `SyncOperation.payload` |
| retries | §6 | mature on sync (attempts 5); **none on hms-batch**; poll no-ops |
| domain writes | §5 | **100% canonical** — no direct table writes on any inbound path |

---

## 8. Findings register (for downstream F9 packages — not actioned here)

| ID | Finding | Evidence | Closes in |
|---|---|---|---|
| F9-SECRET-1 | Config secrets echoed to admin browser in cleartext | `settings/integrations/page.tsx:56-57` | F9.3 |
| F9-SECRET-2 | Config secrets returned by weakly-gated tRPC (`protectedProcedure`) | `settings.ts:102-125` | F9.3 |
| F9-SECRET-3 | `IntegrationConfig` secrets stored plaintext (no encryption / secret-ref) | `settings/actions.ts:231-232`; schema:5211-5212 | F9.2/F9.3 |
| F9-SCOPE-1 | No branch resolution on any inbound channel; `allowedBranchIds` unused by hms-batch/sync | `hms-batch.service.ts:144`; schema:3190 | F9.2/F9.5 |
| F9-SCOPE-2 | Sync tenant via `findFirst()` scaffold, not key-derived | `sync/route.ts:33-35` | F9.3/F9.4 |
| F9-SCOPE-3 | `IntegrationConfig` not facility-scoped | schema:5205-5220 | F9.2 |
| F9-IDEM-1 | HMS batch has no persisted delivery receipt / status URL | `hms-batch.service.ts:217` | F9.4 |
| F9-IDEM-2 | `hmsBatchRef` non-unique → check-then-act double-apply race | schema:2794; `service.ts:130-196` | F9.4 |
| F9-IDEM-3 | No source↔target count/amount reconciliation for HMS | §8.12 step 10 unmet | F9.4/F9.6 |
| F9-RETRY-1 | No retry/lease/sweeper on hms-batch (synchronous) | `hms-batch/route.ts` | F9.6 |
| F9-INGRESS-1 | No signature/replay-window on push channels | `apiAuth.ts:122-129` | F9.4 |
| F9-INGRESS-2 | No body-size cap / entry-count bound on hms-batch | `hms-batch/route.ts:17`; `service.ts:57-75` | F9.4 |
| F9-PULL-1 | HMS pull is a stub (no transport/cursor/circuit) | `hms-batch.service.ts:226-236` | F9.7 |

**None of the above is changed by this package.** They are the substrate F9.2–F9.9 build on: additive connection/delivery/attempt schema (F9.2), credential administration without secret exposure (F9.3), durable inbound receipt with signature/replay/size guards (F9.4), versioned canonical mapping with per-record receipts (F9.5), retry/quarantine/sweeper (F9.6), one real contracted pull adapter (F9.7), ops views (F9.8), and the flagged legacy cutover (F9.9).

---

*Read-only inventory. No connector, route, schema, seed, or config was modified (F9.1 stop condition: no connector changes).*
