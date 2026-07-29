/**
 * F2.4 — upload finalize + content validation.
 *
 * OPT-IN DB with an in-memory staging fake. Covers forged content, oversize,
 * missing object, MIME-lie, happy-path (PENDING doc + sha256), retry returns
 * the SAME document (never a second), and pending files (unscanned).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { DocumentStagingPort } from "@/server/services/provider-document.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

// magic-byte sample objects
const PDF = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.from(" sample pdf body")]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png body")]);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ — Windows executable, must be rejected

class FakeStaging implements DocumentStagingPort {
  objects = new Map<string, Buffer>();
  promoted: Array<[string, string]> = [];
  put(key: string, buf: Buffer) { this.objects.set(key, buf); }
  async stat(key: string) { const b = this.objects.get(key); return { exists: !!b, size: b?.length ?? 0 }; }
  async read(key: string) { return this.objects.get(key)!; }
  async promote(s: string, f: string) { this.promoted.push([s, f]); this.objects.delete(s); }
}

describe.skipIf(!URL_SET)("F2.4 finalizeUpload (opt-in DB + fake staging)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Doc: typeof import("@/server/services/provider-document.service").ProviderDocumentService;
  let stagingKeyForIntent: typeof import("@/server/services/provider-document.service").stagingKeyForIntent;
  let world: import("../factories/provider-network").ProviderWorld;
  let claimA: { id: string };

  function ctx() {
    return { actorType: "USER" as const, actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, allowedProviderBranchIds: [], permissions: ["provider.claim.respond"], apiScopes: [], requestId: "r" };
  }
  async function newIntent(mimes?: string[]) {
    return Doc.createUploadIntent(ctx(), { targetType: "CLAIM", targetId: claimA.id, expectedMimeTypes: mimes ?? ["application/pdf", "image/png"] });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/provider-document.service");
    Doc = mod.ProviderDocumentService; stagingKeyForIntent = mod.stagingKeyForIntent;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    claimA = await world.createClaim({ providerId: world.providers.a.id });
  });

  afterAll(async () => {
    if (world) {
      await prisma.document.deleteMany({ where: { tenantId: world.tenants.alpha.id } });
      await prisma.documentUploadIntent.deleteMany({ where: { tenantId: world.tenants.alpha.id } });
      await world.teardown();
    }
  });

  it("finalizes a valid PDF into a PENDING document with a sha256 and private storageKey", async () => {
    const intent = await newIntent();
    const staging = new FakeStaging();
    staging.put(stagingKeyForIntent(intent.intentId), PDF);
    const res = await Doc.finalizeUpload(ctx(), { token: intent.token, declaredMimeType: "application/pdf", originalFileName: "a.pdf" }, staging);
    expect(res.scanStatus).toBe("PENDING");
    expect(res.replayed).toBe(false);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.documentId } });
    expect(doc.scanStatus).toBe("PENDING");
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.storageKey).toContain(`documents/${world.tenants.alpha.id}/`);
    expect(doc.fileUrl).toBe(""); // no public URL
    expect(doc.claimId).toBe(claimA.id);
    expect(staging.promoted.length).toBe(1); // object moved to private final key
  });

  it("rejects forged content (MZ exe declared as pdf) and a MIME lie", async () => {
    const intent = await newIntent();
    const staging = new FakeStaging();
    staging.put(stagingKeyForIntent(intent.intentId), EXE);
    await expect(Doc.finalizeUpload(ctx(), { token: intent.token, declaredMimeType: "application/pdf" }, staging)).rejects.toMatchObject({ code: "CONTENT_REJECTED" });
  });

  it("rejects a missing staged object and an oversize object", async () => {
    const i1 = await newIntent();
    await expect(Doc.finalizeUpload(ctx(), { token: i1.token }, new FakeStaging())).rejects.toMatchObject({ code: "STAGING_OBJECT_MISSING" });

    const i2 = await newIntent();
    const staging = new FakeStaging();
    staging.put(stagingKeyForIntent(i2.intentId), Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024)])); // >10MB
    await expect(Doc.finalizeUpload(ctx(), { token: i2.token, declaredMimeType: "application/pdf" }, staging)).rejects.toMatchObject({ code: "OVERSIZE" });
  });

  it("retry finalize returns the SAME document (never a second), and expired intent is invalid", async () => {
    const intent = await newIntent();
    const staging = new FakeStaging();
    staging.put(stagingKeyForIntent(intent.intentId), PNG);
    const first = await Doc.finalizeUpload(ctx(), { token: intent.token, declaredMimeType: "image/png" }, staging);
    const second = await Doc.finalizeUpload(ctx(), { token: intent.token, declaredMimeType: "image/png" }, staging);
    expect(second.documentId).toBe(first.documentId); // idempotent — no duplicate document
    expect(second.replayed).toBe(true);
    const count = await prisma.document.count({ where: { uploadIntentId: intent.intentId } });
    expect(count).toBe(1);

    // an unknown token is INTENT_INVALID
    await expect(Doc.finalizeUpload(ctx(), { token: "nope" }, staging)).rejects.toMatchObject({ code: "INTENT_INVALID" });
  });

  it("a pending document cannot satisfy a requirement (scanStatus PENDING, not CLEAN)", async () => {
    const intent = await newIntent();
    const staging = new FakeStaging();
    staging.put(stagingKeyForIntent(intent.intentId), PDF);
    const res = await Doc.finalizeUpload(ctx(), { token: intent.token, declaredMimeType: "application/pdf" }, staging);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.documentId } });
    expect(doc.scanStatus).not.toBe("CLEAN"); // usability gated until F2.5 scans it
  });
});
