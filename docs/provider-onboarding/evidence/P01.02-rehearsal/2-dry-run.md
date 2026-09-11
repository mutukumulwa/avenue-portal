# P01.02 — Family tariff remediation manifest (FH-P0102-20260911)

Manifest SHA-256: `78982cfa5be38e2d9216c1e3aedb07339eb525ab611897716014009becc8079a` — the value a reviewer approves and `--apply --manifest-hash` must quote.

Contract `cmtclkbiy00005kvqphfr7xiz` · currency **UGX** · tax-inclusive **INCLUSIVE** (rates are carried unchanged; tax-inclusive per the facility).

| Totals | |
|---|---|
| candidateRows | 4451 |
| groups | 30 |
| deactivate | 33 |
| create | 6 |
| activeAfter | 4424 |
| logicalServicesAfter | 4424 |
| unresolvedGroups | 0 |
| after: selectable | 4424 |
| after: shadowed | 0 |
| after: ambiguous | 0 |
| after: descriptionKeyCollisions | 0 |

Groups by disposition: DISTINCT_BY_SYMBOL 1 · EQUIVALENT_DUPLICATE 25 · TRUE_DUPLICATE 2 · DISTINCT_BY_UNIT 2

## 1. DISTINCT_BY_SYMBOL — "excision of dermatosis papulosa nigra 5 lesions"

Names differ only in "<"/">", which the engine discards: different services. Symbols written as words.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjm9qk00164yvqhj4o41qb` | Excision of Dermatosis papulosa nigra (>5 lesions) | 500000 | — | `sc_87569e209e78411934380b` | `779e7a832cbf733e…` | deactivate |
| `cmtcjm9qk00174yvq0yaju8yq` | Excision of Dermatosis papulosa nigra (<5 lesions) | 270000 | — | `sc_87569e209e78411934380b` | `2539016e219a0cc5…` | deactivate |

Replacements (same rate, currency, category, unit and effective dates as the row they supersede):

- `cmtcjm9qk00164yvqhj4o41qb` → **Excision of Dermatosis papulosa nigra (more than 5 lesions)** (fingerprint `f94d8c1b8bd0fe82…`)
- `cmtcjm9qk00174yvq0yaju8yq` → **Excision of Dermatosis papulosa nigra (less than 5 lesions)** (fingerprint `47182fd58416adea…`)

## 2. EQUIVALENT_DUPLICATE — "normal delivery semi private room"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjm9qk001z4yvqco2ahekd` | Normal delivery | Semi-private room | 800000 | — | `sc_87569e209e78411934380b` | `7d6075a7840f2595…` | keep |
| `cmtcjmi5g02j34yvqqfhhk311` | Normal delivery | Semi-private room | 800000 | — | `cmso8aiuf005us9vqvdlknv32` | `7d28b2965694d3b7…` | deactivate |

## 3. EQUIVALENT_DUPLICATE — "normal delivery private room"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjm9qk00204yvq2qneut9m` | Normal Delivery | Private room | 1200000 | — | `sc_87569e209e78411934380b` | `f636b450fc971f93…` | keep |
| `cmtcjmi5g02j44yvqk12mgdnp` | Normal Delivery | Private room | 1200000 | — | `cmso8aiuf005us9vqvdlknv32` | `117333233e1f49cd…` | deactivate |

## 4. TRUE_DUPLICATE — "surgical extraction"

Same service at different prices; facility rule (2026-08-29, reconfirmed 2026-09-10): use the lower price.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjm9qn007x4yvqsl4qhisv` | Surgical Extraction | 200000 | — | `sc_2ca3da677f22bdbf07d09e` | `bee326795bd358b4…` | deactivate |
| `cmtcjm9qn007y4yvqljhquvzg` | Surgical Extraction - | 150000 | — | `sc_2ca3da677f22bdbf07d09e` | `7fb1d4d0d0a9c868…` | keep |

## 5. DISTINCT_BY_UNIT — "azithromycin 500mg"

Different prices and different recorded units: different products. Names now carry the unit; the lower-price rule does not apply.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmd1900g14yvqvxl843ei` | Azithromycin 500Mg | 70000 | Vial | `cmso8al8w006bs9vqusyq1epz` | `faf7271d3a185133…` | deactivate |
| `cmtcjmd1a00i64yvqn3bfa16z` | Azithromycin 500Mg | 4807 | Tab | `cmso8al8w006bs9vqusyq1epz` | `b7af7aa0d68b504f…` | deactivate |

Replacements (same rate, currency, category, unit and effective dates as the row they supersede):

- `cmtcjmd1900g14yvqvxl843ei` → **Azithromycin 500Mg (Vial)** (fingerprint `7f2d344e1081ab8b…`)
- `cmtcjmd1a00i64yvqn3bfa16z` → **Azithromycin 500Mg (Tab)** (fingerprint `bfd686df7414b9bc…`)

## 6. DISTINCT_BY_UNIT — "rabeprazole 20mg rabeloc"

Different prices and different recorded units: different products. Names now carry the unit; the lower-price rule does not apply.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjme9s00yu4yvqvsq7brrb` | Rabeprazole 20Mg (Rabeloc) | 45540 | Vial | `cmso8al8w006bs9vqusyq1epz` | `bf001ea974413e4d…` | deactivate |
| `cmtcjme9t01164yvq6mdlfzht` | Rabeprazole 20Mg (Rabeloc) | 1540 | Tab | `cmso8al8w006bs9vqusyq1epz` | `5c93c69c2bc6dd0a…` | deactivate |

Replacements (same rate, currency, category, unit and effective dates as the row they supersede):

- `cmtcjme9s00yu4yvqvsq7brrb` → **Rabeprazole 20Mg (Rabeloc) (Vial)** (fingerprint `861a599e7f716126…`)
- `cmtcjme9t01164yvq6mdlfzht` → **Rabeprazole 20Mg (Rabeloc) (Tab)** (fingerprint `11176af1ad7b4938…`)

## 7. EQUIVALENT_DUPLICATE — "beclomethasone nasal spray"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjme9t012q4yvqn7tfqu46` | Beclomethasone Nasal Spray* | 27000 | Piece | `cmso8al8w006bs9vqusyq1epz` | `3b28318c91c07c41…` | keep |
| `cmtcjme9u014a4yvqebcpzr29` | Beclomethasone Nasal Spray*** | 27000 | Piece | `cmso8al8w006bs9vqusyq1epz` | `e3180d807b75993a…` | deactivate |

## 8. EQUIVALENT_DUPLICATE — "voluven 6"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023b4yvq4sxk2diw` | Voluven 6% | 94875 | Pkt | `cmso8al8w006bs9vqusyq1epz` | `ab4de5436fbd5ec3…` | keep |
| `cmtcjmj5c031u4yvqfurq9do1` | Voluven 6% | 94875 | Pkt | `cmso8ale0006cs9vqx3w83zb1` | `81a6877d8b6734c3…` | deactivate |

## 9. EQUIVALENT_DUPLICATE — "kabiven central infusion 1900kcal 2053ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023c4yvq6ge6u41b` | Kabiven Central Infusion 1900Kcal 2053Ml | 569250 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `f2ccd7c21bae149b…` | keep |
| `cmtcjmj5c031v4yvqckbu7ftw` | Kabiven Central Infusion 1900Kcal 2053Ml | 569250 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `2427695279c2d49f…` | deactivate |

## 10. EQUIVALENT_DUPLICATE — "haemaccel 3 5 colloidal infusion 500ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023d4yvq5rv395bs` | Haemaccel 3.5% Colloidal Infusion 500Ml | 88000 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `5412a7ec43a92c95…` | keep |
| `cmtcjmj5c031w4yvqybdyroqr` | Haemaccel 3.5% Colloidal Infusion 500Ml | 88000 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `50d66ff397a52fbd…` | deactivate |

## 11. EQUIVALENT_DUPLICATE — "kabiven central infusion smorf"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023e4yvqunujaw96` | Kabiven Central Infusion (Smorf) | 300000 | Pkt | `cmso8al8w006bs9vqusyq1epz` | `18a34e5bc1e4ab9a…` | keep |
| `cmtcjmj5c031x4yvqthib2ndf` | Kabiven Central Infusion (Smorf) | 300000 | Pkt | `cmso8ale0006cs9vqx3w83zb1` | `2891a4d5a2dc2d0b…` | deactivate |

## 12. EQUIVALENT_DUPLICATE — "kabiven peripheral infusion smorf"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023f4yvq10vnj9p9` | Kabiven Peripheral Infusion (Smorf) | 300000 | Pkt | `cmso8al8w006bs9vqusyq1epz` | `80f1269aa3d12c73…` | keep |
| `cmtcjmj5c031y4yvqgcki03g9` | Kabiven Peripheral Infusion (Smorf) | 300000 | Pkt | `cmso8ale0006cs9vqx3w83zb1` | `1d2fd0faa1977ce7…` | deactivate |

## 13. EQUIVALENT_DUPLICATE — "darrows half strength 500ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023g4yvqcjta6jp7` | Darrows Half Strength 500Ml | 6325 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `190d434d655e747b…` | keep |
| `cmtcjmj5c031z4yvqmo764tyk` | Darrows Half Strength 500Ml | 6325 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `f1ecb07c376d2d65…` | deactivate |

## 14. EQUIVALENT_DUPLICATE — "dextrose 50"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023h4yvq8mazmdpu` | Dextrose 50% | 8855 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `1943b97839475c7f…` | keep |
| `cmtcjmj5c03204yvqwy6i5mfl` | Dextrose 50% | 8855 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `bad41d1b9239905c…` | deactivate |

## 15. EQUIVALENT_DUPLICATE — "dextrose 5 500ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023i4yvqsvb5f8th` | Dextrose 5% 500Ml | 7590 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `c5ef384982a3852b…` | keep |
| `cmtcjmj5c03214yvq5ivwzwd0` | Dextrose 5% 500Ml | 7590 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `1e97dee289848c4e…` | deactivate |

## 16. EQUIVALENT_DUPLICATE — "frebin energy fibre junior"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023j4yvqb7fsxc8m` | Frebin Energy Fibre Junior | 82111 | Pkt | `cmso8al8w006bs9vqusyq1epz` | `6fe0d769fc5cac15…` | keep |
| `cmtcjmj5c03224yvqhrbkhs39` | Frebin Energy Fibre Junior | 82111 | Pkt | `cmso8ale0006cs9vqx3w83zb1` | `9f9fdb69dc0cb557…` | deactivate |

## 17. EQUIVALENT_DUPLICATE — "gelatin polyeline 3 5 500ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023k4yvqoaqrewqd` | Gelatin + Polyeline 3.5% 500Ml | 40833 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `c310e25a21f1ce64…` | keep |
| `cmtcjmj5c03234yvqagb055rx` | Gelatin + Polyeline 3.5% 500Ml | 40833 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `381893fbd20b9cc3…` | deactivate |

## 18. EQUIVALENT_DUPLICATE — "rheosorbilact 200ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023l4yvqa4x15uz3` | Rheosorbilact 200Ml | 35000 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `6660f6d4377b8314…` | keep |
| `cmtcjmj5c03244yvqj65ly2gv` | Rheosorbilact 200Ml | 35000 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `6bdb1f18d4e2ed05…` | deactivate |

## 19. EQUIVALENT_DUPLICATE — "sodium chloride 0 9 500ml normal saline apdl"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023m4yvq0qvx9bvn` | Sodium Chloride 0.9% 500Ml (Normal Saline) Apdl | 7590 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `e961861e0219b898…` | keep |
| `cmtcjmj5c03254yvqbwej6d97` | Sodium Chloride 0.9% 500Ml (Normal Saline) Apdl | 7590 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `e12f82ce4d97b7cf…` | deactivate |

## 20. EQUIVALENT_DUPLICATE — "decasan 500ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023n4yvqio8ca5jq` | Decasan 500Ml | 51000 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `8a62099f9ffcc650…` | keep |
| `cmtcjmj5c03264yvquib4csgw` | Decasan 500Ml | 51000 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `c191ef6c6bd8bdcb…` | deactivate |

## 21. EQUIVALENT_DUPLICATE — "sodium chloride 0 9 200ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023o4yvqjgt0op61` | Sodium Chloride 0.9% 200Ml | 9488 | Piece | `cmso8al8w006bs9vqusyq1epz` | `5ee2ade6fc225f79…` | keep |
| `cmtcjmj5c03274yvqo00o4n6a` | Sodium Chloride 0.9% 200Ml | 9488 | Piece | `cmso8ale0006cs9vqx3w83zb1` | `294e6229c9af3a90…` | deactivate |

## 22. EQUIVALENT_DUPLICATE — "rheosorbilact 400ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023p4yvqtweet2v3` | Rheosorbilact 400Ml | 27800 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `18ea70b7dccc099a…` | keep |
| `cmtcjmj5c03284yvq31rji3lo` | Rheosorbilact 400Ml | 27800 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `c6dd6751b3e63134…` | deactivate |

## 23. EQUIVALENT_DUPLICATE — "decasan 1l"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023q4yvqzsg1h5up` | Decasan 1L | 53000 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `b227ff4991182a30…` | keep |
| `cmtcjmj5c03294yvqn2iunone` | Decasan 1L | 53000 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `c66ccaa5e3bfa3d5…` | deactivate |

## 24. EQUIVALENT_DUPLICATE — "dextrose 10 250ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023r4yvqjasel2xf` | Dextrose 10% 250Ml | 7590 | Bottle | `cmso8al8w006bs9vqusyq1epz` | `93fb66d18d90e6c0…` | keep |
| `cmtcjmj5c032a4yvqcxuhs493` | Dextrose 10% 250Ml | 7590 | Bottle | `cmso8ale0006cs9vqx3w83zb1` | `1a465302b3a0678f…` | deactivate |

## 25. EQUIVALENT_DUPLICATE — "diben tube feeds 500ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023s4yvqjzsh5x29` | Diben Tube Feeds 500Ml | 60000 | Pkt | `cmso8al8w006bs9vqusyq1epz` | `8a4c34f8e692d4b2…` | keep |
| `cmtcjmj5c032b4yvq0t4wsxp0` | Diben Tube Feeds 500Ml | 60000 | Pkt | `cmso8ale0006cs9vqx3w83zb1` | `1fef28d8c3b67a71…` | deactivate |

## 26. EQUIVALENT_DUPLICATE — "ringers lactate hartman s soln 500ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023t4yvqgwif14hb` | Ringers Lactate (Hartman'S Soln.) 500Ml | 8855 | Ltr | `cmso8al8w006bs9vqusyq1epz` | `13958accb46da477…` | keep |
| `cmtcjmj5c032c4yvq9ug72ewr` | Ringers Lactate (Hartman'S Soln.) 500Ml | 8855 | Ltr | `cmso8ale0006cs9vqx3w83zb1` | `76968ed6e8347b94…` | deactivate |

## 27. EQUIVALENT_DUPLICATE — "iv giving set"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023u4yvqkaw30du8` | Iv Giving Set | 3416 | Piece | `cmso8al8w006bs9vqusyq1epz` | `ad16bac6eed81038…` | keep |
| `cmtcjmj5c032f4yvqaqsxg7bi` | Iv Giving Set | 3416 | Piece | `cmso8ale0006cs9vqx3w83zb1` | `a628f1309ad9dad4…` | deactivate |

## 28. EQUIVALENT_DUPLICATE — "iv giving set burette"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023v4yvqb1nx1owz` | Iv Giving Set Burette | 7337 | Piece | `cmso8al8w006bs9vqusyq1epz` | `0201f72d9777fc18…` | keep |
| `cmtcjmj5c032g4yvq0w447hne` | Iv Giving Set Burette | 7337 | Piece | `cmso8ale0006cs9vqx3w83zb1` | `c32f1ee2833b1dde…` | deactivate |

## 29. EQUIVALENT_DUPLICATE — "sodium chloride 0 9 100ml"

Same pricing terms; keep the row the engine already selects so adjudication is unchanged.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmh67023w4yvq4snrtdda` | Sodium Chloride 0.9% 100Ml | 9488 | Piece | `cmso8al8w006bs9vqusyq1epz` | `4aae89b4f6cb27d6…` | keep |
| `cmtcjmj5c032l4yvqu7h31grl` | Sodium Chloride 0.9% 100Ml | 9488 | Piece | `cmso8ale0006cs9vqx3w83zb1` | `a2b6181ba34d33ba…` | deactivate |

## 30. TRUE_DUPLICATE — "neogen locking head screw 3 5mm 14mm"

Same service at different prices; facility rule (2026-08-29, reconfirmed 2026-09-10): use the lower price.

| Row | Service name (as loaded) | Rate (UGX) | Unit | Category id | Source fingerprint | Action |
|---|---|---|---|---|---|---|
| `cmtcjmi5h02ov4yvqpy25yvv6` | Neogen Locking Head Screw 3.5Mm(14Mm) | 143000 | Piece | `cmso8ale0006cs9vqx3w83zb1` | `64624c5eba325e5e…` | deactivate |
| `cmtcjmj5902ru4yvqqiuppqhv` | Neogen Locking Head Screw 3.5Mm (14Mm) | 132000 | Piece | `cmso8ale0006cs9vqx3w83zb1` | `81fe7ea8779762b9…` | keep |

