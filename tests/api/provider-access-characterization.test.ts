/**
 * F0.2 (Provider Network OS) — CHARACTERIZATION of the current provider-access
 * boundaries that the pre-existing scope tests do NOT already cover.
 *
 * Already proven elsewhere (referenced, not duplicated):
 *   - cross-provider + client-entitlement + operator span on the read APIs:
 *       tests/api/provider-read-scope.test.ts
 *   - PA API provider scope:            tests/api/provider-preauth-scope.test.ts
 *   - operator-key fail-closed (BD-06):  tests/api/api-auth-operator-key.test.ts
 *
 * This suite pins the boundaries the spec's F0.2 names that are currently WEAK
 * or ABSENT, so their owning package (named per block) has a red line to flip:
 *   - UPLOAD: /api/v1/upload authorizes NO target and validates NO content
 *     (spec gap #7/#8; owner F2.3/F2.4).
 *   - BRANCH: no branch dimension exists anywhere in provider scoping
 *     (spec gap #4; owner F1.2/F1.3).
 *   - PERMISSION: provider access is role+provider binding only, no granular
 *     permission (spec gap #4/#5; owner F1.1/F1.5/F1.6).
 *
 * These assertions encode CURRENT behavior. When the owning package lands, the
 * assertion is expected to FLIP (documented inline with `CHARACTERIZATION →`).
 * They are pure/mock-based: deterministic, CI-safe, no database required —
 * matching the tests/api/ convention.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiCredential } from "@/lib/apiAuth";

// ── mock seam: storage + credential + prisma, mirroring provider-read-scope.test.ts ──
const store = vi.hoisted(() => ({ uploaded: [] as { name: string; type: string }[], nextUrl: "" }));
const cred = vi.hoisted(() => ({ current: null as ApiCredential | null }));
const db = vi.hoisted(() => ({ contractApplicability: { findMany: vi.fn(async () => [] as unknown[]) } }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

vi.mock("@/lib/minio", () => ({
  uploadFile: vi.fn(async (_buf: Buffer, name: string, type: string) => {
    store.uploaded.push({ name, type });
    // mirrors the real adapter: a permanent, public, bucket-relative URL
    store.nextUrl = `http://localhost:9000/aicare-documents/${Date.now()}-x.bin`;
    return store.nextUrl;
  }),
}));

vi.mock("@/lib/apiAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apiAuth")>();
  return {
    ...actual,
    withApiKey: (h: (req: Request, ...a: unknown[]) => Promise<Response>) => h,
    getApiCredential: vi.fn(async () => cred.current),
  };
});

import { POST as postUpload } from "@/app/api/v1/upload/route";
import { ProviderEntitlementService } from "@/server/services/provider-entitlement.service";

const providerCred = (id: string): ApiCredential => ({ kind: "provider", tenantId: "tenant-1", providerId: id, keyId: `k-${id}` });

// Duck-typed Request: the route only calls `await req.formData()` then
// `.get("file")`/`.get(field)` and `file.arrayBuffer()`. Building a real
// multipart Request trips undici's File webidl check under jsdom, so we supply
// the minimal surface the handler actually consumes.
function uploadReq(fileName: string | null, type: string, extra: Record<string, string> = {}) {
  const file = fileName === null
    ? null
    : { name: fileName, type, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
  const map = new Map<string, unknown>(Object.entries(extra));
  if (file) map.set("file", file);
  return { formData: async () => ({ get: (k: string) => map.get(k) ?? null }) } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.uploaded = [];
  store.nextUrl = "";
  cred.current = null;
});

describe("F0.2 UPLOAD boundary — /api/v1/upload (spec gap #7/#8; owner F2.3/F2.4)", () => {
  it("characterization_any_valid_provider_key_uploads_with_no_target_and_gets_a_public_url", async () => {
    cred.current = providerCred("provider-B");
    // A claimId belonging to a DIFFERENT provider is supplied — the route never
    // looks at it. CHARACTERIZATION → F2: finalize must authorize the target and
    // bind the object to a scoped, private Document; today there is no target
    // check and the URL is world-readable.
    const res = await postUpload(uploadReq("scan.bin", "application/octet-stream", { claimId: "claim-owned-by-provider-A" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toContain("/aicare-documents/"); // permanent public bucket URL
    expect(store.uploaded).toHaveLength(1);
    // No Document row, no target authorization, no scan gate exists on this path.
    expect(body.documentId).toBeUndefined();
  });

  it("characterization_upload_accepts_arbitrary_content_type_no_allowlist_no_size_gate", async () => {
    cred.current = providerCred("provider-A");
    // An executable masquerading by MIME — the B2B route has NO type allowlist and
    // NO size cap (unlike /api/upload). CHARACTERIZATION → F2.4 must reject on
    // detected MIME + size + scan.
    const res = await postUpload(uploadReq("payload.exe", "application/x-msdownload"));
    expect(res.status).toBe(201);
    expect(store.uploaded[0].type).toBe("application/x-msdownload");
  });

  it("missing_file_is_the_only_thing_the_upload_route_rejects", async () => {
    cred.current = providerCred("provider-A");
    const res = await postUpload(uploadReq(null, ""));
    expect(res.status).toBe(400);
  });
});

describe("F0.2 BRANCH boundary — absent everywhere (spec gap #4; owner F1.2/F1.3)", () => {
  it("characterization_entitlement_scope_has_no_branch_dimension", async () => {
    // The only member-scoping primitive today keys on providerId alone. There is
    // no allowed-branch set in the signature or the produced where-fragment.
    // CHARACTERIZATION → F1.3 ProviderAccessContext adds allowedProviderBranchIds
    // and F1.11 threads branch into eligibility scope.
    expect(ProviderEntitlementService.entitledMemberWhere.length).toBeLessThanOrEqual(2); // (providerId, now?=Date) — no branch arg
    const where = await ProviderEntitlementService.entitledMemberWhere("provider-A");
    expect(JSON.stringify(where)).not.toMatch(/branch/i);
  });
});

// PERMISSION boundary (spec gap #4/#5) is characterized structurally in
// docs/provider-network-os/PROVIDER_ROUTE_INVENTORY.md §1: the PROVIDER gate is
// the single PROVIDER_USER role (src/lib/rbac.ts:42) and
// src/app/provider/api-keys/actions.ts:8-47 mints/revokes credentials behind
// requireProvider() alone — no provider.api_keys.manage permission. It is not
// re-asserted as a unit test here because importing @/lib/rbac pulls the
// next-auth graph (next/server) which does not resolve under the jsdom test env;
// the fact is a code-shape constant, and F1.1 will add the catalog + a seed test.
