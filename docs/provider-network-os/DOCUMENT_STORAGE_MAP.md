# F0.4 — Document Storage and Consumer Map (characterized 2026-07-23)

**Branch/commit:** `feat/provider-network-os` @ `a7e1ddb`
**Scope:** object storage config, document models, every upload surface, every URL consumer, current authorization per target type, migration-count queries. Read-only — **no bucket policy changed** (package stop condition).

---

## 1. Storage layer (`src/lib/minio.ts` — the only storage adapter)

| Fact | Evidence |
|---|---|
| Single bucket `aicare-documents`, MinIO | `minio.ts:12` |
| **Bucket policy = PUBLIC READ** (`s3:GetObject`, `Principal:{AWS:["*"]}`, whole-bucket resource) applied by `ensureBucket()` on first touch | `minio.ts:14-36` |
| Object keys: `<Date.now()>-<Math.random().toString(36).substring(7)>.<ext>` — timestamp + ~5-char base36; **guessability is the only protection** | `minio.ts:41-42` |
| Returned URL is **permanent and public**: `http(s)://<NEXTAUTH_URL host>:9000/aicare-documents/<key>` | `minio.ts:49-52` |
| API surface: `uploadFile` + `ensureBucket` ONLY — **no presigned GET, no delete, no stat** ⇒ every consumer necessarily uses the raw public URL | whole file (52 lines) |
| Credentials default to `minioadmin/minioadmin` when env unset | `minio.ts:8-9` |

## 2. Document data models

### `Document` (`prisma/schema.prisma:4567`)
- **No `tenantId`. No `providerId`/`providerBranchId`.** Polymorphic nullable FKs: `groupId`, `endorsementId`, `claimId`, `preauthId`, `caseId`, `brokerId`, `quotationId`.
- `fileUrl` (public URL as truth — no storage key), declared `mimeType` only (no detected MIME), no `sha256`, no scan status, no source-actor type (free-text `uploadedBy`), no supersession/retention fields.
- Against spec §7.4: every canonical field except size/name/category is missing → F2.1 is **additive schema** work, not adjustment.

### `MemberHealthFile` (`prisma/schema.prisma:1315`)
- Better modeled: has `tenantId`, `memberId`, `visibility` (default `PRIVATE`), `shares` (`MemberHealthShare`) — but still stores a **public `fileUrl`**, so "PRIVATE" is metadata-only; the object itself is world-readable with the URL.

### Deletion behavior
- `grep document.delete/healthFile.delete/removeObject` → **zero sites**. Nothing hard-deletes documents or objects (D28-compatible; also means no cleanup job exists for abandoned objects).

## 3. Upload surfaces (complete)

| # | Surface | Auth | Validation | Record created | Target binding |
|---|---|---|---|---|---|
| U1 | `POST /api/upload` (session) | any authenticated session | MIME allowlist (PDF/images/Word/Excel) + 10MB (`route.ts:6-17,38-49`) | `Document` | **`claimId`/`preauthId`/`groupId`/`endorsementId` accepted from form data with ZERO ownership/existence validation** (`route.ts:60-67`) — any session user can attach to any record ID, incl. cross-tenant (model has no tenantId to even check) |
| U2 | `POST /api/v1/upload` (B2B) | `withApiKey` — **any** provider's key or operator | **NONE** (no type, no size cap) | **NONE** — returns raw URL only (`route.ts:15-31`); orphan object, no evidence trail | none |
| U3 | Member health-vault actions (`member/health-vault/actions.ts:68,159`) | member session | (member-scoped by service) | `MemberHealthFile` | member self |
| — | `FileUpload.tsx` client component | → posts to U1 | — | — | passes through U1's unvalidated IDs |

## 4. Consumer inventory (every `fileUrl` read in `src/`)

**Direct-link render/download consumers (browser `<a href={fileUrl}>`):**

| Consumer | Target type | Audience |
|---|---|---|
| `components/ui/DocumentList.tsx:49` (shared list w/ Download link) | any Document | wherever embedded |
| `(admin)/claims/[id]/ClaimDocuments.tsx` | claim docs | admin |
| `(admin)/preauth/[id]/PreAuthDocuments.tsx` + `page.tsx:198` (health shares) | PA docs + shared vault files | admin |
| `(admin)/members/[id]/onboarding/page.tsx:189` | onboarding docs | admin |
| `(admin)/check-ins/[id]/page.tsx:188`, `check-ins/visit/[id]/page.tsx:106` | shared vault files | admin |
| `(admin)/providers/[id]/page.tsx:304` | shared vault files | admin |
| `(hr)/hr/endorsements/[id]/page.tsx:107` | endorsement docs | HR portal |
| `member/documents/page.tsx:87`, `member/preauth/[id]/page.tsx:214`, `member/health-vault/page.tsx:322` | member docs/shares/vault | member |
| **Provider portal: NONE** — provider claim detail renders no documents section (route inventory §1); providers can neither see nor upload claim/PA documents today | — | — |

**Service/API consumers:**

| Consumer | Behavior |
|---|---|
| `member-app.service.ts:712,818,839,855`, `member-preauth.service.ts:149,164`, `secure-checkin.service.ts:160` | serialize `fileUrl` into member/check-in payloads |
| `trpc/routers/intake.ts:58-60` → `intake.service.ts:158` | `parseCensusFile(input.fileUrl)` — **server-side `fetch()` of a caller-supplied arbitrary URL** (`z.string().url()`), admin-authenticated ⇒ SSRF surface (spec §15.5) |
| `quotation-builder.service.ts:331,431` | server-side `fetch()` of stored model-file URLs |
| `trpc/routers/contracts.ts:299-307`, `quotations.ts:155`, `onboarding.service.ts:93-106` | store caller-supplied `fileUrl` strings into records |
| `claim-autopilot/evaluate.ts:113` | **counter-example (good):** documents gate reads category metadata only, "never fetches `fileUrl` (no SSRF, §11.5)" |

**Email:** no attachment mechanism exists (grep across notification/email services) — emails are text-only today (escalation job sends member name in body text; PHI-in-email hygiene is a F4.8 concern, not an attachment concern).

## 5. Current access matrix per target type (who can VIEW today)

Because the bucket is public-read and URLs are permanent: **effective viewer set for every stored object = anyone holding the URL, unauthenticated.** The app-level matrices below only describe who gets *handed* the URL:

| Target | Upload (app path) | URL handed to |
|---|---|---|
| Claim doc | admin UI (U1) | admin claims detail |
| PA doc | admin UI (U1) | admin PA detail; member PA detail (via shares) |
| Case doc | FK exists; no UI consumer found | — |
| Group/endorsement/onboarding | admin/HR (U1) | admin + HR pages |
| Broker/quotation | admin flows | admin |
| Member vault file | member (U3) | member + admin (shares) + check-in surfaces |
| B2B upload (U2) | any API key | caller only (orphan — no record) |

## 6. Migration inputs (F2.7/F11 gate) — queries to run per environment

Counts require DB access (not run from this workstation — no sanctioned prod read). Run read-only when F2.7 batches start:

```sql
SELECT COUNT(*), COUNT("tenantId") FILTER (WHERE false) AS has_no_tenant FROM "Document";
SELECT category, COUNT(*) FROM "Document" GROUP BY 1 ORDER BY 2 DESC;
SELECT
  COUNT(*) FILTER (WHERE "claimId" IS NOT NULL)  AS claim_docs,
  COUNT(*) FILTER (WHERE "preauthId" IS NOT NULL) AS preauth_docs,
  COUNT(*) FILTER (WHERE "caseId" IS NOT NULL)   AS case_docs,
  COUNT(*) FILTER (WHERE "groupId" IS NOT NULL)  AS group_docs,
  COUNT(*) FILTER (WHERE "endorsementId" IS NOT NULL) AS endorsement_docs,
  COUNT(*) FILTER (WHERE "brokerId" IS NOT NULL) AS broker_docs,
  COUNT(*) FILTER (WHERE "quotationId" IS NOT NULL) AS quotation_docs,
  COUNT(*) FILTER (WHERE COALESCE("claimId","preauthId","caseId","groupId","endorsementId","brokerId","quotationId") IS NULL) AS orphan_docs
FROM "Document";
SELECT COUNT(*) FROM "MemberHealthFile";
SELECT DISTINCT split_part("fileUrl", '/aicare-documents/', 1) AS url_prefix FROM "Document" LIMIT 20;
```

Plus object-store side: `mc ls --recursive` count vs `Document` + `MemberHealthFile` row count → orphan-object estimate (U2 uploads have no rows by construction).

## 7. What F2 inherits (gate B input)

1. F2.1 additive schema: everything in spec §7.4 is missing on `Document`; `MemberHealthFile` needs storageKey/scan/hash alignment or explicit exclusion.
2. F2.2 authorization: no target-load authorization exists anywhere; build from `ProviderAccessContext` + per-target loaders.
3. F2.6 download: no presigned/streaming path exists — build minute-scale signed access; DocumentList/every `<a href>` consumer migrates in F2.8 groups (9 consumer groups enumerated in §4).
4. F2.9 public-access removal blocked until §4 consumers + §6 legacy backfill complete; **break-glass**: keep `ensureBucket` from re-applying the public policy (it re-applies on every upload of a fresh bucket).
5. U2 (`/api/v1/upload`) should be characterized as REPLACE (no record, no validation, no target) — its successor is the F2.3/F2.4 intent+finalize flow; U1's unvalidated target IDs close in F2.2.
6. SSRF: `intake.parseCensusFile` arbitrary-URL fetch must be constrained when F2 touches these flows (allowlist to own storage host) — record for F9 SSRF policy too.
