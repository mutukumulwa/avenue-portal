/**
 * F2.1 — private document metadata + upload-intent schema.
 *
 * Pure block: target-type constraints. DB block (opt-in): the schema guarantees
 * one intent finalizes to at most one document (Document.uploadIntentId unique).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ProviderDocumentService, ProviderDocumentError } from "@/server/services/provider-document.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe("F2.1 target-type constraints (pure)", () => {
  it("rejects an unknown target type", () => {
    expect(() => ProviderDocumentService.assertProviderUploadTarget("NONSENSE", "PROVIDER_USER")).toThrow(ProviderDocumentError);
  });
  it("rejects a provider upload to a non-provider (legacy) target", () => {
    expect(() => ProviderDocumentService.assertProviderUploadTarget("GROUP", "PROVIDER_USER")).toThrow(/not upload/i);
    expect(() => ProviderDocumentService.assertProviderUploadTarget("QUOTATION", "PROVIDER_API")).toThrow(ProviderDocumentError);
  });
  it("allows a provider upload to CLAIM/PREAUTH/CASE and info-request/reconsideration/payment-query", () => {
    for (const t of ["CLAIM", "PREAUTH", "CASE", "INFORMATION_REQUEST", "RECONSIDERATION", "PAYMENT_QUERY", "PROFILE_CHANGE"]) {
      expect(() => ProviderDocumentService.assertProviderUploadTarget(t, "PROVIDER_USER")).not.toThrow();
    }
  });
  it("allows an OPERATOR/MEMBER source to a legacy target (not provider-restricted)", () => {
    expect(() => ProviderDocumentService.assertProviderUploadTarget("GROUP", "OPERATOR")).not.toThrow();
    expect(() => ProviderDocumentService.assertProviderUploadTarget("MEMBER_HEALTH", "MEMBER")).not.toThrow();
  });
});

describe.skipIf(!URL_SET)("F2.1 schema finalize-once guarantee (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let world: import("../factories/provider-network").ProviderWorld;
  const ids: string[] = [];
  let intentId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    const intent = await prisma.documentUploadIntent.create({
      data: { tenantId: world.tenants.alpha.id, targetType: "CLAIM", targetId: "claim-x", sourceType: "PROVIDER_USER", sourceActorId: world.users.a.biller.id, maxSizeBytes: 1_000_000, token: `tok-${world.token}`, expiresAt: new Date(Date.now() + 600_000) },
    });
    intentId = intent.id;
  });

  afterAll(async () => {
    if (!world) return;
    await prisma.document.deleteMany({ where: { id: { in: ids } } });
    await prisma.documentUploadIntent.deleteMany({ where: { id: intentId } });
    await world.teardown();
  });

  it("validates + pushes and rejects a second document for the same intent", async () => {
    const d1 = await prisma.document.create({ data: { fileName: "a.pdf", fileUrl: "x", category: "CLAIM_SUPPORT", tenantId: world.tenants.alpha.id, uploadIntentId: intentId, scanStatus: "PENDING" } });
    ids.push(d1.id);
    // a second document claiming the same intent violates the unique constraint
    await expect(
      prisma.document.create({ data: { fileName: "b.pdf", fileUrl: "y", category: "CLAIM_SUPPORT", tenantId: world.tenants.alpha.id, uploadIntentId: intentId, scanStatus: "PENDING" } }),
    ).rejects.toThrow();
  });

  it("legacy documents (null scanStatus) remain valid rows (readable during migration)", async () => {
    const legacy = await prisma.document.create({ data: { fileName: "legacy.pdf", fileUrl: "http://old/x", category: "CLAIM_SUPPORT" } });
    ids.push(legacy.id);
    expect(legacy.scanStatus).toBeNull(); // legacy = no scan regime yet
    expect(legacy.fileUrl).toBe("http://old/x");
  });
});
