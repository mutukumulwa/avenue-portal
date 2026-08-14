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

### DEC-14 — Who holds the four new permissions
**Status:** **PROVISIONAL — for UAT only. Medvex must agree this before production.**
**Decided by:** Claude, at the owner's request, on 2026-08-14.

The remediation added four permissions and granted them to nobody. They existed
only as string constants beside their call sites — absent from both
`ROLE_GRANTS` and `prisma/seeds/rbac.ts` — so `permitted()` could never match
them and only `SUPER_ADMIN`'s `*` satisfied them. **A permission no role can
hold is a feature nobody can reach**, which is why the duplicate-review surface
and the support lookup were unusable by anyone but a super admin.

| Permission | Granted to | Reasoning |
|---|---|---|
| `member.sensitive.reveal` | `CUSTOMER_SERVICE` | The desk that verifies a caller's identity is the one that needs the unmask. Already audited per DEC-10, so the control is the record, not the withholding. |
| `member.duplicate.review` | `CUSTOMER_SERVICE` | The same desk hits the hard conflict during enrolment. Giving it to a role that never enrols would leave the operator ringing a colleague — the exact gap P05.04 was written to close. |
| `network.analytics.read` | `UNDERWRITER` | Network performance is a commercial/contracting question, not a claims one. |
| `support.operation.lookup` | **nobody** | Deliberately left to `SUPER_ADMIN`'s wildcard. It shows other users' operations; until somebody owns "support", widening it would be guessing at an audience. |

**Why this is provisional.** Three of the four are privacy reveals. Who may
unmask a member's national ID is a policy question for Medvex, not an
implementation detail, and I was asked to unblock UAT rather than to settle it.

---

### DEC-15 — The permission model assumes staffing that providers do not have
**Status:** **OPEN — product decision, raised 2026-08-14 by the owner.**

A provider meeting on 2026-08-13 established that a typical provider will have
**one or two people** touching this system. The RBAC model assumes an enterprise
with distinct actors — separate claims, underwriting, finance, member-ops and
customer-service roles, plus maker/checker separation between them.

For most providers those roles **collapse into one person**. That is not a
configuration problem to be solved per-tenant; it is a mismatch between the
model and the market, and it has two consequences worth separating:

**Maker/checker becomes theoretical.** Several flows on this branch require a
checker who is not the maker — termination, fraud/breach, lapse reinstatement.
With two staff, that is one specific colleague; with one, it is nobody. DEC-03's
separation is correct as policy and unimplementable at that staffing level.
Someone has to decide whether such providers are refused those actions, or the
TPA supplies the checker.

**The catalogue is the wrong shape.** Twenty-four roles and eighty-six
permissions is a vocabulary for an organisation with twenty-four job titles.

**This is not a reason to weaken the checks.** The permissions are correct and
the audit trail depends on them. The fix is a role model that can express "this
person does everything at this facility" as *one* grant — a composite or
facility-admin role — rather than expecting an operator to assemble it.

**Partly addressed:** `PROVIDER_FACILITY_ADMIN` now exists — all 22 provider
permissions in one assignable role, live in production. Breadth is not privilege
here: provider and branch scope are applied by `ProviderAccessService`
independently of role (spec D4 §0.4), so a facility administrator still cannot
read one row belonging to another provider. The containment is the scope, not
the bundle. No maker/checker pair lives in the provider catalogue —
`profile.change_request` is a *request* the TPA approves — so one person holding
everything cannot approve their own anything.

**Still open, and this role does NOT answer it:** the member-lifecycle
transitions that require a checker who is not the maker (termination, fraud,
breach, lapse reinstatement). With one or two staff there is no second person.
Someone must decide whether such providers are refused those actions or the TPA
supplies the checker. A composite provider role cannot resolve a separation
requirement on the TPA side of the boundary.

---

### DEC-16 — The permissioning module cannot express a shortfall
**Status:** **OPEN — engineering gap, found 2026-08-14 while acting on DEC-14.**

The owner reported difficulty using the permissioning UI. That is the surface
behaving as built, and the finding is specific.

**From the admin UI you can:**
* revoke a role assignment (`revokeAssignmentAction`)
* assign **one** provider duty role, and only while inviting a new user

**You cannot:**
* grant a role to a user who already exists
* create a role
* change which permissions a role holds
* grant a single permission to a single person

So every permissioning shortfall — including DEC-14, which is four rows in a
catalogue — requires a code change, a review and a deploy. For a product whose
role shapes vary per provider (DEC-15), that puts an engineer in the path of
routine operational configuration.

**Why it matters more than it looks.** The 82 permissions, 24 roles and 334
grants in production came from a seed. Nothing in the product can adjust them.
The first time a real provider needs a shape the seed did not anticipate, the
answer today is a pull request.

**Not fixed here.** Building role administration is a feature, not a
remediation task, and it needs DEC-15 settled first — there is no point building
a UI for a role model that is about to change shape.

**One half IS fixed:** `seedRbac` step 4 no longer resurrects revoked access.
It looked only for an *active* assignment, so a revoked one was invisible and
provisioning re-created it — self-made, self-checked, no reason recorded. Since
revoking is the only permission action the UI offers and provisioning calls
`seedRbac`, the single control an administrator had was undone by the routine
command that fixes everything else. Revocation always stamped `revokedAt`; the
seed simply was not reading it. Verified by removing the guard and watching the
test fail on the assertion — the first attempt at that check failed for the
wrong reason (a missing mock method), which looks identical to the guard working.

---

## 3. Amendments

*(none)*
