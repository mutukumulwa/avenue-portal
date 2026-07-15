# CONDITIONAL GO → FULL GO — Execution Plan

**Prepared:** 2026-07-14
**Source verdict:** `uat/outpatient_vercel/BUSY_TPA_DAY_ADVERSARIAL_RESILIENCE_GO_NO_GO.md` (BB2, 2026-07-13, CONDITIONAL GO on prod `33e005b`)
**Defect register:** `uat/outpatient_vercel/BUSY_TPA_DAY_ADVERSARIAL_RESILIENCE_DEFECT_REGISTER.md`
**Audience:** implementation agents, including weak or highly literal AI models. Every work package tells you exactly which file to open, what to insert, and how to prove it worked. Do not improvise beyond what a package says.

---

## 0. What "full GO" requires (the definition of done)

The CONDITIONAL GO verdict gates a full GO on exactly three things (GO/NO-GO §"Path to full GO"):

1. **Fix the Medium findings** — BB2-DEF-01, BB2-DEF-02, BB2-DEF-03, OBS-B7, OBS-H1 (+ the carried N3 modelling condition and OBS-K1/OBS-A3 hygiene items), and **FG-C1** (offline pack scope — WP-A8, surfaced by the C2 assessment; Medium now, latent High).
2. **Clear the untested residual** — Families C (offline — *assessed 2026-07-14: exactly-once verified, FG-C1 raised → fixed WP-A8*), D (HMS — *assessed 2026-07-14: FG-C3 High + FG-C4 raised → fixed WP-A9; UI integration-honesty check still pending*), F/G (binding/races), J (membership), I/O (settlement concurrency/session), N (worker/time), R (portfolio ops), the Family-K remainder (*cleared 2026-07-14*), and scale/load.
3. **Re-run the entry gate + a settlement-side fraud probe on the fix build.**

This plan is organised as four workstreams:

| Workstream | What | Who executes |
|---|---|---|
| **A** | Code fixes (9 work packages, WP-A1…WP-A9; WP-A8 from C2 offline FG-C1, WP-A9 from C3 HMS FG-C3/FG-C4) | Implementation agent |
| **B** | Ops / configuration (Vercel env, tenant settings, DB verify) | Arthur (dashboard actions) + agent (verification) |
| **C** | Residual UAT campaigns | UAT agent via the `/uat` skill |
| **D** | Re-verification gate + full-GO checklist | UAT agent |

Dependency order: **A → deploy → B → D(entry gate) → C → D(final checklist)**.

---

## 1. Mandatory execution protocol (read before touching code)

1. Read `AGENTS.md`. This repo's Next.js has breaking changes vs. training data — before editing any page/route/server action, read the relevant guide under `node_modules/next/dist/docs/`.
2. Do **not** create parallel implementations. Every package below names the canonical file. If you believe a package conflicts with existing code, STOP and report; do not fork a second code path.
3. The database is **`prisma db push` managed** (no migration history). Schema changes here are additive-only. Never run `prisma migrate`.
4. Verification gates that must be green before every commit:
   ```bash
   npm run typecheck        # tsc --noEmit
   npx vitest run           # full suite (currently ~597 tests green)
   npm run brand:guard && npm run currency:guard
   ```
5. Git: one commit per work package, message format `fix(<area>): <DEFECT-ID> — <summary>`. Push to `main` only after all gates pass; a push to `main` auto-deploys to Vercel prod (`avenue-portal.vercel.app`).
6. Amounts and enums: never silently coerce invalid input into a default. Invalid input → HTTP 400 (API) or thrown `Error` (server action) with an operator-readable message.

---

## 2. Workstream A — Code fixes

### WP-A1 — BB2-DEF-01 + BB2-DEF-02 + OBS-A3: validate `POST /api/v1/claims` input and normalise diagnoses

**Problem.**
- BB2-DEF-01 (Medium): `POST /api/v1/claims` with `unitCost: -5000` returns 201 and materialises a claim with billedAmount −5,000 (proven: CLM-2026-00302).
- BB2-DEF-02 (Low): a structured-but-wrong `diagnoses` value (e.g. `[{code:"I10"}]` where a string was expected) crashes into the catch-all and returns a raw HTTP 500.
- OBS-A3 (Low): API-submitted diagnoses are stored as raw strings, so the claim page's DIAGNOSES panel (which expects `{ code, description, isPrimary }` objects — see the cast at `src/app/(admin)/claims/[id]/page.tsx:83`) renders empty.

**File to change:** `src/app/api/v1/claims/route.ts` (currently 234 lines). `zod@^3.24` is already a dependency.

**Change 1 — imports.** Replace line 4:
```ts
import { ClaimLineCategory } from "@prisma/client";
```
with:
```ts
import { ClaimLineCategory, ServiceType, Prisma } from "@prisma/client";
import { z } from "zod";
```

**Change 2 — schema.** Insert immediately after the imports (before the `POST /api/v1/claims` doc comment):
```ts
// BB2-DEF-01/02: strict intake validation. Invalid input must produce a 400
// with a field-level message — never a 201 with bad money, never a raw 500.
const LineItemSchema = z.object({
  description:     z.string().trim().min(1, "description is required").max(300),
  quantity:        z.number().int("quantity must be a whole number").min(1, "quantity must be at least 1").max(1000),
  unitCost:        z.number().positive("unitCost must be greater than 0").finite().max(1_000_000_000),
  cptCode:         z.string().trim().max(20).optional(),
  serviceCategory: z.nativeEnum(ClaimLineCategory).optional(),
});

const DiagnosisSchema = z.union([
  z.string().trim().min(1).max(20),
  z.object({
    code:        z.string().trim().min(1, "diagnosis code is required").max(20),
    description: z.string().trim().max(300).optional(),
    isPrimary:   z.boolean().optional(),
  }),
]);

const PostClaimSchema = z.object({
  memberNumber:     z.string().trim().min(1),
  providerCode:     z.string().trim().min(1).optional(),
  serviceType:      z.nativeEnum(ServiceType),
  dateOfService:    z.string().refine((s) => !Number.isNaN(Date.parse(s)), "dateOfService must be a valid date"),
  diagnoses:        z.array(DiagnosisSchema).min(1, "at least one diagnosis is required").max(20),
  lineItems:        z.array(LineItemSchema).min(1, "at least one line item is required").max(100),
  preauthReference: z.string().trim().max(60).optional(),
  externalRef:      z.string().trim().min(1).max(100).optional(),   // consumed by WP-A2
});
```
Decision recorded: **strict numbers, no `z.coerce`** — `"quantity": "1"` (a string) is a 400. The API contract documents numbers; coercion is how −5000 got in.

**Change 3 — parse.** Replace lines 14–37 (from `const body = await req.json();` through the closing `}` of the missing-fields `if` block) with:
```ts
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = PostClaimSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { memberNumber, providerCode, serviceType, dateOfService, preauthReference } = parsed.data;

    // A per-facility key attributes the claim to its own provider (providerCode
    // is then optional and cannot be spoofed to another facility). The operator
    // key still resolves the provider from providerCode.
    const credential = await getApiCredential(req);
    const providerFromKey = credential?.kind === "provider" ? credential.providerId : null;

    if (!providerCode && !providerFromKey) {
      return NextResponse.json({ error: "providerCode is required when using an operator key" }, { status: 400 });
    }
```
(The original `credential`/`providerFromKey` block at lines 29–30 is subsumed by the above — delete the original so it appears exactly once.)

**Change 4 — diagnosis normalisation (OBS-A3).** Insert immediately after the provider `contractStatus` check (originally lines 80–82), before the pre-auth resolution:
```ts
    // OBS-A3: normalise diagnoses to the canonical stored shape
    // { code, description, isPrimary } so the claim page renders them.
    const normalizedDiagnoses = parsed.data.diagnoses.map((d, i) =>
      typeof d === "string"
        ? { code: d, description: d, isPrimary: i === 0 }
        : { code: d.code, description: d.description ?? d.code, isPrimary: d.isPrimary ?? i === 0 }
    );
```

**Change 5 — use validated lines.** Replace the `totalBilled` computation (originally lines 99–103) with:
```ts
    const totalBilled = parsed.data.lineItems.reduce((s, l) => s + l.quantity * l.unitCost, 0);
```
In the `prisma.claim.create` call:
- replace `diagnoses,` with `diagnoses: normalizedDiagnoses,`
- replace the `claimLines.create` map input `(lineItems as {...}[])` with `parsed.data.lineItems` and the map body with:
```ts
            (l, idx) => ({
              lineNumber:      idx + 1,
              description:     l.description,
              quantity:        l.quantity,
              unitCost:        l.unitCost,
              billedAmount:    l.quantity * l.unitCost,
              approvedAmount:  0,
              serviceCategory: l.serviceCategory ?? ClaimLineCategory.OTHER,
              cptCode:         l.cptCode ?? null,
              icdCode:         normalizedDiagnoses[0].code,
            })
```
- delete the now-unused destructured `diagnoses` and `lineItems` variables (they only exist inside `parsed.data` after this change).

**Tests to add:** new file `tests/api/claims-intake-validation.test.ts`, harness style copied from `tests/api/api-auth-operator-key.test.ts` (mock `@/lib/prisma` and `@/lib/apiAuth`, import `POST` from the route). Cases, each asserting status code AND that `prisma.claim.create` was **not** called for the reject cases:
1. `unitCost: -5000` → 400, error mentions `unitCost`.
2. `unitCost: 0` → 400.
3. `quantity: 0` → 400; `quantity: 1.5` → 400.
4. `lineItems: []` → 400.
5. `diagnoses: [{ notCode: "x" }]` → 400 (NOT 500) — the BB2-DEF-02 repro shape.
6. Malformed JSON body → 400 "Invalid JSON body".
7. `serviceType: "BANANA"` → 400.
8. Valid payload with string diagnoses `["I10"]` → 201, and the `prisma.claim.create` call argument's `diagnoses` equals `[{ code: "I10", description: "I10", isPrimary: true }]`.

**Acceptance criteria:** all 8 tests green; full suite green; the exact BB2 repro payloads (register rows BB2-DEF-01 and BB2-DEF-02) return 400 with a JSON error body when replayed against a local dev server.

**Do not:** rewrite the route to call `runClaimIntake` (the API rail's member-by-number + operator-tenant gates differ; convergence is a separate architecture task, out of scope here).

---

### WP-A2 — BB2-DEF-03: idempotency key + duplicate window on the API rail

**Problem.** 3× identical `POST /api/v1/claims` created 3 distinct payable claims (CLM-2026-00303/04/05). The UI rail has a 2-minute duplicate guard (BD-02, `src/app/provider/claims/new/actions.ts:47-65`); the API rail has none and no idempotent-retry semantics.

**Change 1 — schema.** In `prisma/schema.prisma`, model `Claim` (starts line 2181): insert after the `invoiceNumber` line (2187):
```prisma
  // BB2-DEF-03: client-supplied idempotency key for the B2B API rail. A retry
  // carrying the same key returns the original claim instead of duplicating it.
  externalRef      String?
```
In the same model's index block (the lines `@@unique([tenantId, claimNumber])` / `@@unique([providerId, invoiceNumber])` near the end of the model), add:
```prisma
  @@unique([tenantId, providerId, externalRef])
```
This is additive and NULL-safe (Postgres treats NULLs as distinct — existing claims are unaffected). It is applied to prod automatically by the build's `scripts/db-sync.mjs` step. Run `npx prisma generate` after editing, then `npm run db:push` against the local dev DB only.

**Change 2 — route logic.** In `src/app/api/v1/claims/route.ts`, insert after the provider `contractStatus` check and after WP-A1's `normalizedDiagnoses` block, before the pre-auth resolution:
```ts
    // BB2-DEF-03: idempotent replay — an externalRef (body field or
    // Idempotency-Key header) matching a prior claim from this facility
    // returns the original claim instead of creating a second one.
    const idemKey = parsed.data.externalRef ?? req.headers.get("idempotency-key")?.trim() ?? null;
    if (idemKey) {
      const existing = await prisma.claim.findFirst({
        where: { tenantId: member.tenantId, providerId: provider.id, externalRef: idemKey },
        select: { claimNumber: true, status: true, billedAmount: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            success: true,
            duplicate: true,
            claimNumber: existing.claimNumber,
            status: existing.status,
            billedAmount: Number(existing.billedAmount),
            message: "Duplicate submission — original claim returned (idempotent replay).",
          },
          { status: 200 }
        );
      }
    }
```
Then move WP-A1's `totalBilled` line to just below that block, and insert after it:
```ts
    // BB2-DEF-03 fallback: without an idempotency key, block an identical claim
    // (same facility/member/service-date/total) captured in the last 2 minutes —
    // the same window the provider portal enforces (BD-02).
    const recentDuplicate = await prisma.claim.findFirst({
      where: {
        tenantId:      member.tenantId,
        providerId:    provider.id,
        memberId:      member.id,
        dateOfService: new Date(dateOfService),
        billedAmount:  totalBilled,
        createdAt:     { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      select: { claimNumber: true },
      orderBy: { createdAt: "desc" },
    });
    if (recentDuplicate) {
      return NextResponse.json(
        {
          error:
            `Duplicate submission: an identical claim (${recentDuplicate.claimNumber}) for this member, ` +
            `service date and amount was received in the last 2 minutes. If this is a genuine distinct ` +
            `encounter, adjust a line or retry after 2 minutes. To make retries safe, send an Idempotency-Key header.`,
          claimNumber: recentDuplicate.claimNumber,
        },
        { status: 409 }
      );
    }
```

**Change 3 — stamp + race safety.** In the `prisma.claim.create` data block add `externalRef: idemKey,` (directly under `claimNumber,`). Wrap the create so a concurrent double-POST that hits the unique constraint replays instead of 500ing — replace `const claim = await prisma.claim.create({ ... });` with:
```ts
    let claim;
    try {
      claim = await prisma.claim.create({ /* unchanged data block */ });
    } catch (e) {
      // Concurrent retry raced past the pre-check and hit the unique index —
      // resolve it as an idempotent replay, not an error.
      if (idemKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const existing = await prisma.claim.findFirst({
          where: { tenantId: member.tenantId, providerId: provider.id, externalRef: idemKey },
          select: { claimNumber: true, status: true, billedAmount: true },
        });
        if (existing) {
          return NextResponse.json(
            {
              success: true,
              duplicate: true,
              claimNumber: existing.claimNumber,
              status: existing.status,
              billedAmount: Number(existing.billedAmount),
              message: "Duplicate submission — original claim returned (idempotent replay).",
            },
            { status: 200 }
          );
        }
      }
      throw e;
    }
```

**Tests to add:** new file `tests/api/claims-idempotency.test.ts` (same harness style):
1. Two POSTs with `externalRef: "HMS-TXN-001"` → first 201, second 200 with `duplicate: true` and the first claim's number; `prisma.claim.create` called exactly once.
2. `Idempotency-Key` header (no body field) → same behaviour.
3. No key, identical payload twice inside the window (mock `claim.findFirst` returning a recent match) → second call 409 with `claimNumber`.
4. No key, identical payload but the mocked prior claim is older than 2 minutes → 201 (window expired; adjudication-time double-capture detection remains the backstop).
5. P2002 thrown from `claim.create` with a key → 200 replay, not 500.

**Acceptance criteria:** tests green; the BB2 repro (3 identical POSTs) replayed locally yields 201/409/409 without a key and 201/200-replay/200-replay with a key. Response for a replay must echo the ORIGINAL claim number.

---

### WP-A3 — OBS-B7: ceiling preview must agree with `assessCeiling`

**Problem.** The adjudication page banner showed "Contracted total 83,500" while the enforced ceiling was 3,500 on the same claim. Cause: `src/app/(admin)/claims/[id]/page.tsx:57-62` computes `contractedTotal` with a fallback of **full billed** (`unitCost * quantity`) for lines with `agreedRate === null` — exactly the unpriced lines that BD-07 (`assessCeiling`, `src/server/services/claim-decision.service.ts:109`) excludes from the ceiling.

**File to change:** `src/app/(admin)/claims/[id]/page.tsx`.

**Change 1 — computation.** Replace lines 57–62:
```ts
  const contractedTotal = tariffVariances.reduce((sum, v) => {
    const l = claim.claimLines.find(l => l.id === v.lineId);
    if (!l) return sum;
    const contracted = v.agreedRate !== null ? v.agreedRate * l.quantity : Number(l.unitCost) * l.quantity;
    return sum + contracted;
  }, 0);
```
with:
```ts
  // OBS-B7: the preview must use the same arithmetic as the enforced ceiling
  // (assessCeiling / BD-07): a line with no contracted rate contributes 0 —
  // NOT its billed amount. Unpriced lines are surfaced separately.
  const unpricedPreviewCount = tariffVariances.filter((v) => v.agreedRate === null).length;
  const contractedTotal = tariffVariances.reduce((sum, v) => {
    if (v.agreedRate === null) return sum;
    const l = claim.claimLines.find((l) => l.id === v.lineId);
    return l ? sum + v.agreedRate * l.quantity : sum;
  }, 0);
```

**Change 2 — banner copy.** In the tariff-variance banner (the `<p className="font-bold">` around line 279), change the label `Contracted total:` to `Contracted total (priced lines only):` and insert directly after that `<p>` block:
```tsx
            {unpricedPreviewCount > 0 && (
              <p className="mt-0.5 text-xs">
                {unpricedPreviewCount} line{unpricedPreviewCount > 1 ? "s have" : " has"} no contracted
                rate and {unpricedPreviewCount > 1 ? "are" : "is"} excluded from the enforceable ceiling (BD-07).
              </p>
            )}
```

**Change 3 — header span.** The second display (around line 293, `Contracted: {claim.currency} …` in the Service Line Items header) gets the same label: `Contracted (priced):`.

**Tests:** the computation is RSC-inline; verification is behavioural. Add the parity check to the Workstream D re-verify matrix (probe D-7 below): on a mixed coded+uncoded claim, the banner figure must equal the "engine payable ceiling" figure from the PR-014 pre-submission panel on the same page. No unit test required, but `npm run typecheck` must pass (note `v.agreedRate` is now used non-null-asserted only inside the `!== null` guard).

**Acceptance criteria:** on a fresh mixed claim (one priced line 3,500 + one uncoded line 80,000 — the CLM-2026-00297 shape), every number named "Contracted" on the page reads 3,500, with the unpriced-exclusion note visible.

---

### WP-A4 — OBS-H1: fraud flags must gate settlement (and be switched ON in prod)

**Problem.** Fraud-flagged CLM-2026-00297 was approved AND scooped into a settlement batch with no block. Two gaps:
(a) the OBS-7 approval gate (`ClaimControlService.enforceFraudGate`, `src/server/services/claim-control.service.ts:50`) is behind `requireFraudClearanceBeforeApproval`, which **defaults to `false`** (`src/server/services/tenant-settings.service.ts:32`) and is OFF for the prod tenant;
(b) even with (a) ON, nothing re-checks fraud at settlement time — a claim flagged AFTER approval would still pay.

**Recorded product decision:** the platform default stays `false` (no silent policy change for other tenants — the setting's own doc comment says so). The Medvex prod tenant turns it ON via the existing UI (Workstream B step 3). Code work = the settlement-side gate only.

**File to change:** `src/server/services/claim-adjudication.service.ts`.

**Change 1 — import.** Add to the top-of-file imports:
```ts
import { TenantSettingsService } from "./tenant-settings.service";
```

**Change 2 — quarantine at batch creation.** In `createSettlementBatch` (starts line 362), directly after the `const claims = await prisma.claim.findMany({...});` scoop and BEFORE the `if (claims.length === 0)` check, insert:
```ts
    // OBS-H1: fraud quarantine — when the tenant requires fraud clearance, a
    // claim carrying an unresolved fraud alert at/above the configured
    // threshold must not be scooped into a settlement batch until cleared.
    const controls = await TenantSettingsService.getClaimControls(tenantId);
    let quarantinedIds: string[] = [];
    let scoop = claims;
    if (controls.requireFraudClearanceBeforeApproval && claims.length > 0) {
      const alerts = await prisma.claimFraudAlert.findMany({
        where: { tenantId, claimId: { in: claims.map((c) => c.id) }, resolved: false },
        select: { claimId: true, severity: true },
      });
      const blocked = new Set(
        alerts
          .filter((a) => TenantSettingsService.severityAtLeast(a.severity, controls.fraudApprovalSeverityThreshold))
          .map((a) => a.claimId),
      );
      quarantinedIds = claims.filter((c) => blocked.has(c.id)).map((c) => c.id);
      scoop = claims.filter((c) => !blocked.has(c.id));
    }
```
Then, in the remainder of `createSettlementBatch`, replace every subsequent use of `claims` with `scoop` — specifically: the `claims.length === 0` empty check, the `currencies` derivation, the per-currency breakdown, `totalAmount`, `claimCount`, and the `tx.claim.updateMany({ where: { id: { in: claims.map(...) } } })` inside the transaction. Amend the empty-scoop error message: when `quarantinedIds.length > 0`, throw
```ts
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          `All ${quarantinedIds.length} otherwise-eligible claim(s) carry unresolved fraud alert(s) at/above ` +
          `${controls.fraudApprovalSeverityThreshold} severity and are quarantined from settlement. ` +
          `Clear them in the Fraud console, then create the run again.`,
      });
```
Finally add `quarantinedClaimIds: quarantinedIds` to the `auditChainService.append` payload for `SETTLEMENT:BATCH_CREATED`.

**Change 3 — hard block at pay time.** In `markSettlementBatchPaid` (starts ~line 519), directly after the `const claims = await prisma.claim.findMany({ where: { settlementBatchId: batchId }, ... });` fetch, insert:
```ts
    // OBS-H1 defence in depth: a claim flagged AFTER batch creation must still
    // block the money moment. Clearing the alert unblocks Mark Paid.
    const controls = await TenantSettingsService.getClaimControls(tenantId);
    if (controls.requireFraudClearanceBeforeApproval && claims.length > 0) {
      const alerts = await prisma.claimFraudAlert.findMany({
        where: { tenantId, claimId: { in: claims.map((c) => c.id) }, resolved: false },
        select: { claimId: true, severity: true },
      });
      const blocked = new Set(
        alerts
          .filter((a) => TenantSettingsService.severityAtLeast(a.severity, controls.fraudApprovalSeverityThreshold))
          .map((a) => a.claimId),
      );
      if (blocked.size > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Fraud control: ${blocked.size} claim(s) in this batch carry unresolved fraud alert(s) at/above ` +
            `${controls.fraudApprovalSeverityThreshold} severity. Clear the alert(s) in the Fraud console, ` +
            `then Mark Paid again.`,
        });
      }
    }
```
`approveSettlementBatch` is intentionally left unchanged — creation and pay-time cover both ends of the window, and the checker sees the quarantine note in the batch audit trail.

**Tests to add:** new file `tests/services/settlement-fraud-quarantine.test.ts` (mock `@/lib/prisma`; follow an existing file in `tests/services/` for the mocking pattern):
1. Setting ON, 2 approved claims, one with an unresolved HIGH alert → batch contains only the clean claim; audit payload lists the quarantined id.
2. Setting ON, ALL claims flagged → `createSettlementBatch` throws the quarantine message; no batch row created.
3. Setting ON, alert severity LOW with threshold MEDIUM → claim is scooped (below threshold never blocks).
4. Setting OFF → both claims scooped (behaviour identical to today; other tenants unaffected).
5. `markSettlementBatchPaid` with setting ON and one claim flagged after batch creation → throws; with the alert `resolved: true` → proceeds.

**Acceptance criteria:** tests green; full suite green. Live proof happens in Workstream D probe D-8 after Workstream B enables the setting in prod.

---

### WP-A5 — OBS-K1: login throttle must fail loudly, not silently

**Problem.** After ~10 rapid login cycles an IP throttle (platform-level, in front of the app) trips; `signIn()` then hangs or rejects, and `src/app/(auth)/login/page.tsx:29-60` has no catch/timeout — the user sees a spinner or nothing.

**File to change:** `src/app/(auth)/login/page.tsx`. Replace the body of `handleLogin` (lines 29–60) with:
```ts
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const startedAt = performance.now();

    // OBS-K1: an upstream rate-limit can swallow the sign-in request entirely.
    // Bound the wait and surface a human-readable message instead of hanging.
    let result: Awaited<ReturnType<typeof signIn>> | undefined;
    try {
      result = await Promise.race([
        signIn("credentials", { email, password, totp, redirect: false }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("SIGNIN_TIMEOUT")), 20_000),
        ),
      ]);
    } catch {
      setLoading(false);
      setError(
        "We couldn't reach the sign-in service. This can happen after several rapid attempts — wait a minute, then try again.",
      );
      return;
    }

    setLoading(false);
    console.info(`[perf] login.signIn: ${(performance.now() - startedAt).toFixed(1)}ms`);

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
      return;
    }

    const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

    // BD-03: navigate with a full document load, not a client-side router push.
    // `/post-login` is now an HTTP redirect route handler (not an RSC page), so
    // the browser must GET it and follow the 307 — a client `router.replace`
    // would try to prefetch it as an RSC payload, the exact path that 503'd and
    // stranded logins. `window.location` also guarantees the freshly-minted
    // session cookie is sent on the redirect request.
    setLoading(true);
    window.location.assign(callbackUrl ?? "/post-login");
  };
```
Note: the BD-03 comment and `window.location.assign` line are preserved verbatim — do not change the navigation mechanism.

**Tests:** UI-behavioural; covered by Workstream D probe D-9 (rapid login cycling must end in a visible message, never a silent no-op). No unit test required.

---

### WP-A6 — N3: sibling-group privacy exposure under "Medvex — Default Client"

**Problem (confirmed live).** Six unrelated employers (Twiga, Bamburi, EABL, KCB, Safaricom, Patricia) are Groups under one Client. Provider/API entitlement scopes by client (`ProviderEntitlementService.entitledMemberWhere`, `src/server/services/provider-entitlement.service.ts:29` — the file's own NOTE documents this exact caveat), so any provider entitled to the Default Client can resolve member PII across all six employers. Group-level applicability is **already supported** by the entitlement code (`groupId` set on a `ContractApplicability` row scopes to that group only) — this is a **data** problem, not a code problem.

**This package is gated on one business decision** (present it before applying step 3): *which employers may each contracted provider serve?* If the business confirms "every network provider serves every scheme", close N3 as accepted-risk with that sign-off recorded in the run log and skip step 3. Otherwise execute all steps.

**Step 1 — build the report script.** New file `scripts/n3-applicability-report.mjs`:
- Connect via `@prisma/client` (same pattern as other `scripts/*.mjs`).
- Find the tenant by `slug = "medvex"`, the client by `name = "Medvex — Default Client"` within that tenant (fail loudly if either is missing or ambiguous).
- List every `ContractApplicability` row with `clientId = <default client>`, `groupId = null`, `inclusionType = "INCLUDE"`, `isActive = true`, joined to its contract's provider name and status.
- List the client's groups (id, name, member count).
- Emit a CSV `uat/outpatient_vercel/evidence/n3_provider_group_matrix.csv` with one row per (provider, group) pair and a column `allowed` prefilled `YES` — this is the sign-off artifact the business edits.
- The script is READ-ONLY. It must contain no `update`/`create`/`delete` calls.

**Step 2 — business sign-off.** Arthur circulates the CSV; the returned file (with `allowed` set to `YES`/`NO` per pair) is committed as evidence.

**Step 3 — build the apply script.** New file `scripts/n3-apply-group-applicability.mjs`, taking `--csv <path>` and `--apply` flags (without `--apply` it prints the intended writes and exits — dry-run is the default):
For each client-level INCLUDE row found in step 1, inside one transaction per contract:
1. Create one `ContractApplicability` row per CSV pair marked `YES` for that provider: same `contractId`, same `clientId`, `groupId = <group id>`, `inclusionType = "INCLUDE"`, `isActive = true`, `effectiveFrom`/`effectiveTo` copied from the client-level row.
2. Set the client-level row `isActive = false` (never delete — audit trail).
3. Print a per-contract summary: rows created, row deactivated.
Constraints: idempotent (re-running skips pairs that already have an active group-level row); refuses to run if the CSV lists a provider or group id it cannot find; refuses to deactivate a client-level row if the CSV grants that provider zero groups **unless** `--allow-total-revoke` is passed.

**Step 4 — verify (UAT probe, feeds Workstream D).** With Provider A's facility API key: `GET /api/v1/eligibility?memberNumber=<member of a group marked NO for Provider A>` → must return 404; a member of a `YES` group → still 200. Staff-side and settlement behaviour unchanged (clients/groups themselves were not moved).

**Long-term note (do NOT execute in this package):** the strategic fix — promoting each employer to its own Client — touches every `clientId`-keyed surface (funding, invoicing, billing, approval matrices, commission, reports; 16+ models carry `clientId`). That is a separate scoped project requiring its own plan and prod-data rehearsal. Record it as a backlog item; it is not required for full GO once group-level applicability enforces isolation.

---

### WP-A7 — defence in depth: positivity guard in the shared intake path

**Problem.** `runClaimIntake` (`src/server/services/claim-intake.ts:49`) trusts callers for line amounts (line 128 just sums `billedAmount`). WP-A1 fixes the API rail's validation, but the single shared path should refuse bad money regardless of the caller — that is the whole point of a canonical intake.

**File to change:** `src/server/services/claim-intake.ts`. Insert at the very top of `runClaimIntake`, immediately after the opening brace (before the service-date gate at line 55):
```ts
  // BB2-DEF-01 defence in depth: no intake rail may materialise a non-positive
  // or inconsistent line amount, whatever the caller validated.
  if (!data.lineItems || data.lineItems.length === 0) {
    throw new Error("At least one service line is required.");
  }
  for (const l of data.lineItems) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) {
      throw new Error(`Line "${l.description}": quantity must be a whole number of at least 1.`);
    }
    if (!Number.isFinite(l.unitCost) || l.unitCost <= 0) {
      throw new Error(`Line "${l.description}": unit cost must be greater than 0.`);
    }
    if (Math.abs(l.billedAmount - l.quantity * l.unitCost) > 0.01) {
      throw new Error(
        `Line "${l.description}": billed amount (${l.billedAmount}) does not equal quantity × unit cost.`,
      );
    }
  }
```
Known-safe callers: the provider action already coerces `quantity ≥ 1`, filters `unitCost > 0`, and computes `billedAmount = qty × unit` (`src/app/provider/claims/new/actions.ts:85-97`); the admin wizard submits UI-computed lines. **If any existing vitest test fails because it submits a zero-cost or fractional-quantity line, STOP and report the test name — do not weaken this guard to make it pass.**

**Tests to add:** extend whichever existing suite covers `runClaimIntake` (search: `rg -ln "runClaimIntake" tests/`); if none exists, create `tests/services/claim-intake-validation.test.ts` with: zero-qty rejected, negative unitCost rejected, `billedAmount ≠ qty×unit` rejected, happy path unchanged.

---

### WP-A8 — FG-C1: scope the offline data pack to the facility's entitled members

**Problem (found in Workstream C2, 2026-07-14).** `OfflinePackService.buildPayload` (`src/server/services/offline-pack.service.ts:76`) builds the offline pack roster from **every active member in the tenant** — `where: { tenantId, status: "ACTIVE" }` — filtered only by `PackageProviderEligibility` (a package-level table that is **empty in prod**, and whose no-rules default is *include*). So a facility's encrypted offline pack contains the **entire tenant roster** (2,997 members incl. all 2,750 NWSC self-funded members that are isolated on every other rail) plus their benefit balances. This is the same class of defect as E2E-D02 (which scoped the B2B eligibility API by client) but on the offline rail, and strictly broader (tenant-wide, not client-wide). Currently gated because `/offline-capture` is `ROLES.OPS`-only and no external API returns the pack — but it is a latent High: the offline capability's stated purpose is facility devices, at which point this leaks the whole tenant. Fix it now while touching the offline rail.

**Canonical owner to reuse — do NOT write a new scoping query.** `ProviderEntitlementService.entitledMemberWhere(providerId)` (`src/server/services/provider-entitlement.service.ts:29`) already returns the exact `Prisma.MemberWhereInput` fragment that confines a member query to a provider's contracted clients/groups (deny-by-default: a provider with no active INCLUDE applicability resolves no members). The B2B eligibility/benefits API already uses it. It also honours the group-level applicability that WP-A6 introduces, so this fix inherits N3 isolation automatically once WP-A6 is applied.

**File to change:** `src/server/services/offline-pack.service.ts`.

**Change 1 — scope the roster query.** Replace the members query (lines 76–82):
```ts
    const members = await prisma.member.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: {
        id: true, memberNumber: true, firstName: true, lastName: true, status: true,
        packageVersionId: true,
      },
    });
```
with:
```ts
    // FG-C1: the pack must contain only members this facility is entitled to
    // (its contracted clients/groups) — NOT the whole tenant. Reuse the same
    // entitlement fragment the B2B eligibility API uses (deny-by-default; also
    // honours WP-A6 group-level applicability once applied).
    const { ProviderEntitlementService } = await import("./provider-entitlement.service");
    const entitledWhere = await ProviderEntitlementService.entitledMemberWhere(providerId);
    const members = await prisma.member.findMany({
      where: { AND: [{ tenantId, status: "ACTIVE" }, entitledWhere] },
      select: {
        id: true, memberNumber: true, firstName: true, lastName: true, status: true,
        packageVersionId: true,
      },
    });
```
Leave the existing `PackageProviderEligibility` filter (lines 84–103), the balances query, and the tariff query unchanged — they are narrower, per-package/per-provider filters that still apply on top of the entitlement gate.

**Change 2 — regenerate the packs already sitting in the DB.** Existing `OfflineDataPack` rows were generated with the old tenant-wide roster and are stale/over-scoped. After deploy, run the existing regeneration job so live packs are rebuilt with the scoped roster:
- The job is `src/server/jobs/offline-pack.job.ts` (`regenerateActivePacks`). Trigger it via the worker, or (ops) revoke any outstanding work codes so no stale pack remains unlockable. Note in the PR which path was taken. (In prod today there are **0** issued codes/packs, so there may be nothing to regenerate — verify with the DB query in the acceptance criteria before assuming work is needed.)

**Tests to add:** new file `tests/services/offline-pack-scope.test.ts` (mock `@/lib/prisma`; follow `tests/api/provider-read-scope.test.ts` for the entitlement-fragment fake). Cases:
1. Provider entitled to client X → roster includes members of client X's groups, EXCLUDES a member of client Y. (Assert the `member.findMany` `where` contains the entitlement `AND` clause and that a Y-member is filtered.)
2. Provider with no active INCLUDE applicability → roster is empty (deny-by-default; `entitledMemberWhere` returns the impossible `{ id: "__no_provider_entitlement__" }`).
3. Group-level applicability (one group under a shared client) → roster includes that group only, not sibling groups (the N3 shape).

**Acceptance criteria:**
- Unit tests green; full suite green; `tsc` clean.
- Behavioural proof (staging or a scoped local DB): issue an offline code for a provider entitled only to the Default Client, unlock the pack, and confirm `memberCount` ≈ the Default Client's entitled members (≤ 249 on current prod data) and that **no NWSC member** appears. Cross-check with:
  ```sql
  -- entitled count for a given provider (expected pack roster size, pre-package-filter)
  SELECT count(*) FROM "Member" m JOIN "Group" g ON g.id=m."groupId"
  WHERE m."tenantId"='cmr3ae8v30000nlvqxrqlfn38' AND m.status='ACTIVE'
    AND g."clientId" IN (
      SELECT DISTINCT ca."clientId" FROM "ContractApplicability" ca
      JOIN "ProviderContract" pc ON pc.id=ca."contractId"
      WHERE pc."providerId"='<providerId>' AND pc.status='ACTIVE'
        AND ca."isActive" AND ca."inclusionType"='INCLUDE' AND ca."groupId" IS NULL);
  ```
- **Do NOT** generate a live pack purely to demonstrate the bug pre-fix — it materialises the full roster as encrypted PII. The pre-fix exposure is already proven by code + the empty `PackageProviderEligibility` table (0 rows) in `FULL_GO_DEFECT_REGISTER.md` (FG-C1).

**Related low-severity items from C2 (fix opportunistically, not blocking):**
- **OBS-C3:** `src/app/api/v1/sync/route.ts:35` resolves the tenant via `prisma.tenant.findFirst()` (TODO G8) instead of the API key's tenant — benign in single-tenant, a latent cross-tenant bug. Bind it to the key's credential before onboarding a second operator tenant.
- **OBS-C2:** `/offline-capture` is `ROLES.OPS`-only, so the facility-facing offline capture the design implies does not exist for `PROVIDER_USER`. Product decision required (is offline capture internal-ops-only, or should it be exposed to facilities?) before building the external pack-pull — and the external pack-pull MUST carry this WP-A8 scoping.

---

### WP-A9 — FG-C3 + FG-C4: bind the HMS batch to the key's facility, and quarantine per line

**Problem (found in Workstream C3, 2026-07-14).** The HMS batch rail (`POST /api/v1/hms-batch` → `HmsBatchService`) has two gaps:
- **FG-C3 (High, latent).** `postHmsBatch` (`src/app/api/v1/hms-batch/route.ts`) authenticates with `withApiKey` but **never reads the credential**; `HmsBatchService.apply` resolves the target provider **entirely from the payload `facilityCode`**. A valid facility-A key can therefore post `facilityCode: "<Facility B>"` + an enumerable `caseNumber` and append service entries to **Facility B's open cases**. This is the cross-rail parity gap: the claims rail forces `providerFromKey` and ignores body `providerCode` (E2E-D02/BD-06); the HMS rail missed it. Latent today (0 active keys → 401) but live the moment per-facility HMS keys are issued, with no defence-in-depth. (Test-plan D2-01: *"Facility A key sends Facility B code → rejected before case lookup".*)
- **FG-C4 (Medium).** `validate()` doesn't check `quantity`, so a `quantity: 0/-n` line passes validation, matches a case, then throws in `CaseService.addServiceEntry` (`case.service.ts:115`). `apply()` has no per-line try/catch, so the throw 400s the **whole batch** *after* earlier lines already committed (each `addServiceEntry` is its own transaction) — and on retry the poison line throws again, blocking every later line. Decimal quantity (1.5) is also silently accepted.

**Files to change:** `src/app/api/v1/hms-batch/route.ts` and `src/server/services/hms-batch.service.ts`.

**Change 1 — route: bind to the key (FG-C3) and prefer the key's tenant (OBS-D2).** Import `getApiCredential` alongside `withApiKey`, and replace the tenant-resolution + apply block:
```ts
    const body = await req.json();
    HmsBatchService.validate(body);

    // FG-C3: bind the batch to the authenticated key. A per-facility key can
    // only file for its OWN facility (providerFromKey); the payload facilityCode
    // cannot retarget another facility. An operator key still resolves the
    // facility from the payload.
    const credential = await getApiCredential(req);
    const providerFromKey = credential?.kind === "provider" ? credential.providerId : null;

    // OBS-D2/G8: prefer the key's tenant; fall back to the single-operator
    // scaffold only for an unbound operator key.
    const tenantId =
      credential?.tenantId ?? (await prisma.tenant.findFirst({ select: { id: true } }))?.id;
    if (!tenantId) return NextResponse.json({ error: "No operator tenant" }, { status: 500 });

    const report = await HmsBatchService.apply(tenantId, body, providerFromKey ?? undefined);
    return NextResponse.json({ success: true, ...report });
```

**Change 2 — service `validate()`: reject bad quantity (FG-C4).** After the `unitAmount` check, before the case/member-ref check:
```ts
      // FG-C4: quantity is optional (defaults to 1) but, when present, must be a
      // positive whole number — reject 0, negative, and decimal at the envelope
      // so it never poison-throws mid-apply (parity with the intake rails).
      if (e.quantity !== undefined && (!Number.isInteger(e.quantity) || e.quantity < 1)) {
        throw new Error(`entries[${i}]: quantity must be a positive whole number`);
      }
```

**Change 3 — service `apply()`: resolve provider from the key (FG-C3).** Change the signature to `apply(tenantId, batch, providerFromKey?)` and replace the provider-resolution block: when `providerFromKey` is set, look the provider up by `{ id: providerFromKey, tenantId }`, select `smartProviderId` too, and reject a payload `facilityCode` that names a different facility (matches the committed implementation on branch `fix/full-go-workstream-a`); otherwise keep the operator OR-match on `facilityCode`.

**Change 4 — service `apply()`: per-line quarantine + `rejected` count (FG-C4).** Add `let rejected = 0;`, wrap the per-line `CaseService.addServiceEntry(...)` in try/catch — on throw, `rejected++` and create an `ExceptionLog` (`reason: "HMS_BATCH_REJECTED"`, `.catch(() => undefined)` so the registry write can't mask the outcome) — and add `rejected` to the returned report so `total = applied + duplicates + unmatched + rejected`.

**Tests to add** (extend `tests/services/hms-batch.service.test.ts`): quantity 0/negative/decimal rejected by `validate`; a provider key files only for its own facility; a provider key with a mismatched `facilityCode` throws and writes nothing; an operator key still resolves from the payload; a line that throws at write is quarantined (`rejected` counted, `HMS_BATCH_REJECTED` logged, other lines still apply, conservation holds).

**Acceptance criteria:** unit tests green; full suite green; `tsc` + guards clean. Route still 401s without a key (fail-closed preserved). **Add re-verify probe D-15** (once a facility key exists on staging: facility-A key + `facilityCode:<B>` → rejected, no B case mutation; facility-A key + own facility → applies; a `quantity:0` line → 400 at validate; a write-time failure → quarantined not batch-fatal).

**Status: IMPLEMENTED + committed** on branch `fix/full-go-workstream-a` (`9da68a0`), 662/662 suite green, tsc + guards clean, route 401-smoke verified. Pending deploy + D-15.

---

## 3. Workstream B — Ops / configuration (after Workstream A is deployed)

These are dashboard/UI actions. **B1 and B2 are performed by Arthur** (no Vercel env MCP/CLI is available in this environment); the agent verifies each with the probe listed.

| # | Action | Exact steps | Verification probe |
|---|---|---|---|
| B1 | Restore the operator API channel (BD-06 residual condition) | Run `node scripts/generate-api-key.mjs` locally; in the Vercel dashboard (project avenue-portal → Settings → Environment Variables, scope Production) set `API_KEY=<generated value>` and `OPERATOR_TENANT_ID=cmr3ae8v30000nlvqxrqlfn38` (verify this id first: `SELECT id FROM "Tenant" WHERE slug='medvex'` via Supabase). Redeploy. | Operator key on `GET /api/v1/claims?claimNumber=<known>` → 200 for a Medvex claim; retired `av-slade360-dev-key` still → 401; operator key must NOT read another tenant's data (tenant-bind check). |
| B2 | Platform slug lock for tenant onboarding | Same env screen: `PLATFORM_TENANT_SLUG=medvex`. Redeploy. | `/settings/tenants` works for the medvex SUPER_ADMIN; a foreign-tenant admin → `/unauthorized`. |
| B3 | Enable the fraud gate for the prod tenant (OBS-H1 part a) | Log in to prod as a Medvex admin → `/settings/claim-controls` → tick "require fraud clearance before approval", threshold `MEDIUM`, mode `CLEAR_ALERT_OR_DUAL_APPROVAL` → Save. | The save is audit-logged (old→new). A fraud-flagged claim's adjudication page now shows the OBS-7 blocking-alerts banner. |
| B4 | Verify the WP-A2 schema landed in prod | After the deploy that includes WP-A2, via Supabase MCP: `SELECT column_name FROM information_schema.columns WHERE table_name='Claim' AND column_name='externalRef';` → 1 row. Also confirm the unique index exists: `SELECT indexname FROM pg_indexes WHERE tablename='Claim' AND indexdef ILIKE '%externalRef%';` | Both queries return a row. |
| B5 | N3 sign-off | Circulate `n3_provider_group_matrix.csv` (WP-A6 step 1); on return, run the apply script dry-run, review, then `--apply`. | WP-A6 step 4 probes. |

---

## 4. Workstream C — Residual UAT campaigns

Run via the `/uat` skill, resuming the BB2 engagement (artifacts in `uat/outpatient_vercel/`, prefix new deliverables `FULL_GO_`). Test against prod after the Workstream A deploy. Section numbers refer to `BUSY_TPA_DAY_ADVERSARIAL_RESILIENCE_UAT_TEST_PLAN.md`. Priority order is the GO/NO-GO's:

| # | Campaign | Plan § | Why it's ordered here | Key personas / preconditions |
|---|---|---|---|---|
| C1 | Family K remainder: HR/Fund/Reports adversarial re-test on the fix build; member health-vault doc access (seed a document for a member first); cross-broker foreign-group-detail IDOR (needs a 2nd broker group id) | §19 | Last unfinished slice of the largest prior risk; everything else in K already PASSed | HR persona, fund admin, `broker@kaib.co.ke`, member Noah Kato |
| C2 | Family C — offline capture / reconnect / exactly-once assimilation | §11 | Entirely untested; the plan's primary new campaign | Provider persona + offline pack tooling (`src/lib/offline`, `offline-pack.service`) |
| C3 | Family D — HMS batch UI + case attribution | §12 | Only the API claim-write rail was exercised in BB2 | Staff persona; `/api/v1/hms-batch` + its UI |
| C4 | Family J — membership / endorsement / effective-date hardening | §18 | Money-adjacent eligibility edges | Membership admin persona |
| C5 | Families I + O — settlement under uncertainty, concurrent decisions, session/deploy resilience | §17, §23 | Only SoD + supplementary run proven so far | Two finance personas in parallel sessions |
| C6 | Families F + G — check-in binding, PA/LOU/case lifecycle races | §14, §15 | Race-condition class untouched | Provider + staff personas |
| C7 | Family N — worker/jobs/time (incl. fraud evaluation under worker pause — is `FraudService.evaluateClaim` synchronous on every rail?) | §22 | OBS-H1 gate is only as good as flag creation being reliable | Operator + Supabase log access |
| C8 | Family R — portfolio ops: quotation/binding, billing/admin-fee, bank recon, commission, wallet callbacks, cross-border FX, DSAR, wellness | §26 | Broadest remaining surface, lowest single-item risk | Per-module personas |
| C9 | Scale/load — 2,997-member book under the §5 load portfolio (harness from Outstanding-Conditions Ticket 6) | §5, §25 | GO/NO-GO explicitly lists scale as a surviving condition | Load harness, off-peak window |

Rules carried from the BB2 plan: severity ladder + stop rules (§3), evidence + conservation ledgers (§6), automatic NO-GO conditions (§28), exit criteria (§29). Any new Critical/High found in C1–C9 reverts the standing verdict to NO-GO until fixed and re-proven.

---

## 5. Workstream D — Re-verification gate on the fix build

Run AFTER Workstreams A (deployed) and B. Every probe is black-box against prod. Record in `FULL_GO_REVERIFY_RUN_LOG.md` with response bodies/screenshots.

| # | Item | Probe | Oracle (exact expected) |
|---|---|---|---|
| D-1 | Entry gate: BD-06 | Retired key `av-slade360-dev-key` + a random key, both header forms, on `GET /api/v1/claims` | 401 all four combinations |
| D-2 | Entry gate: BD-07 | Fresh mixed claim (priced 3,500 + uncoded 80,000), attempt approve at 83,500 | Ceiling 3,500; server blocks; `PAY_ABOVE_CONTRACT_RATE` override demanded |
| D-3 | Entry gate: BD-03 / BD-05 / BD-02 | Login as admin + provider persona; create a supplementary run where a settled batch exists; UI rapid double-submit | No 5xx; RUN N+1 created; UI dup blocked with claim number |
| D-4 | BB2-DEF-01 | `POST /api/v1/claims` with `unitCost:-5000`; also `quantity:0` | 400, field-level message; no claim created (GET by any returned number must 404) |
| D-5 | BB2-DEF-02 | `POST` with `diagnoses:[{code:"I10"}]` missing… wrong-shaped variants from the register | 400 with validation message — never 500 |
| D-6 | BB2-DEF-03 | 3 identical POSTs without key; then 2 POSTs with `Idempotency-Key: FULLGO-1` | 201/409/409; then 201 + 200 `duplicate:true` echoing the original claim number; staff queue shows exactly 2 new claims total |
| D-7 | OBS-B7 | Open the D-2 claim's adjudication page | Every "Contracted" figure = 3,500; unpriced-exclusion note visible; no 83,500 anywhere except "billed" |
| D-8 | OBS-H1 (settlement-side fraud probe — required by the GO/NO-GO) | Approve a claim that carries an unresolved MEDIUM+ fraud alert (via override path if approval blocks), then attempt batch creation and Mark Paid | With the B3 setting ON: approval blocked until cleared; if flagged post-approval, batch creation quarantines it (audit lists it) and Mark Paid on a batch containing a flagged claim errors with the fraud message; after resolving the alert, the same actions succeed |
| D-9 | OBS-K1 | ~12 rapid login cycles from one IP | Either logins keep working, or a visible "couldn't reach the sign-in service… wait a minute" message appears within 20s. Never a silent no-op |
| D-10 | OBS-A3 | Open the D-6 API-created claim in the staff UI | DIAGNOSES panel shows the submitted code(s), primary flagged |
| D-11 | N3 (post B5) | Provider A key eligibility probe for a NO-group member and a YES-group member | 404 / 200 respectively |
| D-12 | Operator channel (B1) | Operator key read + write within Medvex; same key against non-Medvex data | 200 in-tenant; 403/404 out-of-tenant; regression: facility keys unaffected |
| D-13 | Money spine smoke | One intake→adjudicate→maker/checker→Mark Paid cycle + GL trial balance | Balanced; only approved amounts post |
| D-14 | FG-C1 (WP-A8) offline pack scope | Issue an offline code for a provider entitled only to the Default Client; unlock the pack | `memberCount` ≈ entitled members only (≤ 249 on current data); **no NWSC member** in the roster; a no-entitlement provider yields an empty roster |
| D-15 | FG-C3/FG-C4 (WP-A9) HMS batch | With a facility-A key: post `facilityCode:<B>`; post own facility; post a `quantity:0` line; force a write-time failure | Facility-B target **rejected**, no B case mutation; own-facility batch applies; `quantity:0` → 400 at validate; write-time failure quarantined (`rejected`+`HMS_BATCH_REJECTED`), batch not aborted |

---

## 6. Full-GO exit checklist

Declare **GO** only when every box is ticked with evidence linked in the run log:

- [ ] WP-A1…WP-A9 merged to `main`, all gates green (`typecheck`, `vitest`, brand+currency guards), deployed (Vercel READY). (All nine — WP-A1…A9 — already committed on branch `fix/full-go-workstream-a`; none outstanding.)
- [ ] B1–B5 completed and verified (operator channel live + scoped; fraud gate ON for Medvex; `externalRef` column + index in prod; N3 matrix applied or signed off as accepted-risk).
- [ ] D-1 … D-15 all PASS with fresh evidence.
- [ ] C1–C9 executed; zero open Critical/High; any new Mediums have a recorded disposition (fix or accepted-risk with owner + date).
- [ ] Conservation tie-out (plan §25) re-run at the end of the C campaigns: every submitted event → exactly one outcome, at most one payment; GL trial balance balanced.
- [ ] Updated `FULL_GO_GO_NO_GO.md` issued with the verdict, signed evidence links, and the surviving-conditions list (should be empty or explicitly accepted).

If any automatic NO-GO condition from plan §28 fires at any point, the standing verdict reverts to NO-GO regardless of checklist progress.

---

## 7. Sequencing summary

```
WP-A1 ─┐
WP-A2 ─┤ (same file as A1 — implement A1 first, A2 on top)
WP-A3 ─┤
WP-A4 ─┤
WP-A5 ─┤
WP-A6 ─┼─→ gates green → push main → Vercel deploy ─→ B1..B4 ─→ D-1..D-15 (entry + Mediums)
WP-A7 ─┤   (WP-A6 scripts; B5 sign-off gates the apply step)  │
WP-A8 ─┤   (offline pack scope; benefits from WP-A6)          ├─→ C1..C9 (residual campaigns)
WP-A9 ─┘   (HMS batch key-binding + per-line quarantine)      │
                                                              └─→ §6 checklist → FULL GO
```
Note: **all nine code work packages (WP-A1…A9) are committed on branch `fix/full-go-workstream-a`** — Workstream A has nothing outstanding. WP-A8 and WP-A9 were added mid-engagement from the C2/C3 assessments (FG-C1, FG-C3/FG-C4). Re-verify probes **D-14** (offline pack excludes NWSC) and **D-15** (HMS batch key-binding + quarantine) cover them on the fix build.

Estimated effort: Workstream A ≈ 1 focused day (A1+A2 are one sitting; A4 the largest). Workstream C ≈ 3–4 tester-days across the nine campaigns. Workstream D ≈ half a day.

---

## 8. Deferred to a follow-up fork (backlog, 2026-07-14)

The Workstream C residual UAT (C5–C8) surfaced a systemic concurrency class (SYS-1). The high/medium
instances were fixed and deployed across WP-A10/A11/A12 (FG-C7, FG-C6, FG-C8, FG-C9, FG-C5 under-block).
The following are **deliberately deferred to a new fork** — each needs a data-model change and/or a product
decision, so they don't belong in the shipped batch:

### WP-B1 (fork) — FG-C10: live benefit-hold expiry
**Problem.** `releaseExpiredHolds` (`preauth-adjudication.service.ts:427`) runs **only** in the worker
(`preauth-escalation.job:78`), and `BenefitUsageService.availableLimit` (`benefit-usage.service.ts:218`)
computes `held` from the stored `activeHoldAmount` with no live `validUntil` check. A down/lagging worker
silently over-reserves benefit (claims wrongly declined "insufficient balance"). It **fails safe** (never
overpays), which is why it was NOT rushed into the batch — the fix touches the core balance calc and a bug
there would *under*-reserve (overspend). **Design carefully:** compute `held` (or a defensive adjustment)
from `benefitHold` rows where `status=ACTIVE AND expiresAt > now()`, reconcile against the stored
`activeHoldAmount`, and prove with tests that it can never yield a *larger* available balance than today
(i.e. never enables overspend). Blast radius: adjudication, PA approval, offline pack, eligibility.

### WP-B2 (fork) — FG-C5 over-block half: point-in-time termination
**Problem.** Eligibility resolves by **current** `member.status`, so a TERMINATED/SUSPENDED member's claim
for a service date when they *were* covered is wrongly declined (J7), and (conversely) there is no
coverage-*end* concept. The under-block half (pre-`enrollmentDate` reject) shipped in WP-A12. This half needs
a **coverage-end / termination-effective-date data model** (a `Member.coverageEndDate` or a membership-period
table) so intake/adjudication can ask "was the member covered *on the service date*", not "are they covered
now". **Product decision required:** is point-in-time termination in scope, and what is the coverage-history
model? Then gate `dateOfService` within `[enrollmentDate, coverageEndDate]`.

### WP-B3 (fork) — SYS-1 remnants: binding & amendment
The C8 spot-check found the same check-then-act pattern in `binding.service.ts` (quotation
`status!=="SENT"`/`"ACCEPTED"` → `update`, lines 46/140 → concurrent quote-accept/double-bind) and
`amendment.service.ts` (endorsement `status!=="DRAFT"` → `update`, line 222). Apply the WP-A10/A11 atomic
status-claim pattern (`updateMany({ where:{ id, status:{ in:[…] } } }) → count===1 else throw`). Also worth a
one-off **audit sweep** of every `findUnique → validate status → update({ where:{ id } })` on a state machine.

### Residual UAT not run (needs env/load control)
- **Family F** — check-in / encounter binding (one-time, time-bound, facility-bound challenge; replay/expiry/cross-facility).
- **Family N worker-pause war-game** (N4–N7) — pause the worker in an approved UAT env; verify degraded-state
  is surfaced in the UI, backlog drains exactly-once, restart doesn't double-register, and the time edges
  (Africa/Kampala midnight, month/year end, leap day, clock skew).
- **Family R** (full per-module) — billing/admin-fee, bank recon, commission payout, wallet callbacks,
  cross-border FX, DSAR, wellness/health-vault.
- **C9 scale** — the 2,997-member book under the §5 load portfolio (Outstanding-Conditions Ticket 6 harness),
  off-peak. Standing scale condition in the verdict until run.
