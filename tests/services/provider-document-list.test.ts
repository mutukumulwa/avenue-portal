/**
 * F2.8 — provider document consumer (authorized list).
 *
 * Pure block: safe scan labels. DB block (opt-in): the list authorizes the
 * target, exposes NO fileUrl/storageKey, links only CLEAN documents to the
 * authorized download route, labels non-clean/legacy safely, and denies a
 * caller without permission / another provider's claim.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { safeScanLabel } from "@/server/services/provider-document.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe("F2.8 safeScanLabel (pure)", () => {
  it("labels each state without leaking scanner detail", () => {
    expect(safeScanLabel("CLEAN")).toBe("Available");
    expect(safeScanLabel("PENDING")).toMatch(/scanning/i);
    expect(safeScanLabel("QUARANTINED")).toMatch(/security check/i);
    expect(safeScanLabel("REJECTED")).toMatch(/validated/i);
    expect(safeScanLabel("ERROR")).toMatch(/scan error/i);
    expect(safeScanLabel(null)).toMatch(/secure storage/i); // legacy
    for (const s of ["CLEAN", "PENDING", "QUARANTINED", "REJECTED", "ERROR", null]) {
      expect(safeScanLabel(s)).not.toMatch(/clamav|engine|virus signature/i);
    }
  });
});

describe.skipIf(!URL_SET)("F2.8 listTargetDocuments (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Doc: typeof import("@/server/services/provider-document.service").ProviderDocumentService;
  let world: import("../factories/provider-network").ProviderWorld;
  let claimA: { id: string }, claimB: { id: string };
  const docIds: string[] = [];

  function ctx(perms: string[]) {
    return { actorType: "USER" as const, actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, allowedProviderBranchIds: [], permissions: perms, apiScopes: [], requestId: "r" };
  }
  async function mk(claimId: string, scanStatus: string | null, fileName: string) {
    const d = await prisma.document.create({ data: { fileName, fileUrl: "http://public/legacy.pdf", category: "CLAIM_SUPPORT", claimId, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, storageKey: "documents/x/y", ...(scanStatus ? { scanStatus: scanStatus as never } : {}) } });
    docIds.push(d.id); return d;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Doc = (await import("@/server/services/provider-document.service")).ProviderDocumentService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    claimA = await world.createClaim({ providerId: world.providers.a.id });
    claimB = await world.createClaim({ providerId: world.providers.b.id });
    await mk(claimA.id, "CLEAN", "clean.pdf");
    await mk(claimA.id, "QUARANTINED", "bad.pdf");
    await mk(claimA.id, null, "legacy.pdf");
  });

  afterAll(async () => {
    if (world) { await prisma.document.deleteMany({ where: { id: { in: docIds } } }); await world.teardown(); }
  });

  it("links only CLEAN docs to the authorized route and never exposes fileUrl/storageKey", async () => {
    const list = await Doc.listTargetDocuments(ctx(["provider.claim.read"]), { targetType: "CLAIM", targetId: claimA.id });
    expect(list).toHaveLength(3);
    const serialized = JSON.stringify(list);
    expect(serialized).not.toMatch(/http:\/\/public|fileUrl|storageKey|documents\/x\/y/);

    const clean = list.find((d) => d.fileName === "clean.pdf")!;
    expect(clean.usable).toBe(true);
    expect(clean.downloadHref).toBe(`/provider/documents/${clean.id}/download`);

    const quar = list.find((d) => d.fileName === "bad.pdf")!;
    expect(quar.usable).toBe(false);
    expect(quar.downloadHref).toBeNull(); // no link for quarantined
    expect(quar.statusLabel).toMatch(/security check/i);

    const legacy = list.find((d) => d.fileName === "legacy.pdf")!;
    expect(legacy.usable).toBe(false);
    expect(legacy.downloadHref).toBeNull(); // legacy is NOT served via a public URL here
  });

  it("denies without permission and for another provider's claim", async () => {
    await expect(Doc.listTargetDocuments(ctx([]), { targetType: "CLAIM", targetId: claimA.id })).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
    await expect(Doc.listTargetDocuments(ctx(["provider.claim.read"]), { targetType: "CLAIM", targetId: claimB.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
