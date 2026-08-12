# Retest plan — `<NEW-RUN-ID>`

> Copy to the **new** run's directory. Never edit a closed run: a retest is a new
> run ID and a new directory, and the prior run's evidence stays immutable.

| Field | Value |
|---|---|
| New run ID | `<UAT-XX-YYYYMMDD-NN>` |
| Retests | `<prior run ID>` |
| Build under test | `<git SHA>` — pinned, unchanged for the whole run |
| Manifest | `./run-manifest.json`, **must pass** `npx tsx scripts/uat/run-preflight.ts ./run-manifest.json` before step 1 |
| Timezone | `Africa/Nairobi` — take every timestamp from `date`, never from an assumption |

## 1. Preflight gate

The run does not start until this exits 0. It refuses placeholder owners, missing
oracles, unprovisioned actors, absent fixtures, and any scenario that needs a
harness capability the harness does not have.

```bash
npx tsx scripts/uat/run-preflight.ts ./run-manifest.json
```

Record the passing output as the run's first evidence item.

## 2. Copy the signed oracle, never the prior outcomes

Carry forward the **expected** values from the signed controlled-source pack. Do
**not** carry forward the prior run's actual results — a retest that starts from
last time's answers cannot detect a regression.

## 3. Blocked steps to re-execute

A blocked step is unverified scope, not a pass. Every one must reach a terminal
result this run.

| Prior step | Blocked by | Cleared by | Re-executed? | Result |
|---|---|---|---|---|
| `<X-000 sN>` | `<DEF-000 / harness capability / ordering>` | `<remediation task ID>` | | |

Group them by blocker so an unfixed blocker is visible as a cluster rather than as
scattered failures.

## 4. Fixed defects to re-verify

One row per defect claimed fixed. "Fixed" means the original reproduction no longer
reproduces **and** the adjacent case passes.

| Defect | Severity | Fix commit | Original reproduction | Adjacent/race case | Result |
|---|---|---|---|---|---|
| `<DEF-000>` | `<S1..S4>` | `<sha>` | | | |

## 5. Regression scope

Re-run the surfaces the fixes touched, not only the defect itself. A remediation
that repairs one screen and breaks its neighbour is a failed remediation.

## 6. Adjacent scenarios

Findings discovered outside the scripted set still need coverage:

- concurrent identity/number allocation
- partial import kill and recovery
- unsupported offline sync type
- owner deletion against database invariants
- projection/worker outage
- rule precedence overlap
- migration upgrade on a production-shaped snapshot

## 7. GO criteria

Every line must be true. Any false line is a NO-GO.

- [ ] All steps terminal — zero Blocked, zero Not Run
- [ ] Zero open S1 and S2
- [ ] Every S3/S4 either fixed and passed, or explicitly accepted by the named
      business / security / accessibility owner **with an expiry date**
- [ ] Reconciliation all Match
- [ ] Operation receipts prove one intent produced at most one business effect
- [ ] Migration and rollback rehearsed
- [ ] Support and operations signed off on dashboards and runbooks
- [ ] Every evidence item present and hash-verified
- [ ] Sign-off carries genuine named owners — **no placeholders** (DEF-001)

## 8. Sign-off

Leave unsigned if an owner is absent. Do not invent a signature; let the gate fail.

| Role | Name | Date | Verdict |
|---|---|---|---|
| Business | | | |
| Security | | | |
| Operations | | | |
| Accessibility | | | |
| Privacy | | | |
