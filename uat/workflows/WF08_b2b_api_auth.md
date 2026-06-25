# Workflow: W8 (B2B API) + §7 Security — `/api/v1/*` API-key gate

## Test objective
Verify the B2B provider API (`/api/v1/*`, Slade360/SMART integration) enforces its API key: rejects missing/invalid keys, and — per the plan's Go/No-Go checklist and §7 — **rejects the default development key `av-slade360-dev-key` in production**. Acceptance of the default key is rated **Critical** by the plan (anyone can read member PHI/PII and inject claims/preauths).

## Preconditions
Live deployment reachable. This is the **only** part of the plan that is fully testable without a login, because the gate is a stateless header check (`src/lib/apiAuth.ts`). Tests use **empty or deliberately bogus inputs** so authentication can be probed without creating data or reading any real member's record.

## User roles involved
External B2B caller (no portal session). Non-destructive.

## Environment
`https://avenue-portal.vercel.app` · 2026-06-25 ~02:34–02:38 UTC · method: `curl`, no redirect-follow, empty/bogus bodies.

## Step-by-step execution log

| Step | Action performed | Test data | Expected result | Actual result | Status | Evidence |
|---|---|---|---|---|---|---|
| 8.8a | POST `/api/v1/claims` with **no** key | body `{}` | 401 Unauthorized | **HTTP 401** `{"error":"Unauthorized. Invalid or missing API Key."}` | ✅ PASS | network_logs/POST_claims_nokey.body.json |
| 8.8b | POST `/api/v1/claims` with **wrong** key | `x-api-key: totally-wrong-key-uat`, `{}` | 401 Unauthorized | **HTTP 401** same body | ✅ PASS | network_logs/POST_claims_wrongkey.body.json |
| 8.8c | POST `/api/v1/claims` with **default dev key** | `x-api-key: av-slade360-dev-key`, `{}` | **401 in production** (key must be overridden) | **HTTP 400** `{"error":"Missing required fields: …"}` — **auth PASSED** | 🔴 **FAIL (Critical)** | network_logs/POST_claims_devkey.body.json |
| 8.8d | No-key gate across all endpoints | eligibility/benefits (GET, bogus member), preauth/upload/claims (POST, `{}`) | all 401 | eligibility 401, benefits 401, preauth 401, upload 401, claims 401 | ✅ PASS | network_logs/01_api_auth_matrix.txt |
| 8.8e | Default dev key across all endpoints | dev key + bogus/empty inputs | all 401 | eligibility **500**, benefits **500**, preauth **400**, claims **400**, upload **401** | 🔴 **FAIL (Critical)** for 4/5 | network_logs/01_api_auth_matrix.txt |

### Interpretation
- **No key / wrong key → 401 everywhere.** The auth wrapper works in principle. ✅
- **Default dev key → non-401 on `eligibility`, `benefits`, `preauth`, `claims`.** A non-401 means the request **passed authentication** and reached business logic (400 = "missing fields"; 500 = handler error on a bogus member). Therefore **`process.env.API_KEY` is unset in production** and `validateApiKey()` falls back to the committed default `"av-slade360-dev-key"` (`src/lib/apiAuth.ts:7`). The key is public in source. **Critical.**
- **`upload` returned 401 to the dev key** only because that route reads a *different* header (`authorization`, not `x-api-key`) and uses a *different* default (`"av-local-secret"`, `src/app/api/v1/upload/route.ts:9`). This is an inconsistency, not a fix — since `API_KEY` is unset, `upload` would accept `authorization: …av-local-secret…`. **That path was deliberately NOT tested** (it performs a MinIO write / external side effect).

## Defects found
- **DEF-001 (Critical)** — Default dev API key `av-slade360-dev-key` accepted in production on `/api/v1/{eligibility,benefits,preauth,claims}`. Enables unauthenticated-in-practice read of member eligibility/benefits (PHI/PII) and injection of preauths/claims. Fails Go/No-Go item: *"B2B API rejects missing/invalid/default keys; production key is set and not the dev default."*
- **DEF-002 (Medium)** — `GET /api/v1/eligibility` and `/api/v1/benefits` return **HTTP 500 `{"error":"Internal Server Error"}`** for a non-existent member, although the code intends **404 `{"error":"Member not found"}`** (`eligibility/route.ts:22-24`). Indicates an unhandled error path on a public read endpoint (poor error handling; possibly a broken read path in the deployed build).
- **DEF-003 (Low/Medium)** — Inconsistent API auth: `upload` uses header `authorization` + default `av-local-secret`; the others use `x-api-key`/`authorization` + default `av-slade360-dev-key`. Two different insecure defaults; harder to rotate/secure consistently.

## Partial failures or concerns
- The **eligibility/403 path** for a SUSPENDED/LAPSED/TERMINATED member (plan step 8.9) and the **400 field-list** path (8.10) could not be fully exercised without using a real member number (would read/affect real data). Only the auth layer and missing-field paths were tested.

## Screenshots / evidence references
- `../evidence/network_logs/00_probe_summary.txt` (section D)
- `../evidence/network_logs/01_api_auth_matrix.txt`
- `../evidence/network_logs/POST_claims_nokey.body.json`, `POST_claims_wrongkey.body.json`, `POST_claims_devkey.body.json`

## Notes for retest
With a properly seeded staging tenant and `API_KEY` set: re-run 8.7–8.10 fully (valid key happy path, 403 ineligible member, 400 field validation), confirm the dev key now returns 401 on **all five** endpoints, confirm `upload` rejects `av-local-secret`, and confirm the key is not written to logs.
