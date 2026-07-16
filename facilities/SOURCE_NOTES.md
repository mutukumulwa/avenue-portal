# Source Notes

## Data Intent

This dataset is a UAT fixture pack, not a live regulatory provider registry. It is designed to stress the application's provider surfaces with realistic Uganda-style records across geography, ownership, facility levels, service types, insurance panels, geocodes, operating hours, and settlement/contact fields.

## Seeded Rows

The first 77 rows are seeded from the user-supplied facility research CSV and informed by the supplied deep research report. These rows include well-known Uganda facilities and insurance-panel examples such as:

- Mulago National Referral Hospital
- Uganda Heart Institute
- Uganda Cancer Institute
- Nakasero Hospital
- International Hospital Kampala
- Case Hospital
- UMC Victoria Hospital
- Norvik Hospital
- AAR Health Care branches
- Ecopharm and Goodlife pharmacy examples
- Kampala Capital Imaging Centre
- Kampala MRI Center
- dental, optical, rehabilitation, audiology, and chronic-care specialty examples

These rows are marked with:

```text
sourceClass = report_seed
insuranceEvidence = Seed report provider-panel or tie-up evidence
```

## Synthetic Rows

The remaining rows are generated fixtures and are marked with:

```text
sourceClass = synthetic_fixture
insuranceEvidence = Generated test panel membership
```

Synthetic rows use deterministic names, districts, coordinates, insurers, services, phone numbers, emails, licence placeholders, provider codes, and contract attributes. They should be used for testing system behavior, not for external reporting or compliance evidence.

## Geographic Spread

Rows are distributed across Uganda's major regions:

- Central
- Eastern
- Northern
- Western

District coordinates are approximate centre points with deterministic jitter, so maps and radius-search logic can be exercised without pretending the coordinates are verified facility locations.

## Insurance Field Caveat

All rows set `acceptsInsurance = true` because the requested test purpose is insurance-accepting facility coverage. For product work, a future production-grade dataset should retain three states:

- `YES`
- `NO`
- `UNSPECIFIED`

That distinction matters because real Uganda insurance acceptance is insurer-specific, plan-specific, branch-specific, and changes over time.

## App Mapping Caveat

The app's `ProviderType` enum does not currently include imaging centres, specialty hospitals, dialysis centres, or counselling centres as standalone enum values. Those distinctions are preserved in `facilityCategory`, `levelOfCare`, `medicalChainRole`, and `servicesOffered`.
