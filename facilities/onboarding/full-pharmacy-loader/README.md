# Full pharmacy-master loader

Swaps the ~110-item essential formulary on every **PHARMACY** facility for the
**full 9,807-product master** (reference UGX prices). Run it on your own machine —
the Supabase pooler is reachable from there but firewalled from the assistant's sandbox.

## Run

From the repo root (so `node_modules/pg` resolves):

```bash
DATABASE_URL='postgresql://postgres.otivyuroqraiijayvkze:<password>@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' \
  node facilities/onboarding/full-pharmacy-loader/load.mjs
```

Preview first without changing anything:

```bash
DATABASE_URL='…' DRY_RUN=1 node facilities/onboarding/full-pharmacy-loader/load.mjs
```

Drugs only (exclude surgical consumables / implants / sutures — a cleaner formulary):

```bash
DATABASE_URL='…' DRUGS_ONLY=1 node facilities/onboarding/full-pharmacy-loader/load.mjs
```

## What it does
- Targets each `Provider.type = 'PHARMACY'` with an ACTIVE contract (the 26 pharmacies).
- Deactivates their current tariff lines (never deletes — matches the app convention).
- Inserts the full formulary as `ProviderTariff` rows (UGX, FIXED, PER_ITEM), structurally identical to UI-created lines, so they render/renew/edit in the UI exactly the same.
- Idempotent — safe to re-run (it deactivates then reloads).

## Notes
- ~9,807 × 26 ≈ **255k rows**; takes a couple of minutes on a direct connection.
- Hospitals/clinics keep the ~110 essential inpatient formulary (a hospital contract with 9,807 drug lines on top of everything else is unwieldy). To include them too, change the `where p.type='PHARMACY'` filter in `load.mjs`.
- **Rotate the DB password afterward** (Supabase → Settings → Database → Reset password) since it was shared in chat.
