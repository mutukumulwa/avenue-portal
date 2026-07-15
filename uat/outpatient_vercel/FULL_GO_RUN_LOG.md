# FULL GO — Workstream C (Residual UAT) — Run Log

> **RESUME POINTER (2026-07-14):** Executing Workstream C from `FULL_GO_EXECUTION_PLAN.md`
> against prod https://avenue-portal.vercel.app (DB = Supabase project `otivyuroqraiijayvkze` "AiCare",
> tenant `cmr3ae8v30000nlvqxrqlfn38` medvex). Workstream A code fixes are committed on branch
> `fix/full-go-workstream-a` but **NOT deployed** — so C targets the current prod build (residual
> families are independent of the A fixes).
> **DONE this session:** **C1 COMPLETE** (Family K — all 5 personas PASS; N3 quantified). **C2 offline
> ASSESSED** (code+DB): new finding **FG-C1 (Medium)** — offline data pack roster is tenant-wide (2,997
> members incl. isolated NWSC), not provider-scoped; latent HIGH gated by OPS-only RBAC + no external
> pack-pull API. Exactly-once assimilation VERIFIED by code (opKey + clientUuid idempotency; WP-A2 unique
> index DB-enforces it once deployed). Offline rail NEVER exercised on prod (0 sync ops / 0 packs / 0 codes).
> **FG-C1 FIXED (WP-A8, committed dc268e3, live-verified local).**
> **C3 HMS ASSESSED** (code+DB): **FG-C3 (High, latent)** — HMS batch not bound to API key's facility →
> cross-facility case write (payload facilityCode picks provider; key never checked); cross-rail parity gap
> vs claims rail; live on HMS launch. **FG-C4 (Medium)** — no per-line quarantine (poison line 400s whole
> batch) + quantity-validation gap. Conservation/idempotency/attribution-matching PASS. HMS rail dormant on
> prod (1 case/0 open, 0 HMS entries, 0 configs, 0 keys). **FG-C3+FG-C4 FIXED (WP-A9, 9da68a0).**
> **C4 membership ASSESSED** (code+DB): **FG-C5 (Medium)** — claim eligibility is current-status, not
> point-in-time as-of-service-date (no enrollmentDate≤serviceDate gate; 171 prod claims predate enrollment;
> terminated status over-blocks historical claims — J9 spine). **FG-C6 (Medium)** — endorsement approval is a
> check-then-act with no tx/lock → concurrent double-apply (double GL/invoice, maybe dup member). PASS:
> self-approval SoD (PR-033), no-silent-apply on GL failure (PR-018), endorsement honours effectiveDate.
> **NEXT:** C5 settlement concurrency, C6 races, C7 worker, C8 portfolio ops, C9 scale.
> Persona creds all = `FullGoUAT2026!` (see PROVISIONING ledger).
> **Env facts:** in-app Claude_Browser tab "seed" is the reliable surface; login = fill fields via
> `form_input` (ref_1 email, ref_2 password), then click Sign In by **ref** (coordinate/Enter did NOT
> submit); page renders zoomed at 800x450 — scroll to reveal the Sign In button. IP login throttle
> trips after ~10 rapid cycles (OBS-K1) — minimise login churn. Admin = admin@medvex.co.ug / MedvexAdmin2024!.

**Target:** https://avenue-portal.vercel.app (Vercel prod, current build — pre-Workstream-A).
**Method:** UI-driven as each persona + read-only DB queries (Supabase MCP) to verify scope/side-effects.
No DB mutation. No real PII exfiltration (scope proven by counts/response-codes, never by dumping a member).

---

## C1 — Family K remainder (privacy & scope)

### [K-N3] Shared-client sibling-group exposure — 🟠 CONFIRMED (Medium), fully quantified

**Persona:** SUPER_ADMIN (admin@medvex.co.ug) + read-only DB.
**Finding:** Six unrelated employers are modelled as sibling Groups under ONE payer Client
("Medvex — Default Client", type INSURER). Provider/API member entitlement scopes by **Client**
(`ProviderEntitlementService.entitledMemberWhere`), and there are **zero** group-level applicability
rows, so any provider entitled to the Default Client can resolve the eligibility/benefits PII of
**every** member across all six employers.

**Evidence (DB, prod `otivyuroqraiijayvkze`, 2026-07-14):**

| Metric | Value |
|---|---|
| Employers (Groups) under "Medvex — Default Client" | **6** — Safaricom PLC (78), KCB Group (53), East African Breweries (46), Bamburi Cement (38), Twiga Foods (33), Patricia Wanjiru (1) |
| Members exposed across those 6 employers | **249** |
| Distinct providers with an active **client-level** (groupId NULL) INCLUDE on an ACTIVE contract to the Default Client | **190** |
| Group-level (groupId set) applicability rows on the Default Client | **0** (no scoping exists) |
| NWSC isolation (own Client, EMPLOYER_SELF_FUNDED) | **2,750** members correctly isolated |

Blast radius: **190 providers × 249 members across 6 competitors' rosters.** Any one of those
providers, via the B2B eligibility/benefits API (proven client-scoped in prior BB2 pass GATE-03),
can read a Safaricom employee's PII while treating a Bamburi employee — they share one Client.

**Evidence (UI, /clients):** "Medvex — Default Client · Insurer · UGX · **6 schemes** · ACTIVE" vs
"National Water & Sewerage Corporation · Self-funded employer · **1 scheme** · ACTIVE".
Screenshot: `evidence/` (clients-list-n3.png — to attach).

**Severity: Medium.** Privacy exposure (cross-employer PII readability), not financial leakage. The
Default Client is typed INSURER, so *some* pooling is by design for an insurer book — but these are six
distinct named corporate employers, which in the real business are separate accounts. Whether they are
one insurer pool or separate clients is a **business decision** (WP-A6 gate).

**Fix status:** Tooling built in Workstream A (WP-A6) — the entitlement code already supports
group-level scoping (`groupId` on a `ContractApplicability` row). The `n3_provider_group_matrix.csv`
sign-off artifact was generated from live prod data this session
(`evidence/n3_provider_group_matrix.csv`, 1,140 provider×group rows). Applying group-level
applicability (WP-A6 apply script) after business sign-off closes the exposure; the strategic fix
(own-Client-per-employer) is a separate scoped project.

### [PROVISIONING] Persona logins — batch reset 2026-07-14

All personas **already existed** (no accounts created). Batch-reset their passwords to a single known
UAT value via one DB UPDATE (bcryptjs hash, authorised "batch-provision"; TOTP off on all; isActive
true). **Test-artifact ledger — restore/disable after the campaign:**

| Persona | Email | Role | Scope binding | Password (UAT) |
|---|---|---|---|---|
| HR (Safaricom) | emily.wambui@safaricom.co.ke | HR_MANAGER | Group: Safaricom PLC | `FullGoUAT2026!` |
| HR (NWSC) | hr.nwsc.uat@test.local | HR_MANAGER | Group: NWSC | `FullGoUAT2026!` |
| Fund (NWSC) | fund.nwsc.uat@test.local | FUND_ADMINISTRATOR | (fund assignment) | `FullGoUAT2026!` |
| Reports | reports.uat@test.local | REPORTS_VIEWER | tenant read-only | `FullGoUAT2026!` |
| Broker | broker@kaib.co.ke | BROKER_USER | own book | `FullGoUAT2026!` |
| Member | noah.bb2@test.local | MEMBER_USER | own coverage | `FullGoUAT2026!` |

Mutation footprint: 6 `User.passwordHash` rows on prod (test personas only; no real human accounts, no
role/scope change). Reversible by re-inviting or nulling the hash.

### [K-remainder] HR / Fund / Reports adversarial re-test, health-vault, cross-broker IDOR — 🔄 IN PROGRESS

#### K-HR — HR_MANAGER scope (emily.wambui@safaricom.co.ke, Safaricom PLC) — ✅ PASS
- **Own-scope:** HR dashboard + roster scoped to Safaricom PLC only — 78 members (matches DB exactly: Child 20 + Spouse 27 + Principal 31), all roster rows `AVH-DEMO-SAF-*`. Nav trimmed to HR functions (no admin/claims/settings).
- **Cross-group IDOR (same Default Client sibling):** as Safaricom HR, `GET /hr/roster/<KCB member id cmr3afk72003dnlvqjxi5yj5e>` → **404**. Own member `/hr/roster/cmr3ag5fp005knlvqvia50mii` → 200 full detail — so the 404 is genuine **group-level** scoping, not a dead route. **HR does NOT inherit the N3 client-level leak** — its scope is `User.groupId`, enforced per group even within the shared client.
- **Forbidden admin route:** `/members` → branded **Access Denied**.
- **Clinical minimisation:** HR member detail shows membership-admin fields only (name, gender, DOB, package, tier, relationship, endorsements) — **no diagnoses/clinical notes**.
- Verdict: HR scope holds on this build (group-isolated; no cross-employer or clinical leak).

#### K-Broker — BROKER_USER scope (broker@kaib.co.ke) — ✅ PASS (closes prior "cross-broker IDOR" gap)
- **Own book only:** `/broker/groups` lists **only Safaricom PLC** (78) — the other 5 sibling groups under the Default Client and NWSC are absent.
- **Foreign-group IDOR:** `GET /broker/groups/<KCB group id cmr3afhwy0031nlvqq2q45mo1>` (a sibling group under the same Default Client) → **404**. Own group `/broker/groups/cmr3affij002wnlvqemo5ootp` → 200. Genuine per-broker book scoping; no cross-employer leak.
- **Forbidden staff route:** `/claims` → branded **Access Denied**.
- Verdict: broker book scope holds; the previously-unprobed cross-broker foreign-group-detail IDOR is now **cleared**.

#### K-Fund — FUND_ADMINISTRATOR scope (fund.nwsc.uat@test.local) — ✅ PASS
- **Own scheme only:** "Overseeing 1 self-funded scheme" — NWSC Staff Medical Scheme (2,750 members). Fund balance, deposits, claims paid, low-balance alert, and recent activity (NWSC claims CLM-2026-00297/00295/00292) all NWSC-only. The Default Client's 6 employers are absent (they're not self-funded).
- **Forbidden admin route:** `/members` → branded **Access Denied**.
- Verdict: fund scope holds (single assigned scheme; no cross-fund/client leak).

#### K-Member — MEMBER_USER scope + health-vault (noah.bb2@test.local) — ✅ PASS
- **Own portal only:** Documents page = 1 covered member (self), own member card, 0 hidden private docs. Benefits = own plan (NWSC Officer Care Silver).
- **Cross-member card IDOR:** `GET /members/<other member id nw022dadefeeebd9ead0ce>/card` → **Access Denied**. (Own id via the same route is also staff-gated → no by-id member-card path is exposed to members at all — structurally safe, no leak.)
- **Benefits param-tamper:** `/member/benefits?memberNumber=NWSC-2026-01455` (another member) → **ignored**, own NWSC Officer Care plan shown (session-scoped, not param-driven).
- Verdict: member scope holds; **health-vault cross-member document access not possible** (member document access is session-scoped, never by-id). Confirms + extends the prior-pass member-IDOR PASS on this build.

#### K-Reports — REPORTS_VIEWER scope (reports.uat@test.local) — ✅ PASS
- **Allowed surface:** nav trimmed to Dashboard + Insights only; `/reports` shows the 34 read-only CSV reports (tenant-level aggregates).
- **Forbidden config:** `/settings` → branded **Access Denied**. No mutation controls, no secrets, no private health-vault documents (reports are CSV aggregates).
- Verdict: read-only reporting scope holds.

### C1 — Family K remainder: ✅ COMPLETE — all 5 personas PASS
HR / Broker / Fund / Member / Reports scope all hold adversarially on the current prod build (group/scheme/book/self isolation; forbidden routes → branded denial or 404; no clinical/secret/health-vault leak). Cross-broker foreign-group IDOR and health-vault cross-member access — the two items flagged unprobed in the BB2 GO/NO-GO — are now **cleared**. The only open Family-K item is **N3** (architectural, Medium, fix tooling built + business-gated).
Requires provisioned portal logins (hr.nwsc.uat, fund.nwsc.uat, reports.uat have temp/unknown
passwords per the BB2 roster; broker@kaib.co.ke password unknown). Provisioning + probing 4–5 personas
through the fragile login flow risks tripping the OBS-K1 IP throttle. Deferred to a dedicated persona
pass (recommend using the more reliable claude-in-chrome surface with real sessions, or provisioning
all logins in one batch first). Prior GO/NO-GO carries HR/Fund/Reports as PASS from the closure pass —
this is a confirmatory re-test, not a suspected blocker.

---

## C2 — Family C: Offline Work & Reconnection

**Method:** the offline rail has **never been exercised on prod** (DB: 0 SyncOperations, 0 OFFLINE_SYNC
claims, 0 OfflineWorkAuthorizations, 0 active ProviderApiKeys), so there is no conservation data to
audit — the rail was assessed by code path + DB state (deterministic), not by materialising live packs
(a live pack would needlessly encrypt 2,997 members' PII onto prod — counterproductive for a finding
about over-exposure).

### [FG-C1] Offline data pack roster is tenant-wide, not provider/client-scoped — 🟠 Medium (latent High)
- **Code:** `OfflinePackService.buildPayload` (`src/server/services/offline-pack.service.ts:76`) selects
  members with `where: { tenantId, status: "ACTIVE" }` — the **whole tenant** — then filters only by
  `PackageProviderEligibility`, which **defaults to INCLUDE when a package has no rules** (line 97).
- **DB (prod):** `PackageProviderEligibility` is **empty (0 rows)**; 2,997 active members, **all 2,997**
  have no eligibility rule → every one passes the filter. So **any facility's pack = the entire tenant
  roster** (memberNumber + first/last name + status) **plus per-category benefit balances** (limit +
  remaining). This includes all **2,750 NWSC** members — a self-funded client that is correctly isolated
  on every other rail (API eligibility, HR, broker, provider portal). Strictly worse than N3 (which is
  client-scoped, 249 members); the pack has **no** client/group isolation at all.
- **Why currently Medium, not High:** pack retrieval is **OPS-only** — both `/offline-auth` and
  `/offline-capture` require `ROLES.OPS` = internal staff (SUPER_ADMIN/CLAIMS/MEDICAL/CS/UNDERWRITER),
  who can already read all members via `/members`; and there is **no external API** that returns the pack
  (`/api/v1/sync` only *ingests*). So today the roster is exposed only to internal staff with no new
  reach. **Latent High:** the offline capability's stated purpose is facility devices; the moment an
  external pack-pull is exposed to a provider key, this leaks the whole tenant (incl. NWSC).
- **Fix:** scope the pack roster with `ProviderEntitlementService.entitledMemberWhere(providerId)` (the
  same fragment the API eligibility rail uses post-E2E-D02), not `where:{tenantId}` — and honour N3
  group-level applicability so it doesn't re-introduce the client-level leak either.
- **FIXED (WP-A8, branch `fix/full-go-workstream-a`, 2026-07-14):** `buildPayload` now queries
  `where:{ AND:[{tenantId,status:ACTIVE}, entitledMemberWhere(providerId)] }`. 5 new unit tests
  (`tests/services/offline-pack-scope.test.ts`) prove client-scope, cross-direction, deny-by-default, and
  the N3 group-level shape; 656/656 suite green, tsc+guards clean. **Live-verified on local dev:** issued
  code OWA-WUM9Z6 for Aga Khan and unlocked the pack → **"Pack: 0 members · 4 tariffs"** (Aga Khan has no
  active applicability in the local seed → fail-closed deny-by-default; pre-fix this pack held the whole
  local tenant roster). Prod re-verify = D-14 (Default-Client provider → ≤249 entitled, no NWSC).

### [C3/C5] Exactly-once assimilation — ✅ VERIFIED (code + DB-enforcement), true-offline replay not exercised
- **Two independent idempotency layers:** (1) `SyncService.ingest` drops a repeated `opKey`
  (`syncOperation` unique `tenantId_opKey`) → `duplicate:true`, no re-buffer; (2) `reconcileClaim` checks
  `claim.findFirst({ externalRef: clientUuid })` before creating → returns SYNCED without a second claim.
- **DB-enforced once WP-A2 deploys:** offline claims set `externalRef = clientUuid`; my WP-A2 unique index
  `@@unique([tenantId, providerId, externalRef])` makes a duplicate offline claim a hard DB violation, not
  just an app-level check. Verified WP-A2 does **not** break the offline rail (distinct clientUuids never
  collide; a P2002 race resolves to the existing claim on retry — minor: reconcileClaim lacks the explicit
  P2002 catch the claims route has, so a concurrent-reconcile race surfaces a transient 500, op stays
  PENDING, retry → SYNCED; no double claim).
- **Provider attribution is work-code-bound** (`reconcileClaim` line 162-173): the op resolves to the
  work-code's facility authoritatively; payload `providerCode` is a fallback only and cannot redirect a
  facility's ops (the offline analogue of the claims-rail providerFromKey fix). PASS by code.
- **Stale-snapshot conflicts (C4):** reconnect re-validates member status, group status, provider contract,
  and benefit balance against live state (lines 152-220); any failure → `CONFLICT` with reason →
  `ExceptionLog` (visible to ops), never a silent pay or drop. PASS by code.
- **Not exercised live:** a true offline capture→disconnect→reconnect→duplicate-sync replay was not run
  (network-disconnect simulation is unreliable in the in-app browser, and driving it would materialise
  test packs/claims on prod). The exactly-once guarantee is code-deterministic + soon DB-enforced; a live
  replay remains a nice-to-have confirmation, marked PARTIAL.

### [OBS-C2] Offline capture is internal-ops-only (capability/intent mismatch) — Low
`/offline-capture` requires `ROLES.OPS`, so the "shared facility workstation offline capture" the test plan
and code comments describe does not exist for `PROVIDER_USER` on this build — external facilities can
*ingest* via `/api/v1/sync` (API key) but cannot unlock a pack. The facility-facing offline capability is
effectively unbuilt; today it is an internal-ops tool.

### [OBS-C3] Sync route resolves tenant via `findFirst`, not the key — Low (latent multi-tenant bug)
`/api/v1/sync` (route line 35) does `prisma.tenant.findFirst()` (TODO G8) instead of binding the tenant to
the API key. Benign in single-tenant prod, but in a multi-tenant deployment every key would ingest into
"the first tenant." Fix before onboarding a second operator tenant.

## C3 — Family D: HMS Batch & Delayed Hospital Feeds

**Method:** HMS batch rail (`POST /api/v1/hms-batch` → `HmsBatchService`) assessed by code path + prod DB
state. Prod: **1 clinical case (0 open), 0 HMS batch entries ever, 0 HMS integration configs, 0 active API
keys** — the rail is dormant (never exercised), and there are no open cases to append to, so a live
black-box probe would need a fabricated case + a facility key (prod mutations) with the endpoint returning
401 to everyone today. Findings are code-deterministic (as with C2).

### [FG-C3] HMS batch is not bound to the API key's facility — 🔴 High (latent; must-fix before HMS launch)
- **Code:** `postHmsBatch` (`src/app/api/v1/hms-batch/route.ts`) authenticates with `withApiKey` but **never
  reads the credential** — it does not call `getApiCredential`. `HmsBatchService.apply` then resolves the
  target provider **entirely from the payload** `facilityCode` (`hms-batch.service.ts:76-88`, matched by
  provider id / exact name / smartProviderId), and matches the case with `providerId: <that provider>`.
- **Impact:** a valid **facility A key can post a batch with `facilityCode: "<Facility B>"`** and append
  service entries to **Facility B's open cases** (case numbers are sequential/enumerable). This accrues
  charges onto another facility's case → its closure claim. The key's own facility is never checked. This
  is the **cross-rail parity gap**: the claims rail was hardened to force `providerFromKey` and ignore body
  `providerCode` (E2E-D02/BD-06), but the HMS batch rail — a parallel intake path — missed that hardening
  (D2-01: *"Facility A key sends Facility B code → Expected: rejected before case lookup; no B case
  mutation"* — currently NOT rejected).
- **Why latent, not live today:** prod has 0 active API keys + operator channel disabled, so the endpoint
  401s for everyone. But issuing per-facility keys is the entire point of the HMS integration, so this is
  **live the moment HMS goes live** — with no defence-in-depth behind it (unlike FG-C1's OPS-RBAC gate).
- **Fix:** in the route, `getApiCredential(req)`; when the credential is a provider key, force the batch's
  provider = `credential.providerId` and reject (or ignore) a mismatched `facilityCode` — the same shape as
  the claims-rail `providerFromKey` fix. Pass the resolved provider into `HmsBatchService.apply`.

### [FG-C4] HMS batch has no per-line quarantine — a poison line aborts the whole batch — 🟠 Medium
- **Code:** `HmsBatchService.validate` checks description/entryDate/`unitAmount>=0`/case-ref but **does NOT
  validate `quantity`**. A `quantity: 0` (or negative) entry therefore passes `validate()`, matches a case,
  then throws inside `CaseService.addServiceEntry` (`case.service.ts:115` "Quantity must be at least 1").
  `apply()` has **no per-line try/catch** — the throw propagates → route catch → **HTTP 400 for the whole
  batch**, while earlier valid lines in the loop have **already committed** (each `addServiceEntry` is its
  own `$transaction`).
- **Impact:** (a) partial apply + hard failure on one bad line — the opposite of the D3/D5 requirement
  ("unsafe lines rejected/quarantined *individually*; safe lines continue"); (b) **poison line**: on retry
  the committed lines dedupe (idempotent) but the bad line throws again → 400 again → every line *after* it
  never applies. Also **decimal quantity** (e.g. 1.5) passes both `validate()` and `addServiceEntry`
  (`quantity < 1` is false) — accepted silently.
- **Fix:** add `quantity` validation to `HmsBatchService.validate` (positive integer), and wrap the per-line
  `addServiceEntry` in `apply()` in try/catch so a throwing line becomes an `ExceptionLog`
  (HMS_BATCH_REJECTED) — quarantined, not batch-fatal.

### [D2/D1] Attribution + conservation that HOLD by code — ✅ PASS
- **Foreign case number** (case not at this facility) → no match → `HMS_BATCH_UNMATCHED` ExceptionLog (D2-02).
- **Member fallback, 1 open case** → matched (D2-03); **2 open cases** → `take:2`, `length===1 else null`
  → unmatched, no arbitrary pick (D2-04).
- **Closed case** → excluded by `status IN (OPEN, PENDING_CLOSURE)` + `getOpenCase` guard; immutable (D2-05).
- **Idempotent replay:** each applied line stamps `hmsBatchRef = batchRef#sha256(line)`; re-posting the same
  batch finds the existing entry → counted `duplicate`, creates nothing (D4 replay-safe).
- **Conservation:** report returns `total = applied + duplicates + unmatched` with `total = entries.length`
  (D1) — every line reaches exactly one outcome; unmatched are visible in the Exception Register.

### [OBS-D1] Idempotency key is global, not provider-scoped — Low (D2-06)
`caseServiceEntry.findFirst({ where: { hmsBatchRef } })` is not tenant/provider-scoped, and `hmsBatchRef =
batchRef#lineHash` omits the facility. Two facilities using the same `batchRef` with an identical line
(same sha256) would collide — the second suppressed as a duplicate. Low (batchRefs are facility-prefixed by
convention, e.g. `AGA-2026-07-03`), but scope the idempotency lookup by provider when fixing FG-C3.

### [OBS-D2] Tenant via `findFirst`, not the key — Low
`hms-batch/route.ts:21` uses `prisma.tenant.findFirst()` (TODO G8) — same latent multi-tenant bug as
OBS-C3 (`/api/v1/sync`). Fix both together before a second operator tenant.

### [D6] Integration honesty — ⚠️ honest stub (UI not verified)
`HmsBatchService.pollConfiguredEndpoints` returns `"connector transport not yet implemented — push API is
live"` and there are **0 HMS IntegrationConfigs** on prod, so nothing falsely claims CONNECTED. The poll
transport is honestly represented as unbuilt. The `/settings/integrations` UI honesty (does saving a config
falsely show CONNECTED/recent-sync?) was **not** driven this pass — carry as a small UI check.

**C3 net:** first **High** of Workstream C — **FG-C3** (HMS batch not key-scoped → cross-facility case
write), latent behind "no keys issued" but live on HMS launch; plus **FG-C4** (Medium, no per-line
quarantine + quantity-validation gap) and two Low observations. The conservation/idempotency/attribution
*matching* logic (D1/D2-02..06) is sound. Recommend a WP for FG-C3 + FG-C4 (mirror the claims-rail
providerFromKey fix + per-line quarantine) before issuing any facility HMS keys.

## C4 — Family J: Membership, Endorsement & Effective-Date Hardening

**Method:** endorsement/eligibility code path + prod DB state. Prod: 6 endorsements (2 APPLIED), 0 terminated
members, **171 claims with `dateOfService` < member `enrollmentDate`** (see FG-C5), 0 paid claims for a
now-terminated member.

### [FG-C5] Eligibility resolved by CURRENT status, not point-in-time as-of-service-date — 🟠 Medium (J9)
- **Code:** claim intake (`claim-intake.ts`) gates on `assertServiceDateNotFuture` + **current** `member.status`
  / `group.status` only. It never compares `dateOfService` against the member's `enrollmentDate` (coverage
  start), and the Member model has **no** `terminationDate`/`coverageEnd` — coverage is modelled as *current*
  `status` + `enrollmentDate`. `claim-decision.service` and `/api/v1/eligibility` likewise do no date-based
  coverage gating.
- **Two failure modes (the J9 spine concern — "coverage resolved by signed effective-date policy, not
  whichever state happens to be current"):**
  - **Under-block (money direction):** a claim with `dateOfService` **before** the member's `enrollmentDate`
    is **not** rejected at intake — coverage-start is never checked. **Evidence:** 171 prod claims already
    have `dateOfService < enrollmentDate` and were accepted (mostly seed data, but it proves the gate is
    absent — real coverage would reject a pre-coverage service date).
  - **Over-block (correctness direction):** once a member is TERMINATED/SUSPENDED, the current-status check
    declines **every** claim including those for service dates when the member **was** active — so a
    legitimate claim for services rendered while covered, filed after termination, is wrongly blocked (J7).
- **Severity Medium:** genuine eligibility-resolution gap with a money-leak direction and an over-block
  direction, but gated by adjudicator oversight and specific date/status combos; not a deterministic Critical.
- **Fix:** resolve eligibility **as of `dateOfService`** — gate `enrollmentDate <= dateOfService` at intake,
  and evaluate status/termination against the service date (needs a coverage-period/termination-effective
  model, or at minimum a `coverageEndDate`), so an async status change can't retroactively flip a
  service-date-correct claim.

### [FG-C6] Endorsement approval is not concurrency-safe — 🟠 Medium (J2)
- **Code:** `EndorsementsService.approveEndorsement` (`endorsement.service.ts:98`) is a **check-then-act**:
  it reads `status`, verifies it is SUBMITTED/UNDER_REVIEW (line 104), then executes the member change + GL
  posting + invoice + sets APPLIED — **with no transaction wrapper and no optimistic lock** (called from the
  tRPC router and the server action, neither transactional).
- **Impact:** two checkers approving the **same** endorsement in the same window both pass the status guard
  and both fire the side effects → **double GL adjustment + two auto-invoices** (no idempotency), and for
  MEMBER_ADDITION a possible **duplicate member** (partially mitigated by `@@unique([tenantId,memberNumber])`
  → the second create may P2002-fail nondeterministically, but the GL/invoice double-post is unguarded).
  Test-plan J2 ("Admin and HR open the same endorsement; submit/approve concurrently").
- **Fix:** wrap approve in a transaction and make the status transition atomic — e.g. `updateMany({ where:{
  id, status:{ in:[SUBMITTED,UNDER_REVIEW] } }, data:{ status:APPLIED... } })` and proceed only if `count===1`;
  or a row lock. Then do the member/GL/invoice work inside the same transaction.

### Family J — controls that HOLD by code — ✅ PASS
- **Self-approval prevented (J3):** `approveEndorsement` throws SoD if `requestedBy === approvedBy`
  (endorsement.service.ts:110-113, PR-033). Maker ≠ checker enforced server-side.
- **Financial-impact endorsement won't apply without its GL entry (J8):** a failed GL/invoice post throws and
  leaves the endorsement pending for retry — no silent apply (endorsement.service.ts:188-197, PR-018 policy).
- **Effective date honoured for enrollment + pro-rata:** `enrollmentDate = effectiveDate`; pro-rata computed
  from `effectiveDate` (endorsement.service.ts:78/135). The *endorsement* respects effective dates; the gap is
  only that *claim eligibility* (FG-C5) does not.

**C4 net:** two Mediums — **FG-C5** (eligibility is current-status, not point-in-time; the J9 spine concern,
evidenced by 171 pre-enrollment claims) and **FG-C6** (endorsement approval double-apply race). Self-approval
SoD and no-silent-apply controls hold. Neither is a live Critical/High, but both are real hardening gaps;
candidates for a WP (point-in-time eligibility is the more significant, and would also require a data-model
addition for termination-effective dates).

## Chronological
- Loaded /uat skill, resumed BB2 engagement for Workstream C.
- Identified prod DB = Supabase `otivyuroqraiijayvkze` (AiCare); tenant medvex `cmr3ae8v30000nlvqxrqlfn38`, 2 clients, 2,999 members.
- Quantified N3 via 3 read-only queries (clients/groups/members; client-level applicability; aggregates). Result above.
- Generated WP-A6 sign-off CSV from prod (1,140 rows) → `evidence/n3_provider_group_matrix.csv`.
- Logged into prod as SUPER_ADMIN; confirmed N3 live on /clients (Default Client = 6 schemes).
