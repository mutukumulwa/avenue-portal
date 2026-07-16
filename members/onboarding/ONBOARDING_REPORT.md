# NWSC Member Onboarding — Report

**Date:** 2026-07-06
**Operator tenant:** Medvex (`cmr3ae8v30000nlvqxrqlfn38`)
**Target:** live Medvex portal (`https://avenue-portal.vercel.app`) + its Supabase DB (`otivyuroqraiijayvkze`)
**Outcome:** ✅ NWSC onboarded as the **first Medvex client**; **2,750/2,750** synthetic members loaded, tiered, and rendering in the live UI.

---

## 1. Client researched & created

**National Water & Sewerage Corporation (NWSC)** — Uganda's statutory water & sewerage
utility, wholly government-owned. Established by **Decree No. 34 of 1972**, reorganised under
the **NWSC Statute (1995)** to operate commercially. HQ: **Plot 3 Nakasero Road, Kampala**
(P.O. Box 7053). MD/CEO: **Dr. Eng. Silver Mugisha** (since 2013). ~2,860 staff (2016);
serves 250+ towns. Contact: `info@nwsc.co.ug`, toll-free 0800 200 977 / 0800 300 977.

Because NWSC self-funds a staff medical pool that Medvex administers, the client was created
as **`EMPLOYER_SELF_FUNDED`** (not a risk-bearing insurer).

| Entity | ID | Notes |
|---|---|---|
| Client | `cmr94t90k000004jssvqx1ppp` | type `EMPLOYER_SELF_FUNDED`, slug `nwsc`, currency **UGX**, member-number prefix **`NWSC`** |
| Scheme (Group) | `cmr94u1ks000804l56wkowsve` | "NWSC Staff Medical Scheme", `SELF_FUNDED`, effective 2026-07-01 → renewal 2027-07-01, self-funded account min balance UGX 300M, admin fee UGX 36,000/insured (FLAT_PER_INSURED) |

## 2. Benefit packages & tiers

Four UGX packages were created and wired to four `GroupBenefitTier`s (default = Staff):

| Tier | Package | Annual limit (UGX) | Contribution (UGX) | Seniority levels mapped |
|---|---|---:|---:|---|
| Staff (Bronze) | NWSC Staff Care | 13,000,000 | 850,000 | Field/Operations, Support/Admin |
| Officer (Silver) | NWSC Officer Care | 30,000,000 | 1,300,000 | Professional/Officer, Supervisor/Specialist |
| Management (Gold) | NWSC Management Care | 60,000,000 | 2,200,000 | Area/Branch Manager, Regional/General Manager |
| Executive (Platinum) | NWSC Executive Care | 120,000,000 | 3,800,000 | Senior Director/Director, Executive Leadership |

Dependants inherit their principal's tier (household-consistent — verified 0 mismatches).

## 3. Member load — method

- **Sample of 5 members onboarded manually through the live `/members/new` UI** first
  (3 principals across Staff/Officer/Executive + a spouse + a child) to lock down the exact
  row shape the app writes. These became `NWSC-2026-00250 … 00254` and were then patched to
  their correct tiers/packages and (for the family) principal links.
- **Remaining 2,745 loaded via DB** (`INSERT … SELECT` over the Supabase MCP — direct
  Postgres is firewalled), two-pass: **1,538 principals first**, then **1,207 dependants**
  linked to principals by synthetic National ID. All rows: `status=ACTIVE`,
  cover 2026-07-01 → 2027-06-30, `benefitTierId` + tier package/version set, phones/emails
  derived for principals only. Inserts are idempotent (`ON CONFLICT DO NOTHING`).

## 4. Tier & relationship distribution (final, live DB)

| Tier | Members | Principals |
|---|---:|---:|
| Staff | 1,110 | 616 |
| Officer | 1,177 | 669 |
| Management | 347 | 189 |
| Executive | 116 | 67 |
| **Total** | **2,750** | **1,541** |

Relationships: 1,541 PRINCIPAL · 255 SPOUSE · 789 CHILD · **165 PARENT** (the 66 CSV
"Sibling" dependants were mapped to PARENT — see caveats). Member numbers `NWSC-2026-00250 … 02999`.

## 5. Verification (all ✅)

- Row count = **2,750**; distinct member numbers = 2,750; distinct National IDs = 2,750.
- Dependants with missing/broken principal FK = **0**.
- Members with no benefit tier = **0**; dependant-vs-principal tier mismatches = **0**.
- **NIN set checksum matches the source CSV exactly** (`0262add04245f981569252ffb2849cb8`) —
  zero transcription error across all 12 insert batches.
- Live UI renders the client, the scheme with all 4 tiers, and members are searchable in the
  Member Registry (screenshot: `scratchpad/nwsc_group.png`).

## 6. Caveats & modelling decisions

- **Synthetic data.** Names, DOBs, addresses, IDs are fictional (see `../README.md`). National
  IDs are placeholders of the form `C{M/F}{YY}SYN{index}` — **not** valid Ugandan NINs.
- **`MemberRelationship` enum has no SIBLING** → the 66 sibling dependants were recorded as
  **PARENT** (closest "other adult dependant"). Their true relationship is preserved in the
  crosswalk's `relationship` column.
- **Contribution/limit amounts are indicative** UGX tier pricing for demo/UAT, not an
  NWSC-agreed schedule.
- Principals got a derived `+2567…` phone and `@nwsc-scheme.example` email (uniqueness-safe);
  dependants have neither.
- Biodata that has no column on `Member` (job title, organisation unit, physical address,
  region/district/NWSC area, seniority) is **not lost** — it lives in the crosswalk.

## 7. Artifacts

- `member-crosswalk.csv` — 2,750 rows: `member_number → db_id` plus source id, household,
  tier, relationship, and all extra biodata (join key `db_id`, deterministic `nw+md5(nin)`).
- `../nwsc_synthetic_members.csv` — source fixture (2,750 rows).
- Generator + batches: session scratchpad `gen_bulk2.py`, `sqlout2/{prim,dep}_*.sql`,
  `onboard_nwsc.mjs`, `phase2_tiers.mjs`, `phase3_members.mjs`, `verify_ui.mjs`.
