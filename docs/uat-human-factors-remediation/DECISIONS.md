# UAT-HF-20260811-01: signed decisions

Companion to `IMPLEMENTATION_PLAN.md` §3. Every `DEC-*` gate in the plan is answered here.
No implementer may infer business policy that is not written below.

| Field | Value |
|---|---|
| Decided by | Arthur Mulwa (repository owner) |
| Decided on | 2026-08-12 |
| Method | All 12 decisions accepted at the plan's recommended default, in a single sitting, without amendment |
| Branch | `codex/uat-hf-remediation` (from `ff26e3b`) |

If any decision below turns out to be wrong once implementation exposes a consequence the plan
did not anticipate, **stop and amend this file** — do not silently diverge in code. Amendments go
in §3 below with a new date, and the superseded text stays visible.

---

## 1. The twelve decisions

### DEC-01 — Operational timezone and locale
**Blocks:** P01.05 onward.

Operational timezone is `Africa/Nairobi` (UTC+03:00, no DST). Locale is `en-UG`. Currency is `UGX`.

Instants (audit timestamps, session expiry, receipt times, event times) are **stored in UTC** and
rendered in `Africa/Nairobi`. Coverage dates, dates of birth, last-covered-day, effective dates,
and waiting-period dates are **calendar-day semantics** — they have no time component and must
never be round-tripped through a UTC instant.

*Implementation consequence:* `src/lib/calendar-date.ts` and `src/lib/locale-config.ts` are the
only places these constants may live. No component may call `toISOString()` on an unvalidated
user- or database-supplied date.

---

### DEC-02 — Contract technical date range
**Blocks:** P02.

Accept four-digit ISO calendar dates from `1900-01-01` through `9999-12-31` inclusive.
Require `end >= start`.

Do **not** invent a narrower commercial duration (no "contracts may not exceed 5 years", no
"start must be within 90 days"). Those are commercial rules that nobody has signed; inventing them
here would reject legitimate legacy data during the P02.03 repair. Five- and six-digit years,
impossible dates (`2026-02-30`), and inverted ranges are rejected at every write boundary.

---

### DEC-03 — Package and rule approval
**Blocks:** P09.

Every coverage-affecting edit creates a **draft version**. A **different authorized checker**
approves it. Activation is **effective-dated**.

"Coverage-affecting" means anything that can change an eligibility or adjudication outcome:
benefit limits, co-contribution, waiting periods, exclusions, referral requirements, provider
rules, and package archival. Non-coverage-affecting metadata (display name, internal notes) may
be edited directly and audited.

The maker may not be the checker. Schemes and members stay pinned to their current approved
version until a governed migration moves them.

---

### DEC-04 — Provider rule precedence
**Blocks:** P03, P09.

Deterministic precedence, highest wins:

1. Specific provider `EXCLUDE`
2. Specific provider `INCLUDE`
3. Tier rule

Ties are broken by an **explicit priority** field. Two rules at the same precedence and same
priority with overlapping effective windows are **invalid** — the overlap detector rejects them at
authoring time rather than letting database return order decide (this is the same class of bug
already found in the Diagnosis Gate work, where row order decided which condition's rules ran).

The evaluator returns the winning rule ID and reason in a protected trace, never to the member.

---

### DEC-05 — Import commit policy
**Blocks:** P06.

Prevalidate the **entire file** before any write. Persist a job. Process **each principal plus its
dependants as one atomic, idempotent family unit**. Resume unfinished units.

A family unit either commits completely or not at all. A partially committed family is a defect,
not an acceptable outcome. Batch completion is derived from the row/unit ledger, never inferred
from the existence of a non-null batch row.

---

### DEC-06 — XLSX import
**Blocks:** P06.06.

Support `.xlsx` through the **same canonical row pipeline** as CSV, using ExcelJS (already
installed) for cell extraction only.

**Never maintain a second validator.** Equivalent CSV and XLSX inputs must produce identical
normalized row hashes and identical accept/reject verdicts. Formulas, macros, and ambiguous merged
headers are rejected. Leading zeros and Unicode are preserved.

---

### DEC-07 — Phone identity
**Blocks:** P05.

Canonicalize Uganda phone numbers (`+256` / `256` / `0` prefixes normalize to one stored form).

**Phone is not globally unique.** Shared household numbers are legitimate and common — a principal
and their dependants routinely share one number. A malformed phone is rejected at input rather
than stored raw, but a duplicate phone is at most a *candidate warning*, never a hard conflict.

Hard identity conflict is exact national ID only (see DEC and P05.04).

---

### DEC-08 — Offline capability
**Blocks:** P04.

Store-and-forward is allowed for provider **Claim**, **PreAuth**, **CheckIn**, and **Image** — and
only after each type's handler is complete and executes the canonical online service.

Admin/member enrollment and bulk import are **online-only**, with draft preservation so a dropped
connection loses no typed input.

Until a handler exists, the sync endpoint returns `REJECTED_UNSUPPORTED`. The current default
`SYNCED` branch — which marks unsupported types synchronized without applying them — is removed.
An unsupported type must remain visible to the user, never silently acknowledged.

---

### DEC-09 — Formula-shaped names
**Blocks:** P06.07.

Store the **legitimate raw/display value unchanged**. A person whose name starts with `=`, `+`,
`-`, or `@` has that name, and the portal displays it faithfully.

Neutralize **only when generating CSV/Excel cells**, and escape **every exported cell**, not just
names. Keep the import source value in restricted provenance so a support investigation can see
exactly what was uploaded.

---

### DEC-10 — Sensitive member detail
**Blocks:** P11.05.

**Minimum-necessary masked by default.** National ID and phone are masked; household composition
and minors are collapsed.

An explicit, permission-gated **reveal** is available. Every reveal is audited with actor, member,
purpose, and time. The reveal **expires on navigation** and on session expiry.

Hidden data must never be serialized into client HTML or network payloads "just to hide it with
CSS" — the default operator DOM must not contain the full sensitive fields.

---

### DEC-11 — Lockout feedback
**Blocks:** P10.02.

Keep the **account-enumeration-safe primary copy**: the response to a failed sign-in must not
reveal whether the account exists, or whether it exists and is locked.

After a failed attempt, show generic **wait and recovery guidance** ("If your account is locked,
wait N minutes or contact your administrator") that is shown identically regardless of whether the
account exists. Provide an **audited admin unlock flow** so a genuinely locked user has a
documented path back.

Attempt counters use atomic updates so parallel bad attempts cannot lose increments.

---

### DEC-12 — Lifecycle effective date
**Blocks:** P07.

The entered date means the **last covered day**. Ineligibility begins on the **following local
calendar day**.

Example: last covered day `2026-08-31` ⇒ the member is eligible for care on `2026-08-31` and
ineligible from `2026-09-01` in `Africa/Nairobi`. Every lifecycle UI must read this back to the
maker in words before confirmation, because "termination date" is exactly the field users get
wrong.

---

## 2. Decisions the plan did *not* raise but implementation will need

These are recorded as **open**. They are not blocking P00. Each must be signed before the phase
named against it starts.

| ID | Question | Raised by | Blocks |
|---|---|---|---|
| **DEC-13** | **Schema deployment mechanism.** See below. | P00.01 | **P00.04**, and P12.02 step 1 / P12.03 |

### DEC-13 — Schema deployment mechanism

**Status: OPEN. P00.04 cannot start until this is signed.**

P00.04 tells the implementer to reconcile Prisma migrations with the schema so that
`migrate deploy` + seed + drift check agree, and to "add a database XOR check **in the migration**".
That describes a deployment model this repository does not use.

What it actually does, verified in P00.01:

- `npm run build` runs `scripts/db-sync.mjs`, which executes **`prisma db push`** on Vercel
  production deploys. Migrations are never applied in production.
- The migration head is `20260513010000_phase_10_lifecycle`, dated 2026-05-13 — about three months
  behind `schema.prisma`, which is the real authority.
- CHECK constraints cannot be expressed in the Prisma schema and are therefore invisible to
  `db push`. All three live in `prisma/sql/2026-08-10_onboarding_invariants.sql`, applied by hand
  over the direct 5432 connection: `caps_family_gte_individual`, `caps_positive`,
  `exclusion_owner_xor`.

So a migration written for `mustChangePassword` (P00.03) or for the XOR fix (P00.04) would be
**correct hygiene but inert in production**.

**Options:**

| | Option | Consequence |
|---|---|---|
| **A** *(recommended)* | Adopt real migrations. Baseline the current production schema as an initial migration, switch `db-sync.mjs` to `prisma migrate deploy`, and fold the three CHECK constraints into versioned migrations. | Highest effort now, but P00.04's acceptance criterion becomes achievable and P12.02's ordered migration/backfill/constraint sequence becomes real rather than aspirational. Removes the hand-applied DDL step that already needs a non-pooler connection. |
| **B** | Keep `db push` and formalise the SQL-invariant files: a numbered, idempotent, checked-in `prisma/sql/**` sequence with a runner and a drift check, and delete the stale `prisma/migrations/**`. | Less work, matches current practice, but P00.04 and P12.02 must be rewritten, and constraint application stays a manual deploy step that can be forgotten. |
| **C** | Do nothing structural; add the XOR fix as another hand-applied SQL file. | Cheapest. Leaves the contradiction between the `SET NULL` referential action and the CHECK constraint managed only by convention, and leaves P12.02 unexecutable as written. |

**Recommendation: A.** The plan's whole migration/backfill/constraint discipline (P12.02) assumes
it, and P00.04 exists precisely to make schema deployment reproducible. B is a defensible
lower-cost answer if the timeline will not carry A. C should be rejected — it is the status quo
that produced the finding.

---

## 3. Amendments

*(none)*
