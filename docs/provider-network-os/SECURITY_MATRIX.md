# F11.1 — Provider Network OS security-boundary matrix

**Scope:** every server-derived authorization boundary across the engagement, the enforcement point, and the covering test. Build-gating: a regression fails CI (the per-package scope suites + the F11.1 cross-boundary suite must pass).

**Access dimensions** (every mutating/reading surface is checked against): tenant · provider · branch · role/permission · API scope · resource ownership (non-enumerating not-found). Fixtures: `buildProviderWorld` (tenants **alpha/beta**, providers **A/B in alpha, C in beta**, branches a1/a2/b1/c1) — F0.6.

---

## F9 — HMS integration control plane

| Surface | Enforcement | Covering test |
|---|---|---|
| `ProviderIntegrationConnectionAdmin.*` (create/config/test/rotate/activate/pause/disable) | `provider.integrations.manage` + provider = ctx.providerId + branch-held + `loadOwned` (tenant + provider) → safe NOT_FOUND | `provider-integration-admin.service.test.ts` + **F11.1** (A↛B) |
| `IntegrationSecretStore` | secret material never returned; bcrypt reveal-once | admin test (no-secret-in-view/audit) |
| `InboundDeliveryService.receive` | ACTIVE connection + bearer-secret verify + scope + replay-window; provider/branch server-derived from the connection | `provider-integration-delivery.service.test.ts` |
| `CaseServiceDeliveryProcessor` | case matched at the DELIVERY's provider (+branch) only | `provider-integration-processor.service.test.ts` (cross-provider case never touched) |
| `DeliveryRetryService.manualRetry` | `provider.integrations.manage` + provider-scoped ownership → NOT_FOUND | `provider-integration-retry.service.test.ts` (foreign-provider) |
| `CaseServicePullAdapter` / `safeFetchText` | SSRF: HTTPS + allowlist + runtime DNS-rebind reject | `http-safe.test.ts` + `provider-integration-pull.service.test.ts` |
| `ProviderIntegrationOpsRead.*` | `provider.integrations.manage` + provider + branch scope + bounded pagination + safe projection (no payload/secret/hash/header) | `provider-integration-ops-read.service.test.ts` + **F11.1** (A↛B) |

## F10 — Capitation ledger

| Surface | Enforcement | Covering test |
|---|---|---|
| `CapitationArrangementService.*` / `EligibleLifeSnapshotService` / `CapitationAccrualService` / `CapitationStatementService` | finance role (SUPER_ADMIN/FINANCE_OFFICER) + tenant scope (`tenantId: actor.tenantId`) → NOT_FOUND across tenants; maker≠checker on freeze/approve | `capitation-*.service.test.ts` + **F11.1** (alpha↛beta, role denial) |
| `CapitationEncounterLinkService.assertFfsSettlementAllowed` | an INCLUDED zero-pay line hard-denied from FFS settlement (D24) | `capitation-encounter-link.service.test.ts` + **F11.3** |

## F1–F8 (provider access, documents, PA, requests, claim lifecycle, remittance, contracts, performance)

Covered by each phase's per-package scope suites — the F0.2 access-characterization suite, `tests/api/provider-access-characterization.test.ts`, and the per-service tests listed in `PROGRESS.md` (F1.3 ProviderAccessService, F3.7/F3.10 non-enumerating PA reads with client-confinement, F6 remittance provider-scope, F8.2/F8.5 performance provider-scope + anonymized benchmark). Gate A (server-derived provider/permission/branch scope) is the umbrella; the F11.1 suite adds the cross-cutting F9/F10 matrix — especially the cross-**tenant** dimension.

---

## Known gaps → owning package (F11.1 step: assign, do not skip)
- **Live route/API HTTP-layer matrix** (guessed IDs / altered forms / direct URLs at the `/api/v1/*` + provider-page layer) is exercised at the service layer here; a full HTTP-request-level matrix belongs with **F11.8 actor UAT** against a seeded deployment (the worktree cannot browser/HTTP-verify).
- **Export/signed-URL enumeration** (F2.9 public-bucket retirement) remains **Gate B OPEN** — owned by F2.9 + F11.10 legacy retirement.
- **F9.7 pull activation / F9.9 flip / F10 activation** are gated; their live-path authorization lands with the pilot (F11.9).
