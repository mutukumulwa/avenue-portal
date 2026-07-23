/**
 * F2.6 — authorized document download.
 *
 * OPT-IN DB with a fake presign port. A CLEAN doc on the caller's own target
 * yields a minute-scale signed URL; cross-provider/branch/permission denied;
 * PENDING/QUARANTINED denied; the URL carries an expiry (no permanent URL); a
 * document is only reachable through its OWN target.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DOCUMENT_DOWNLOAD_TTL_SECONDS, type DocumentDownloadPort } from "@/server/services/provider-document.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

const fakePort: DocumentDownloadPort = {
  async presignRead(key, ttl) { return { url: `https://signed.example/${encodeURIComponent(key)}?exp=${ttl}&sig=abc`, expiresAt: new Date(Date.now() + ttl * 1000) }; },
};

describe.skipIf(!URL_SET)("F2.6 authorizeDownload (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Doc: typeof import("@/server/services/provider-document.service").ProviderDocumentService;
  let world: import("../factories/provider-network").ProviderWorld;
  let claimA: { id: string }, claimAbranch: { id: string }, claimB: { id: string };
  const docIds: string[] = [];

  function ctx(perms: string[], branches: string[], providerId?: string) {
    return { actorType: "USER" as const, actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id, providerId: providerId ?? world.providers.a.id, allowedProviderBranchIds: branches, permissions: perms, apiScopes: [], requestId: "r" };
  }
  async function doc(opts: { claimId?: string; scanStatus: string; providerId: string; branchId?: string | null }) {
    const d = await prisma.document.create({ data: { fileName: "d", fileUrl: "", category: "CLAIM_SUPPORT", tenantId: world.tenants.alpha.id, providerId: opts.providerId, providerBranchId: opts.branchId ?? null, claimId: opts.claimId, storageKey: `documents/${world.tenants.alpha.id}/${Math.random()}`, scanStatus: opts.scanStatus as never } });
    docIds.push(d.id); return d;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Doc = (await import("@/server/services/provider-document.service")).ProviderDocumentService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    claimA = await world.createClaim({ providerId: world.providers.a.id });
    claimAbranch = await world.createClaim({ providerId: world.providers.a.id, branchId: world.branches.a1.id });
    claimB = await world.createClaim({ providerId: world.providers.b.id });
  });

  afterAll(async () => {
    if (world) { await prisma.document.deleteMany({ where: { id: { in: docIds } } }); await world.teardown(); }
  });

  it("CLEAN doc on own claim → short-lived signed URL (no permanent/public URL)", async () => {
    const d = await doc({ claimId: claimA.id, scanStatus: "CLEAN", providerId: world.providers.a.id });
    const res = await Doc.authorizeDownload(ctx(["provider.claim.read"], []), { documentId: d.id }, fakePort);
    expect(res.url).toContain("signed.example");
    const ttlMs = res.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeLessThanOrEqual(DOCUMENT_DOWNLOAD_TTL_SECONDS * 1000 + 1000);
    expect(ttlMs).toBeGreaterThan(0); // has an expiry — not permanent
  });

  it("PENDING and QUARANTINED documents are DOCUMENT_NOT_AVAILABLE", async () => {
    const pending = await doc({ claimId: claimA.id, scanStatus: "PENDING", providerId: world.providers.a.id });
    const quar = await doc({ claimId: claimA.id, scanStatus: "QUARANTINED", providerId: world.providers.a.id });
    await expect(Doc.authorizeDownload(ctx(["provider.claim.read"], []), { documentId: pending.id }, fakePort)).rejects.toMatchObject({ code: "DOCUMENT_NOT_AVAILABLE" });
    await expect(Doc.authorizeDownload(ctx(["provider.claim.read"], []), { documentId: quar.id }, fakePort)).rejects.toMatchObject({ code: "DOCUMENT_NOT_AVAILABLE" });
  });

  it("cross-provider (doc on B's claim) is safe NOT_FOUND; missing permission FORBIDDEN_PERMISSION", async () => {
    const dB = await doc({ claimId: claimB.id, scanStatus: "CLEAN", providerId: world.providers.b.id });
    // caller is provider A → B's claim not resolvable → NOT_FOUND
    await expect(Doc.authorizeDownload(ctx(["provider.claim.read"], []), { documentId: dB.id }, fakePort)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // own doc but no permission
    const dA = await doc({ claimId: claimA.id, scanStatus: "CLEAN", providerId: world.providers.a.id });
    await expect(Doc.authorizeDownload(ctx([], []), { documentId: dA.id }, fakePort)).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
  });

  it("branch-scoped target denies without the branch, allows with it", async () => {
    const d = await doc({ claimId: claimAbranch.id, scanStatus: "CLEAN", providerId: world.providers.a.id, branchId: world.branches.a1.id });
    await expect(Doc.authorizeDownload(ctx(["provider.claim.read"], []), { documentId: d.id }, fakePort)).rejects.toMatchObject({ code: "FORBIDDEN_BRANCH" });
    const ok = await Doc.authorizeDownload(ctx(["provider.claim.read"], [world.branches.a1.id]), { documentId: d.id }, fakePort);
    expect(ok.url).toBeTruthy();
  });
});
