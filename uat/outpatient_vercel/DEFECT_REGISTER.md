# Defect Register — Outpatient Front-End UAT (Vercel)

Severity guide (from runbook): **Critical** = cross-scope data exposure, ineligible member claims, rejected line paid, settlement/GL breaks, core workflow crash, duplicate claim/payment. **High** = claim can't be submitted/adjudicated/settled via FE, provider can't access own claims, balances/utilisation update wrong, rejection reason missing. **Medium** = report/export mismatch, unclear validation, missing notification, recoverable awkward flow. **Low** = copy/layout/minor.

| ID | Sev | Persona | Route | Summary | Observed vs Expected | Evidence | Re-test |
|----|-----|---------|-------|---------|----------------------|----------|---------|
| _(none yet)_ | | | | | | | |

## Candidate defects (to verify through the UI before confirming)
| ID | Sev(prov) | Route | Summary | Status |
|----|-----|-------|---------|--------|
| PR-V01 | Medium | /providers | Provider search returns "No providers matching 'Nakasero'"/"'International'" although Nakasero Hospital and International Hospital Kampala (IHK) exist as facility records (present in Invite-User facility dropdown). Search appears not to match existing providers. | OPEN — reproduce & confirm scope |
| **PR-V02** | **Critical** | /settlement | **Provider settlement "Mark Paid" (final settle step) fails deterministically** with a raw Prisma error surfaced to the UI: *"Invalid `prisma.claim.update()` invocation: Transaction API error: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5271 ms passed…"*. Batch = Aga Khan Jul 2026, 46 claims / KES 3,288,480. Batch is stranded at **CHECKER APPROVED**; SETTLED stays 0; money-out cannot complete end-to-end through the front end. Reproduced twice. Root cause: settle updates each claim in one interactive transaction that exceeds the 5s Prisma limit → does not scale to normal monthly batch sizes. **Also leaks internal DB error text to end user.** | OPEN — blocks Scenario A A5.5/A6 settlement & spine-Q1 |

## Observations (non-defect)
| ID | Note |
|----|------|
| OBS-1 | After creating a user via the Invite User modal, the Users & Access content pane goes blank until a manual page reload (data present on reload). Low/UX. |
| OBS-2 | Member annual limit shows currency **KES** (e.g. 30,000,000 KES) for the Ugandan NWSC scheme, while provider CPT tariffs are in **UGX**. Currency labelling inconsistency — watch adjudication math for FX handling. |
| OBS-3 | Inline "Update Access" role dropdown on /settings omits PROVIDER USER, so an existing user cannot be converted to provider inline (only via Invite modal, which binds a facility). Likely intentional. |
| OBS-4 | Contract-engine (digital contract) preview panel shows "no contract matched / NO CONTRACT" and payable 0.00 for all lines, contradicting the Adjudicate panel which computed a correct payable ceiling of 16,500 from the same contract PC-2026-128. Misleading preview; adjudicator could wrongly conclude nothing is payable. |
| OBS-5 | Fraud "Contracted Rate Analysis" compares **total claim billed (16,500)** against a **single line's contracted rate (3,500)** → 371.4% variance FRAUD FLAG. Comparison basis looks apples-to-oranges (whole-claim vs one CPT rate); may over-flag legitimate multi-line claims. |
| OBS-6 (RBAC+) | Forbidden route `/settings/exceptions` as CLAIMS OFFICER → branded **"Access Denied"** page at /unauthorized (correct, secure). Minor: the CLINICAL nav still shows an "Exceptions" link that leads to this denial for this role. |
| OBS-7 (control) | A single CLAIMS OFFICER approved a fraud-flagged claim (371% variance, "1 open fraud alert") to the **full billed amount** with **no second-level approval and no fraud-alert clearance** required (approval within payable ceiling ⇒ no override). Prior local build routed APPROVED decisions through a 2-level approval matrix — needs a decision on whether that matrix should apply here. Spine-Q2 relevant; verify in A5/settlement whether a later approval gate catches it. |
