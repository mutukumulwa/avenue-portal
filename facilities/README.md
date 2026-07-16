# Uganda Facility Test Data

This folder contains a broad Uganda provider/facility fixture set for UAT and seed/import work.

## Files

- `uganda_facilities_master.csv` - 2,750-row rich master table for analysis, QA planning, map tests, panel coverage tests, and manual review.
- `uganda_facilities_provider_import.csv` - 2,750-row import-friendly subset aligned to the app's `Provider` model and provider creation form.
- `uganda_facilities_master.json` - JSON version of the master table with array/object fields preserved.
- `summary.json` - row counts by provider type, region, ownership, and source class.
- `scripts/generate-uganda-facilities.mjs` - deterministic generator used to recreate the files.
- `SOURCE_NOTES.md` - provenance notes and test-data caveats.

## What Is Covered

The data includes hospitals, national/referral hospitals, general and district hospitals, clinics, HC III/HC IV-style outpatient facilities, pharmacies, diagnostic laboratories, imaging centres, dental clinics, optical centres, rehabilitation centres, and counselling centres.

The app currently supports these provider enum values:

- `HOSPITAL`
- `CLINIC`
- `PHARMACY`
- `LABORATORY`
- `DENTAL`
- `OPTICAL`
- `REHABILITATION`

Because there is no separate app enum for imaging centres, imaging facilities use `providerType = LABORATORY` and `facilityCategory = Imaging Center`.

## Import Notes

Use `uganda_facilities_provider_import.csv` when building an importer or seed. The `servicesOffered` column uses pipe-delimited values, for example:

```text
Outpatient|Inpatient|Emergency|Laboratory|Pharmacy
```

The `operatingHours` column is JSON text. The current provider form stores this as JSON, while many existing CSV importers may need to parse it before writing to Prisma.

Rows are `ACTIVE` and insurance-accepting by design so that claims, preauth, member map, settlement, and offline-provider workflows have enough operational providers to test against.

## Provenance

The first 77 rows are report-derived seeds from the user-provided files:

- `/Users/arthurmulwa/Downloads/deep-research-report.md`
- `/Users/arthurmulwa/Downloads/you took too long. what did you get_ - you took too long. what did you get_.csv`

The remaining 2,673 rows are deterministic synthetic fixtures. They are shaped around Uganda geography and facility mix, but they are not an official Ministry of Health registry export.

Regenerate the data with:

```bash
node facilities/scripts/generate-uganda-facilities.mjs
```
