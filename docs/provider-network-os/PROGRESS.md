# Provider Network Operating System — Progress Board

**Spec:** `PROVIDER_NETWORK_OPERATING_SYSTEM_EXECUTION_PLAN.md` (repo root, 12 phases / 119 packages / 6 gates / 124 scenarios)
**Branch:** `feat/provider-network-os` — created off `feat/claims-autopilot` @ `015cb31` (2026-07-23)
**Why that base:** PNOS consumes the Claims Autopilot rail (§0.1/D5); the rail exists only on `feat/claims-autopilot` (43 commits ahead of `main`, 0 behind, at branch time).
**Isolation rule:** the Claims Autopilot engagement (its F8.2 worker provisioning + human F7.6 campaign + F8.3 k6 staging) continues on ITS branch/prod untouched. Nothing from this engagement is committed to `feat/claims-autopilot` or `main`, and the dirty UAT worktree files (uat/*, scripts/uat-*, the two root plan .md files) are NEVER staged here.

---

## RESUME PROTOCOL (read this first after any interruption)

1. `git checkout feat/provider-network-os` (dirty UAT files in the worktree are expected — leave them).
2. Read this file's status board; the next package = first `NOT_STARTED` whose dependencies are `COMPLETE` (respect gates below).
3. Read `IMPLEMENTATION_LOG.md` last entry — it names "Next eligible task" and any in-flight partial state.
4. Follow the spec's §0.2 mandatory protocol + §0.3 proof-before-build for that one package. One package per unit of work. Stop at its stop condition, append the §24.5 result note, update this board, commit.
5. Quality bars every package: `npm run typecheck` green; focused tests green; `npm run brand:guard` + `npm run currency:guard` at commit boundaries; schema changes only via sanctioned `prisma db push` workflow (docs/INSTALL.md §3 — never `migrate dev/reset`).

**Statuses:** `NOT_STARTED` · `IN_PROGRESS` · `PARTIAL` · `COMPLETE` · `BLOCKED(reason)` · `GATED(human sign-off named by spec)`

---

## Gates

| Gate | Exit criterion (abbrev.) | Status |
|---|---|---|
| A (F1) | provider/permission/branch scope server-derived on every provider route/API under test | OPEN |
| B (F2) | provider clinical files private, target-authorized, scanned, no permanent public URLs | OPEN |
| C (F4) | structured request completable with independent state/SLA/audit/notification, no financial mutation | OPEN |
| D (F5) | concurrency proves one active sibling; money proves no original mutation/double pay | OPEN |
| E (F6) | provider/admin/export views match; batch/voucher/disbursement/GL conserve | OPEN |
| F (F9) | delivery receipts survive queue/app failure; first real connector passes replay/retry/mapping/reconciliation UAT | OPEN |

## F0 — Baseline and safety characterization

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F0.1 | Freeze current provider route inventory | XS | COMPLETE | `PROVIDER_ROUTE_INVENTORY.md` |
| F0.2 | Characterize provider access leakage (tests) | S | NOT_STARTED | — |
| F0.3 | Characterize claim and PA ownership paths | S | NOT_STARTED | — |
| F0.4 | Characterize document storage and consumers | S | NOT_STARTED | — |
| F0.5 | Characterize settlement and money conservation | S | NOT_STARTED | — |
| F0.6 | Create deterministic provider test fixtures | S | NOT_STARTED | — |

## F1 — Provider access and entitlement foundation

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F1.1 | Define and seed provider permission catalog | S | NOT_STARTED | — |
| F1.2 | Add provider branch assignments | S | NOT_STARTED | — |
| F1.3 | Build canonical ProviderAccessService | M | NOT_STARTED | — |
| F1.4 | Migrate provider layout/navigation guards | S | NOT_STARTED | — |
| F1.5 | Harden provider user administration/offboarding | M | NOT_STARTED | — |
| F1.6 | Extend API keys: scope, expiry, branch, rotation | M | NOT_STARTED | — |
| F1.7 | Enforce API scopes route by route (per group: a,b,c…) | S/grp | NOT_STARTED | — |
| F1.8 | Audit applicability data readiness | M | NOT_STARTED | — |
| F1.9 | Backfill applicability (reviewed batches) | S/batch | GATED(network-ops signed input) | — |
| F1.10 | Add entitlement shadow comparison | M | NOT_STARTED | — |
| F1.11 | Make provider browser eligibility canonical | M | GATED(D3 readiness-gate approval) | — |
| F1.12 | Enforce entitlement on provider claim submission | M | GATED(approved flag per D3) | — |

## F2 — Private document foundation

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F2.1 | Private doc metadata + upload-intent schema | M | NOT_STARTED | — |
| F2.2 | Resource-level document authorization | M | NOT_STARTED | — |
| F2.3 | Upload intent creation | S | NOT_STARTED | — |
| F2.4 | Upload finalize + content validation | M | NOT_STARTED | — |
| F2.5 | Malware scan + quarantine lifecycle | M | NOT_STARTED | — |
| F2.6 | Authorized document download | M | NOT_STARTED | — |
| F2.7 | Backfill legacy document metadata (per class/batch) | S/batch | NOT_STARTED | — |
| F2.8 | Migrate document consumers (per group) | S/grp | NOT_STARTED | — |
| F2.9 | Remove provider public-object access | M | GATED(security approval) | — |

## F3 — Canonical PA intake and provider workbench

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F3.1 | Freeze PA submission/decision contracts | S | NOT_STARTED | — |
| F3.2 | PA intake receipt + event schema | S | NOT_STARTED | — |
| F3.3 | Implement PreauthIntakeService | M | NOT_STARTED | — |
| F3.4 | Migrate provider B2B PA submit | S | NOT_STARTED | — |
| F3.5 | Migrate internal PA rails (a/b/c per rail) | S/rail | NOT_STARTED | — |
| F3.6 | Retire fragmented PA persistence | M | NOT_STARTED | — |
| F3.7 | Canonical PA list read model | S | NOT_STARTED | — |
| F3.8 | Provider PA list page | S | NOT_STARTED | — |
| F3.9 | Provider PA submission page | M | NOT_STARTED | — |
| F3.10 | Canonical PA detail read model/page | M | NOT_STARTED | — |
| F3.11 | Provider PA cancellation | M | NOT_STARTED | — |
| F3.12 | Provider PA amendment | M | NOT_STARTED | — |
| F3.13 | PA-to-claim prefill and submit | M | NOT_STARTED | — |
| F3.14 | Authorized GOP/LOU artifact | M | NOT_STARTED | — |

## F4 — Information requests, inbox, SLAs, notifications

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F4.1 | Information-request schema + catalogs | M | NOT_STARTED | — |
| F4.2 | Request open/cancel service | M | NOT_STARTED | — |
| F4.3 | Provider draft + explicit response submit | M | NOT_STARTED | — |
| F4.4 | Reviewer accept/reopen/close | M | NOT_STARTED | — |
| F4.5 | Sanctioned claim reprocessing after acceptance | S | NOT_STARTED | — |
| F4.6 | Canonical provider inbox projection | M | NOT_STARTED | — |
| F4.7 | Inbox list + info-request detail pages | M | NOT_STARTED | — |
| F4.8 | Notification/outbox schema + dispatcher | M | NOT_STARTED | — |
| F4.9 | Migrate provider events to dispatcher (per family) | XS/fam | NOT_STARTED | — |
| F4.10 | SLA sweepers + operational queues | M | NOT_STARTED | — |

## F5 — Claim withdrawal, correction, resubmission, reconsideration

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F5.1 | Characterize every claim-status consumer | M | NOT_STARTED | — |
| F5.2 | Claim submission-chain schema | M | NOT_STARTED | — |
| F5.3 | Lifecycle: withdrawal/supersession terminal | M | NOT_STARTED | — |
| F5.4 | Create/backfill original chains (per batch) | S/batch | NOT_STARTED | — |
| F5.5 | Simple provider withdrawal service | M | NOT_STARTED | — |
| F5.6 | Provider withdrawal UI | S | NOT_STARTED | — |
| F5.7 | Atomic claim replacement service | L | NOT_STARTED | — |
| F5.8 | Correction form + lineage UI | M | NOT_STARTED | — |
| F5.9 | Resubmission eligibility service | S | NOT_STARTED | — |
| F5.10 | Linked post-decline resubmission | M | NOT_STARTED | — |
| F5.11 | Reconsideration schema + reason policy | M | NOT_STARTED | — |
| F5.12 | Reconsideration eligibility + submit | M | NOT_STARTED | — |
| F5.13 | Provider reconsideration form/detail | M | NOT_STARTED | — |
| F5.14 | TPA reconsideration triage + info flow | M | NOT_STARTED | — |
| F5.15 | Reconsideration maximum-delta calculation | M | NOT_STARTED | — |
| F5.16 | Execute reconsideration outcome | L | NOT_STARTED | — |
| F5.17 | Consolidate legacy appeal semantics | M | NOT_STARTED | — |

## F6 — Remittance, disbursement, payment queries

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F6.1 | Frozen remittance formula + field dictionary | S | GATED(finance sign-off) | — |
| F6.2 | Canonical ProviderRemittanceService | M | NOT_STARTED | — |
| F6.3 | Migrate admin settlement detail to service | S | NOT_STARTED | — |
| F6.4 | Provider settlement detail page | M | NOT_STARTED | — |
| F6.5 | CSV remittance export | M | NOT_STARTED | — |
| F6.6 | PDF/print remittance | M | NOT_STARTED | — |
| F6.7 | Disbursement schema/state machine | M | NOT_STARTED | — |
| F6.8 | Disbursement record/confirm service | M | NOT_STARTED | — |
| F6.9 | Settlement reconciliation job/dashboard | M | NOT_STARTED | — |
| F6.10 | Payment-query schema/service | M | NOT_STARTED | — |
| F6.11 | Provider/finance payment-query pages | M | NOT_STARTED | — |
| F6.12 | Payment-query → reconsideration handoff | S | NOT_STARTED | — |

## F7 — Contract visibility, master data, network self-service

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F7.1 | Provider-visible contract field policy | S | GATED(network/legal/security review) | — |
| F7.2 | Provider contract/rate read service | M | NOT_STARTED | — |
| F7.3 | Contracts/rates pages + safe export | M | NOT_STARTED | — |
| F7.4 | Master-data change-request schema/service | M | NOT_STARTED | — |
| F7.5 | Sensitive bank-change verification | M | NOT_STARTED | — |
| F7.6 | Profile/change pages + TPA queue | M | NOT_STARTED | — |
| F7.7 | Network improvement plan | S | NOT_STARTED | — |

## F8 — Provider performance scorecards

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F8.1 | Approve versioned metric catalog | M | GATED(multi-owner approval §8.13) | — |
| F8.2 | Extend scorecard schema + watermarks | M | NOT_STARTED | — |
| F8.3 | Deterministic scorecard refresh (per family) | M/fam | NOT_STARTED | — |
| F8.4 | Anonymized cohort benchmarks | M | NOT_STARTED | — |
| F8.5 | Provider performance dashboard | M | NOT_STARTED | — |
| F8.6 | TPA network performance workspace | M | NOT_STARTED | — |

## F9 — HMS integration control plane

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F9.1 | Inventory integration configs/secrets/paths | S | NOT_STARTED | — |
| F9.2 | Integration connection/delivery schema | M | NOT_STARTED | — |
| F9.3 | Connection + credential administration | M | NOT_STARTED | — |
| F9.4 | Durable inbound delivery receipt | M | NOT_STARTED | — |
| F9.5 | Route inbound HMS records canonically (per type) | M/type | NOT_STARTED | — |
| F9.6 | Retry, poison quarantine, sweeper | M | NOT_STARTED | — |
| F9.7 | One contracted outbound pull adapter | L | GATED(signed contract + sandbox) | — |
| F9.8 | Provider/admin integration ops views | M | NOT_STARTED | — |
| F9.9 | Cut over legacy HMS configuration/path | M | GATED(pilot sign-off) | — |

## F10 — Capitation/PMPM extension

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F10.1 | Approve arrangement/accounting spec | M | GATED(finance/legal/network/client/provider) | — |
| F10.2 | Capitation arrangement/period/adjustment schema | M | NOT_STARTED | — |
| F10.3 | Eligible-life snapshot | M | NOT_STARTED | — |
| F10.4 | Calculate/freeze capitation accrual | M | NOT_STARTED | — |
| F10.5 | Link encounters + protect carve-outs | M | NOT_STARTED | — |
| F10.6 | Capitation statement, approval, payment | L | NOT_STARTED | — |
| F10.7 | Capitation pilot: three reconciled periods | gate | GATED(pilot sign-off) | — |

## F11 — System hardening, UAT, rollout

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F11.1 | Cross-provider/branch/role security suite | M | NOT_STARTED | — |
| F11.2 | Concurrency/idempotency suite | M | NOT_STARTED | — |
| F11.3 | Money conservation suite | M | NOT_STARTED | — |
| F11.4 | Privacy/log/export scan | M | NOT_STARTED | — |
| F11.5 | Performance/load tests | M | NOT_STARTED | — |
| F11.6 | Accessibility + responsive UAT | M | NOT_STARTED | — |
| F11.7 | Operations + incident runbooks | M | NOT_STARTED | — |
| F11.8 | Actor-based end-to-end UAT | gate | GATED(human actors + sign-off) | — |
| F11.9 | Pilot-provider activation | gate | GATED(sign-offs + runbooks) | — |
| F11.10 | GA + legacy retirement (multiple pkgs) | multi | GATED(pilot + product sign-off) | — |
