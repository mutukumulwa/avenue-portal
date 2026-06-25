# Data integrity testing — STATUS: BLOCKED (no DB, no login)

Plan §8 requires creating/reading/editing records and reconciling calculated fields, totals, and exports against underlying data. **None of this was possible:** no application runtime, no database access, no authenticated session.

Untested and carried forward:
- CRUD + persistence across refresh and logout/login for member, group, package, claim, provider, broker, invoice.
- Valid/invalid status transitions (member, claim, preauth, endorsement, quotation, settlement batch, fund deposit, commission) with audit rows.
- Required-field enforcement and boundary validation on every create form.
- Duplicate prevention (group name, national ID, provider code, broker, claim, double-submit — DEFECT-003/007).
- **Calculated-field reconciliation** (premium from rate card; pro-rata; co-contribution/member share; commission + WHT + levies; Stamp Duty/Training Levy/PHCF; admin fee; **GL balance**; MLR) — independent manual recompute vs system.
- Totals = sum of rows; dashboard = detail (note fund mismatch DEFECT-015).
- Exported CSV/PDF = on-screen data.
- Partial/abandoned workflows leave no orphaned/half-committed records (directly relevant to the crash-after-partial-success defects DEFECT-009/010/016).

These are all high-value for a financial/health system and should be prioritised once an environment is available.
