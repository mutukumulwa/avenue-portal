# Outpatient load harness (Outstanding-Conditions Ticket 8 / Workstream D3)

Repeatable performance/load tooling for the outpatient workflows, so the
46-claim settlement timeout class (PR-V02) and any future O(n) regression are
caught before production instead of during a month-end run.

## Layers

| Layer | Tool | What it proves |
|---|---|---|
| Service regression | `vitest` (`tests/services/settlement-stress.test.ts`) | `markSettlementBatchPaid` uses O(1) set-based writes for batch sizes 1 → 250. Runs in CI, no infra. |
| HTTP sustained load | `k6` (`loadtest/outpatient.k6.js`) | The API tier holds up under sustained concurrency across the core outpatient journey. |
| Browser smoke concurrency | Playwright (optional) | A handful of real browser sessions complete the journey without UI errors. |

The service regression is the everyday guard. The k6 profile is run on demand
against a **staging / UAT** environment before a readiness sign-off.

## Safety

- **Never run load against production without an approved window.** These
  scripts create claims and settlements — point them at a dedicated UAT tenant.
- Generated claims are tagged (`externalRef` prefix `LOADTEST-`) so they can be
  identified and excluded from finance reporting.
- Use test provider/member accounts, not live ones.

## Running the k6 profile

Install k6 (`brew install k6`), then:

```bash
BASE_URL=https://<uat-host> \
LOGIN_EMAIL=<uat-claims-officer> \
LOGIN_PASSWORD=<password> \
k6 run loadtest/outpatient.k6.js
```

Tune load with env vars: `VUS` (virtual users, default 10), `DURATION`
(default `1m`), `RAMP` (ramp-up, default `20s`).

## Workflow profiles scripted (plan §D3)

1. Login
2. Provider eligibility search
3. Provider claim intake
4. Claims officer queue / search / open
5. Claim compute + decision
6. Settlement create / approve / mark paid
7. Provider portal statement view
8. Member portal dashboard / utilisation
9. Reports export

Endpoints are centralised at the top of `outpatient.k6.js` — adjust paths to
match the deployed routes for the environment under test. Unconfigured steps are
skipped with a console warning rather than failing the run, so the harness can
be brought up incrementally.

## Acceptance (plan §D6)

- Automated settlement stress test passes (CI).
- Normal + peak profiles complete without duplicate financial records
  (one voucher / one JE per batch — asserted by the service regression).
- No raw database/internal errors surface to users (`http_req_failed` < 1%).
- No stranded `CHECKER_APPROVED` settlement batches after a load run.
