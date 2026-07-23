# Claims Autopilot UAT — run 2026-07-23_local_01 (engineering pre-UAT)

Environment: local production build (`next build` PASS → `next start`
@127.0.0.1:3000) on branch `feat/claims-autopilot`, throwaway seeded
Postgres 16.14 (:55432) + Redis (:56379). No production/staging system touched.

## Executed in this run

| Step | Result | Evidence |
|---|---|---|
| Full integration battery ×3 (`tests/integration/ --no-file-parallelism`) | **100 passed / 9 skipped**, three consecutive passes | `docs/claims-autopilot/VERIFICATION.md` M7 boundary |
| F7.2 seeded-broken-invariant probe (isolated `probe_t2`) | **exit 1**, exact refs, all 11 seedable families (8 CRITICAL + 3 WARNING); duplicate-fingerprint family constraint-refused | `docs/claims-autopilot/IMPLEMENTATION_LOG.md` F7.2 |
| F7.2 clean full-DB gate after battery | **exit 0 — all invariants hold** | ibid. |
| Gate catches real defect | 5 stranded orphans from the F7.4 suite's own cleanup (FK-swallowed delete) — root-caused, fixed, purged, re-proven green | `docs/claims-autopilot/CONCURRENCY_CAMPAIGN.md` |
| Production build | `next build` PASS with all M7 changes | build log (session) |
| F7.5 k6 mixed load, ramp 10→50→100 VUs, 6m | 2,689 iterations, 100% expected-class, **0×5xx**, 215 replays w/ zero duplicates; p50 4.9s/p95 12.6s inline-processing local baseline — **SLO hypothesis NOT met locally; staging measurement required** | `evidence/F75_load_baseline.txt` |
| Post-load integrity gate | **exit 0** over the whole burst | ibid. |
| Story 3 (B2B accepted/replay/conflict/lookup/404/413/401) | PASS end-to-end in prod mode | `evidence/B2B_API_story.txt` |
| B2B entitlement negative probe | un-entitled member ⇒ `FORBIDDEN_SCOPE`, no claim (observed live before the load contract was created) | session record |

## NOT executed here (requires the human cross-role campaign)

Authenticated UI stories (admin/provider portal claims, queues, automation
timeline, ops console + breaker, CSV import UI, offline device day, policy
maker/checker through the approval surface, notifications review, finance
tie-out) and ALL role sign-offs. The plan's sign-off table remains open in
`../..//UAT_PLAN.md`; automated evidence for every story is green per the
battery. Agent policy: no credentials are typed into login forms — the human
actors run the UI campaign.

## Environment handover (updated 2026-07-23: worker live)

**Worker (staffed-window posture):** running locally against PROD via the
Supabase session pooler — prod `/api/health` shows `workerFresh: true`. Restart:
`redis-server --port 56380 --save "" --appendonly no --daemonize yes` then
`set -a; source .env.worker.local; set +a; npm run worker` (see
`docs/WORKER_DEPLOYMENT.md` §F8.2 interim posture). Campaign Stories 11/12 need
it up; everything else survives it being off.

## Environment handover (original)

The stack is left RUNNING for the human campaign: PG `:55432`
(`autopilot_uat`), Redis `:56379`, app `:3000` (restart:
`source <scratchpad>/db.env && npm run start`). Seed logins per
project memory (`admin@medvex.co.ug` et al.). The DB now contains the
~2,500-claim load burst — a realistic queue volume for the UAT; reseed only if
a pristine dataset is preferred.
