# NWSC Synthetic Member Fixture

This folder contains fictional member data shaped for Uganda UAT and demo workflows.

## Files

- `nwsc_synthetic_members.csv` - 2,750 synthetic rows with primary members and dependants.
- `scripts/generate-nwsc-synthetic-members.mjs` - deterministic generator used to recreate the CSV.

## Caveat

The names, dates of birth, addresses, roles, and household relationships are synthetic. The regional spread is modeled from National Water and Sewerage Corporation's public service footprint, but the file is not an NWSC staff register and must not be treated as real personal data.

Regenerate with:

```bash
node members/scripts/generate-nwsc-synthetic-members.mjs
```
