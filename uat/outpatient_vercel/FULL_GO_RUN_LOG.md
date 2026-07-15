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
> prod (1 case/0 open, 0 HMS entries, 0 configs, 0 keys). **FG-C3+FG-C4 FIXED (WP-A9).**
> **DEPLOYED all 9 WPs to prod 2026-07-14** (build 2ba6f76 READY; WP-A2 unique index applied out-of-band
> via Supabase then re-triggered). **D-gate: D-1 PASS (rails 401), D-14 PASS (FG-C1 offline pack = 247 not
> 2,997, NWSC excluded — live on prod).** Remaining D probes (D-4/5/6/12/15 API-key, D-8 fraud toggle, D-11
> N3 apply) BLOCKED on Workstream B (Arthur: Vercel env API_KEY, fraud gate, N3 sign-off).
> **C5 settlement-concurrency ASSESSED → FG-C7 (HIGH, money spine, latent):** Mark Paid not atomic
> (check-then-act outside tx; no voucher uniqueness; no GL sourceId dedupe) → concurrent/retried Mark Paid
> double-pays (2 vouchers + 2 JEs, provider paid twice). Batch creation (I1) SAFE via unique constraint.
> No prod occurrence yet. Clean code-only fix = atomic status-claim updateMany as first tx write.
> **FG-C7 FIXED (WP-A10, 6cb44ba, branch — NOT deployed).** **C6 F/G ASSESSED → SYSTEMIC finding SYS-1:**
> check-then-act state transitions across all approval surfaces → FG-C8 (PA decision → phantom hold, Med),
> FG-C9 (case double-file → two claims/potential double-pay, Med). Same root cause as FG-C6/FG-C7. All fix
> with the WP-A10 atomic status-claim pattern. Family F check-in NOT examined (residual).
> **C7 → FG-C10 (Med, worker-only hold expiry); worker infra sound. C8 spot-check → SYS-1 also in
> binding/amendment; member-payment guarded. C9 scale NOT run (residual).**
> **DISCOVERY PASS C5–C8 DONE.** Open: FG-C5/C6/C8/C9/C10 (Med) + SYS-1 sweep; FG-C7 fixed (WP-A10, undeployed).
> Residuals: Family F check-in, worker-pause war-game (N4-7), full Family R, C9 scale.
> **BATCH FIXED (branch, undeployed):** WP-A11 (`3114df9`) SYS-1 sweep = FG-C6/C8/C9 atomic status-claim;
> WP-A12 (`a7c4a42`) = FG-C5 enrollment gate (under-block half). FG-C10 + FG-C5 over-block DEFERRED. 670 green.
> **DEPLOYED 2026-07-14: WP-A10/A11/A12 live on prod** (push HEAD→main `ece3554`; build
> `dpl_EEjKhYRCA2gedUqWGsYQcU54LaA2` READY — clean, no schema change). **Re-verification:** deploy healthy
> (all API rails 401 fail-closed on the new build; /login 200; new code confirmed serving). FG-C6/C7/C8/C9
> concurrency guards = deployed + **unit-verified** (deterministic loser tests; live sub-second race
> reproduction impractical without a concurrency harness — standard for this class). FG-C5 enrollment gate =
> deployed + unit-verified (live claim-wizard drive not run — 4-step form, low marginal value over the 2 unit
> tests). **ALL committed fixes (WP-A1–A12) now live on prod.** Deferred to a NEW FORK: WP-B1 (FG-C10 live
> hold-expiry), WP-B2 (FG-C5 over-block / coverage-end model — product decision), WP-B3 (SYS-1 remnants
> binding/amendment + audit sweep). Residual UAT: Family F check-in, worker-pause war-game, full Family R,
> C9 scale. (Plan §8 has the fork backlog.)
> **FORK B DONE + DEPLOYED 2026-07-15:** WP-B3 (`7444eb5`), WP-B1 (`636ab42`),
> WP-B2 (`810ca87`) — 706 vitest green, tsc clean, brand+currency guards pass. **WP-B3 FG-C11** = SYS-1 atomic
> status-claim on binding (captureAcceptance SENT→ACCEPTED; createMemberships `groupId`-null double-bind claim +
> orphan-group drop — the quotation enum has no post-ACCEPTED state), amendment (submit/approve/**apply**
> [claim-first + revert-on-failure]/reject), and the sweep-found `approveSettlementBatch` maker-checker gate; 12
> loser tests. **WP-B1 FG-C10** = live hold-expiry reconciliation `held=max(0, stored−expired-active,
> live-active)` across availableLimit/remainingAfter/offline-pack/sync/PA-balance (proven never-under-reserve;
> worker `releaseExpiredHolds` unchanged). **WP-B2 FG-C5 over-block** = coverage-period model
> (`MemberCoveragePeriod`); intake + B2B API resolve coverage as-of the SERVICE date (API cover-start parity gap
> also closed); product decision = coverage-period table; backfill script; fail-open + `ignoreOpenPeriods`
> safety; lifecycle terminations close periods, binding opens them.
> **DEPLOYED 2026-07-15 (human-authorised):** push `df5d7d1..fe0f7c1`→main; Vercel prod build
> `dpl_HJp8QUfYn8wR6veH2KDsqz9oco9p` **READY** (~114s). `db push` created the `MemberCoveragePeriod` table
> (new table, no unique index — clean). **WP-B2 backfill applied via Supabase MCP** on `otivyuroqraiijayvkze`
> (idempotent `INSERT…SELECT`): **2,999 open periods for 2,999 members, 1:1, 0 dupes, 0 uncovered, 0
> start-date mismatches** (all members non-terminal → all open). **Health re-verify:** `/login` 200 (serving),
> `POST /api/v1/claims` no-key 401 (fail-closed on the new build). Concurrency guards (WP-B3) + hold-expiry
> (WP-B1) are unit-verified (live sub-second race reproduction needs a harness); the FG-C5 coverage gate is
> now live for the whole book (testable via `/claims/new`).
>
> **SYS-1 audit sweep (WP-B3) — documented triage.** Swept every `findUnique → validate status →
> update({where:{id}})` on a state machine. FIXED this fork: binding, amendment, `approveSettlementBatch`.
> Already atomic / DB-guarded (no action): settlement pay `markSettlementBatchPaid` (FG-C7), endorsement approve
> (FG-C6), PA decide (FG-C8), case-file (FG-C9), benefit-hold exactly-once (`benefitHold` unique+delta),
> member-payment M-Pesa (`checkoutRequestId` @unique + idempotencyKey — do NOT touch). Remaining same-pattern but
> LOWER-risk (idempotent status sets / single-actor maker-checker; NONE double-fire an irreversible financial
> side effect): `reinstatement.approveReinstatement`, `rbac` role-approve, `override` approve,
> `contract-lifecycle` submit/approve/suspend, `contract-reconciliation`, `terminology` approve/reject,
> `cross-border`, `fraud-engine` assign/resolve, `analytics` alert ack/resolve, `dpo` DSAR, `providers` /
> `provider-contracts` setStatus, `clients` deactivate, `onboarding` KYC, `wellness` (idempotent),
> `offline-auth` / `secure-checkin` (own lifecycles). **Recommendation:** a focused SYS-1-followup WP to harden
> the maker-checker ones (reinstatement / rbac / override / contract-lifecycle) — NOT a GO blocker since the
> money / irreversible steps are already atomic.
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

## DEPLOY + D-GATE (fix build) — 2026-07-14

**Deployed all 9 code WPs (A1–A9) to prod.** Pushed `fix/full-go-workstream-a` → main (`17215fb`). First
prod build **failed** at `prisma db push` (refuses the WP-A2 unique index without `--accept-data-loss`;
`db-sync.mjs` omits it by policy — same as historical BD-05). Applied `Claim_tenantId_providerId_externalRef_key`
to prod Supabase via `apply_migration` (0 conflicts verified), re-triggered with empty commit `2ba6f76` →
**build `dpl_6nDKmF3xHcznuQZW1WGDgQCG53iW` READY**, live on avenue-portal.vercel.app.

### D-gate results (runnable-now probes)
- **D-1 (BD-06 fail-closed) — ✅ PASS.** All three API rails on the new build 401 with no key / bogus key /
  both header forms: `POST /api/v1/claims` → 401×3, `/api/v1/hms-batch` → 401×2, `/api/v1/sync` → 401.
- **D-14 (FG-C1 offline pack scope, WP-A8) — ✅ PASS (marquee live proof).** As admin, issued offline code
  OWA-9YWCZ4 for **Aga Khan** (client-level entitled to the Default Client) and unlocked the pack →
  **"Pack: 247 members · 544 tariffs"** (DB `OfflineDataPack.memberCount = 247`). Pre-fix this was the whole
  tenant (~2,997 incl. all 2,750 NWSC); now it is the Default Client's entitled members only (≈249; 2 fewer
  for inactive/package-filtered), **NWSC excluded**. FG-C1 is fixed in the running prod build. Test code revoked.

### B1 done + operator-key D-probes (2026-07-14) — ✅
Arthur set `API_KEY` + `OPERATOR_TENANT_ID` in Vercel Production and redeployed (`dpl_317ubCBaYfZaufTQcvdsT1vJvCX5`).
Verified live with the operator key (since rotated):
- **D-12 / B1 — ✅ PASS.** Operator key `GET /api/v1/claims?claimNumber=CLM-2026-00297` → **200** with the
  claim body (Mark Kato, Aga Khan, approved 3,500). Channel live + reads Medvex; retired `av-slade360-dev-key`
  and bogus keys still **401**.
- **D-4 (BB2-DEF-01) — ✅ PASS.** `unitCost:-5000` → **400** `{"lineItems":["unitCost must be greater than 0"]}`, no claim written.
- **D-5 (BB2-DEF-02) — ✅ PASS.** malformed `diagnoses:[{notCode}]` → **400** validation (not 500).
- Valid input, unresolvable providerCode → **404 "Provider not found"** (confirms validation passes clean
  input; the block is provider resolution).
- **D-6 (BB2-DEF-03 idempotency) — DEFERRED (needs a facility key).** The operator POST resolves the provider
  ONLY by `slade360ProviderId`, and **0/195 prod providers have one** → the operator key cannot create a
  claim, so the 201→replay path can't be exercised on this rail. Unit-tested (5 tests) + the unique index
  `Claim_tenantId_providerId_externalRef_key` is live in prod. Test via a per-facility key with D-15.

**OBS-B1: operator WRITE channel inert on prod** — no provider has `slade360ProviderId`, and the operator
claims POST matches providers only by that field, so operator-key claim *creation* always 404s. Reads work.
Not a defect in the WP fixes; the intended write path is per-facility keys. Populate `slade360ProviderId`
(or rely on facility keys) before using the operator write channel.

### D-gate probes still BLOCKED
- **D-6 + D-15 (FG-C3/FG-C4 HMS batch)** — need a **per-facility ProviderApiKey** (resolves provider from the
  key). Issue one via `/settings` (or provider portal), then test idempotency + HMS cross-facility rejection.
- **D-8 (OBS-H1 settlement-side fraud gate)** — needs the fraud gate turned ON for the tenant (**B3**,
  `/settings/claim-controls`). Not flipped (changes live adjudication behaviour — Arthur's call).
- **D-11 (N3 group-scoping)** — needs the WP-A6 apply script run after business sign-off (**B5**).
- **D-2/D-3/D-7/D-9/D-13** (ceiling, login/supplementary run, ceiling preview, throttle, money spine) — UI
  re-confirms of already-verified BB2 controls; runnable but deferred (lower marginal value; my changes to
  those surfaces are display-only or default-off).

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

## C5 — Family I/O: Settlement Under Uncertainty & Concurrent Finance

**Method:** settlement concurrency by code path + prod DB. This is the money spine — the verdict's spine
question "can money leave only with required approvals / exactly once?".

### [FG-C7] Mark Paid is not atomic → concurrent/retried Mark Paid double-pays — 🔴 High (money spine; latent)
- **Code:** `markSettlementBatchPaid` (`claim-adjudication.service.ts:550`) guards status with a **check-then-act
  OUTSIDE the transaction**: `if (batch.status !== "CHECKER_APPROVED") throw` (read at line ~556), then a
  `$transaction` creates the voucher + JE and, as its LAST step, `providerSettlementBatch.update({ where:{id} })`
  → **status SETTLED with NO status guard in the where**. Inside the transaction: `GLService.postSettlementBatchPaid`
  → `postEntry` **unconditionally** `journalEntry.create` (no `sourceId` idempotency, gl.service.ts:76), and
  `PaymentVoucher` has **no unique constraint** on `settlementBatchId` or `voucherNumber` (only `@@index`).
- **Race (I4 / O2):** two Mark Paid calls on the same CHECKER_APPROVED batch — two finance sessions, or a
  single uncertain-network **retry** (the exact I4 script: "interrupt the response, retry once") — both read
  CHECKER_APPROVED, both enter their transaction, and **each creates a PaymentVoucher + a balanced JE
  (Dr 2010 Claims Payable / Cr 1010 Bank)**. Nothing blocks the second: no voucher uniqueness, no GL
  `sourceId` dedupe, the batch update is unconditional. Result: **two vouchers + doubled bank credit for one
  batch → the provider is paid twice** and Claims Payable is over-cleared. GL trial balance still nets to zero
  (each JE is balanced), so a balance check won't catch it — only a per-batch voucher/JE count would.
- **Severity High (Critical-adjacent):** on the money spine, no guard, realistic triggers (retry after an
  uncertain response; two checkers). Requires a concurrency window (not deterministic) and **no prod
  occurrence yet** (0 batches with >1 voucher), so latent — but it breaks "money leaves exactly once".
- **Fix (code-only):** make the status transition the atomic gate — as the FIRST write inside the transaction:
  `const claimed = await tx.providerSettlementBatch.updateMany({ where:{ id, tenantId, status:"CHECKER_APPROVED" }, data:{ status:"SETTLED", settledAt, ... } }); if (claimed.count !== 1) throw "batch no longer awaiting payment";`
  then create the voucher/JE. The loser's `updateMany` matches 0 rows (row-locked behind the winner) → throws →
  rolls back before any voucher/JE. Optional defence-in-depth (schema): unique `PaymentVoucher.settlementBatchId`
  and unique GL `(tenantId, sourceType, sourceId)` — but the atomic claim is the primary, no-schema fix.

### [I1] Concurrent batch creation — ✅ SAFE (with a minor UX note)
`createSettlementBatch` computes `nextSequence` then creates inside a transaction; the
`@@unique([tenantId, providerId, cycleMonth, cycleYear, sequence])` constraint means two makers racing the
same provider/cycle both compute the same sequence → the loser hits **P2002 inside its transaction and rolls
back** (no batch, no claim reassignment) → claims belong to one batch only. **OBS-C5:** the loser surfaces a
raw P2002/constraint error, not the friendly "another run was just created — refresh" message I1 expects.
Low. (Contrast FG-C7: batch creation is DB-guarded; Mark Paid is not.)

**C5 net:** one **High** — **FG-C7**, the first money-spine concurrency defect (Mark Paid double-pay under
retry/concurrency), latent but NO-GO-class for settlement. Batch creation (I1) is safe via the unique
constraint. FG-C7 is a clean code-only fix (atomic status-claim) — recommend prioritising it as a WP.

## C6 — Family F/G: Check-In Binding, PA/LOU/Hold & Case Lifecycle Races

**Headline: a SYSTEMIC concurrency class.** Every state-transition/approval surface uses **check-then-act**
— read status with a plain `findUnique`, validate it *outside* any transaction, then an **unconditional**
`update({ where:{ id } })` — so two concurrent actors both pass the guard and both fire side effects. Same
root cause as **FG-C6** (endorsement), **FG-C7** (settlement Mark Paid — fixed WP-A10), and now the two below.

### [FG-C8] PA manual decision is not atomic → dual decision + phantom benefit hold — 🟠 Medium (G2)
- `approveByHuman` / `declineByHuman` (`preauth-adjudication.service.ts:503/552`) check
  `status ∈ {SUBMITTED,UNDER_REVIEW}` outside a transaction, then `preAuthorization.update({ where:{ id } })`
  unconditionally. Two Medical officers deciding the same PA concurrently (G2.2) both pass → last-write-wins on
  status. If the **approve** places the benefit hold (`createBenefitHold`) and the **decline** wins the status,
  the PA reads DECLINED but the **ACTIVE benefit hold persists** (decline doesn't release a hold placed after
  it read) → phantom reservation reducing the member's available limit.
- Not-a-defect part (✅): the hold itself is **exactly-once** — `benefitHold` is unique on `preAuthId` and
  `createBenefitHold` applies only the delta, so a re-approval never double-reserves (G2.4 holds).
- **Fix:** atomic status-claim `updateMany({ where:{ id, status:{in:[SUBMITTED,UNDER_REVIEW]} }, data:{ status } })`
  as the first write; if `count!==1` throw a friendly stale-state error (the FG-C7 pattern). Release any hold on decline.

### [FG-C9] Case closeAndFile is not atomic → two claims from one case — 🟠 Medium (G3)
- `closeAndFile` (`case.service.ts:192`) checks `c.claims.length > 0` outside the transaction, computes
  `claimNumber` from a pre-transaction `claim.count`, and the in-transaction case-status update
  (`clinicalCase.update({ where:{ id } })`, line 278) is unconditional. `Claim.caseId` is **non-unique**
  ("one-case-many-claims by design"). Two concurrent closes both read `claims:[]`; if the second reads the
  count *after* the first commits it gets a different claimNumber → **two claims filed from one case** (the
  `@@unique([tenantId,claimNumber])` only catches the same-count sub-race). Each claim carries the case's full
  service set → a duplicate that can be adjudicated+settled → **potential double-pay**, mitigated only by the
  **advisory** cross-rail double-capture detection (OBS-H1: advisory, doesn't gate). Violates the D5/G3 "one
  case → one claim" rule.
- **Fix:** atomically claim the case inside the transaction —
  `updateMany({ where:{ id, tenantId, status:{ in:[OPEN,PENDING_CLOSURE] } }, data:{ status:"CLOSED_FILED", ... } })`,
  proceed only if `count===1`, then create the claim; or add a partial-unique index on `Claim.caseId` (schema).

### [SYS-1] Systemic: check-then-act state transitions (observation, ranks the above)
The decision/approval/close surfaces share one pattern: status validated outside the transaction + an
unconditional update. It has already produced **FG-C6, FG-C7, FG-C8, FG-C9**. FG-C7 (double-pay) was the most
severe and is fixed with the atomic status-claim (`updateMany(where status=…) → count===1`); **the same
2-line pattern should be applied to endorsement approve (FG-C6), PA decide (FG-C8), and case file (FG-C9)** —
and worth an audit sweep of every `findUnique → validate → update({where:{id}})` on a state machine.

### PASS / residual
- **I1-style DB guards hold where they exist:** benefit-hold exactly-once (benefitHold unique + delta),
  and the same-count double-file sub-race is caught by the claimNumber unique.
- **Family F (check-in challenge replay / one-time / facility-bound binding)** — NOT yet examined this pass;
  carry as a residual (needs the secure-checkin flow driven with challenge replay/expiry/cross-facility).

**C6 net:** two Mediums (FG-C8 PA decision, FG-C9 case double-file) that are instances of the **SYS-1**
systemic check-then-act class (root cause shared with FG-C6/FG-C7). All fixable with the same atomic
status-claim pattern already proven in WP-A10. Family F check-in untested.

## C8 — Family R: Portfolio Operations (spot-check) & C9 — Scale

**C8 (spot-check, not exhaustive):** confirmed **SYS-1 reaches portfolio ops** — `binding.service.ts`
(quotation `status!=="SENT"`/`"ACCEPTED"` then `update`, lines 46/140 → concurrent quote-accept/double-bind)
and `amendment.service.ts` (endorsement `status!=="DRAFT"` then `update`, line 222) are the same check-then-act
shape. **Guarded exception (✅):** `member-payment.service.ts` (M-Pesa co-contribution) is idempotent via
`MemberCoContributionPayment.checkoutRequestId @unique` + `idempotencyKey`, so the money-**in** rail is safe
under callback replay. The rest of Family R (billing/admin-fee, bank recon, commission payout, wallet
callbacks, cross-border FX, DSAR, wellness/health-vault) is **residual** — broad per-module UAT not done this
pass; expect more SYS-1 instances + module-specific checks.

**C9 (scale):** NOT run — needs the load harness (Outstanding-Conditions Ticket 6) executed in an approved
window; running load against prod is out of scope here. The verdict's standing scale condition survives.

## C — Consolidated discovery result (C5–C8)

**Dominant theme = SYS-1: a systemic check-then-act concurrency class** across every state-transition surface
(status read outside the tx + unconditional `update({where:{id}})`). Instances found: settlement Mark Paid
(**FG-C7, High — fixed WP-A10**), endorsement approve (**FG-C6**), PA decide (**FG-C8**), case file
(**FG-C9**), quotation accept/bind + amendment (C8 spot-check). Surfaces WITH a DB-uniqueness guard are safe:
settlement-batch sequence, claimNumber, benefitHold(preAuthId), M-Pesa checkoutRequestId. Plus one worker
gap (**FG-C10**, silent hold-expiry) and the C4 Mediums (**FG-C5** point-in-time eligibility, **FG-C6**
endorsement concurrency).

**Open findings after C5–C8:** FG-C5 (Med), FG-C6 (Med), FG-C7 (High — FIXED WP-A10, undeployed), FG-C8
(Med), FG-C9 (Med), FG-C10 (Med), + SYS-1 audit sweep. **Recommended batch:** apply the WP-A10 atomic
status-claim pattern to FG-C6/FG-C8/FG-C9 (+ binding/amendment), add live hold-expiry (FG-C10) and the
enrollment-date intake gate (FG-C5, code half), in ONE fix+deploy pass, then re-verify.

## C7 — Family N: Worker, Jobs, Time & Operational Visibility

**Architecture positives (✅):** BullMQ (Redis) with **idempotent recurring scheduling** (dedup by jobId →
restart doesn't double-register, N6) and a **heartbeat** (`worker:heartbeat`, TTL 180s + 60s log line) so a
dead worker is detectable at the ops layer (N4 detectability). Fraud evaluation is **synchronous** on the
intake rails (not worker-dependent), so a down worker doesn't skip fraud flags.

### [FG-C10] Benefit-hold expiry is silently worker-only — 🟠 Medium (N8)
- `releaseExpiredHolds` (`preauth-adjudication.service.ts:427`, sets expired PAs → EXPIRED and releases their
  holds) is invoked **only** by `preauth-escalation.job.ts:78` (the worker). `BenefitUsageService.availableLimit`
  computes `available = limit − used − activeHoldAmount` from the **stored** `activeHoldAmount` with **no live
  `validUntil` check**. So if the worker is down (or the job lags), **expired holds are never released** →
  `activeHoldAmount` stays inflated → the member's available benefit is silently **over-reserved**, and claims
  can be wrongly declined "insufficient balance" for cover that should have freed. The plan flags worker
  dependence for *expiry* as at-least-High; it **fails safe** (over-reserves, never overpays) and the
  heartbeat gives ops detectability, so Medium here — but it's a genuine silent-degradation gap.
- **Fix:** exclude holds past `validUntil` **live** when computing available balance (defence in depth), so
  hold expiry doesn't depend solely on the worker; the worker job then only reconciles the stored total.

### Residual (needs a worker-pause UAT env — can't pause the prod worker)
Backlog drains **exactly once** in deterministic order (no duplicate notifications/accruals/expiry/decisions,
N5); worker restart ×2 double-register check (N6); **time edges** — Africa/Kampala midnight, month/year end,
leap day, clock skew (N7); and whether the app SURFACES degraded/stale state in the UI (not just the
heartbeat) when the worker is absent (N4). These require pausing the worker in an approved UAT environment.

**C7 net:** one Medium (FG-C10, silent worker-only hold expiry). Worker infra (idempotent scheduling +
heartbeat + synchronous fraud) is sound. The worker-pause war-game (N4/N5/N6/N7) is a residual needing env
control not available on prod.

## Chronological
- Loaded /uat skill, resumed BB2 engagement for Workstream C.
- Identified prod DB = Supabase `otivyuroqraiijayvkze` (AiCare); tenant medvex `cmr3ae8v30000nlvqxrqlfn38`, 2 clients, 2,999 members.
- Quantified N3 via 3 read-only queries (clients/groups/members; client-level applicability; aggregates). Result above.
- Generated WP-A6 sign-off CSV from prod (1,140 rows) → `evidence/n3_provider_group_matrix.csv`.
- Logged into prod as SUPER_ADMIN; confirmed N3 live on /clients (Default Client = 6 schemes).
