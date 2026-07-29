/**
 * F2.7 — legacy document metadata backfill (CLAIM class).
 *
 * Pure block: URL→key parsing. DB block (opt-in): dry-run classifies + writes
 * nothing; apply stamps scope + disposition on UNAMBIGUOUS rows; rerun changes
 * zero completed rows (idempotent); broken/missing-target rows are exceptions,
 * never guessed. Row conservation asserted.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseStorageKeyFromUrl } from "@/server/services/provider-document-backfill.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe("F2.7 parseStorageKeyFromUrl (pure)", () => {
  it("extracts the key after the bucket segment", () => {
    expect(parseStorageKeyFromUrl("http://host:9000/aicare-documents/1699-abc.pdf")).toBe("1699-abc.pdf");
    expect(parseStorageKeyFromUrl("https://cdn/aicare-documents/deep/key.png")).toBe("deep/key.png");
  });
  it("returns null for an unparseable or bucketless multi-segment URL", () => {
    expect(parseStorageKeyFromUrl("not a url")).toBeNull();
    expect(parseStorageKeyFromUrl("http://host/other-bucket/x/y.pdf")).toBeNull();
  });
});

describe.skipIf(!URL_SET)("F2.7 backfillClaimDocuments (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Backfill: typeof import("@/server/services/provider-document-backfill.service").ProviderDocumentBackfillService;
  let world: import("../factories/provider-network").ProviderWorld;
  let claimA: { id: string };
  const docIds: string[] = [];

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Backfill = (await import("@/server/services/provider-document-backfill.service")).ProviderDocumentBackfillService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    claimA = await world.createClaim({ providerId: world.providers.a.id });
    // a legacy claim doc (fileUrl set, no storageKey/tenantId) + a broken-url legacy doc
    const good = await prisma.document.create({ data: { fileName: "old.pdf", fileUrl: "http://h:9000/aicare-documents/legacy-1.pdf", category: "CLAIM_SUPPORT", claimId: claimA.id } });
    const broken = await prisma.document.create({ data: { fileName: "bad.pdf", fileUrl: "not-a-url", category: "CLAIM_SUPPORT", claimId: claimA.id } });
    docIds.push(good.id, broken.id);
  });

  afterAll(async () => {
    if (world) { await prisma.document.deleteMany({ where: { id: { in: docIds } } }); await world.teardown(); }
  });

  it("dry-run classifies and writes nothing; apply migrates only unambiguous rows", async () => {
    const dry = await Backfill.backfillClaimDocuments({ apply: false, tenantId: world.tenants.alpha.id });
    // include the world's other claim docs? scope by tenantId — our 2 docs have null tenantId until migrated,
    // so tenant filter would exclude them. Re-run without tenant filter for these legacy (null-tenant) rows:
    const dryAll = await Backfill.backfillClaimDocuments({ apply: false });
    expect(dryAll.applied).toBe(0);
    const sum = Object.values(dryAll.counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(dryAll.total); // row conservation
    expect(dryAll.counts.UNAMBIGUOUS).toBeGreaterThanOrEqual(1);
    expect(dryAll.counts.BROKEN_URL).toBeGreaterThanOrEqual(1);
    // nothing written
    const good = await prisma.document.findUniqueOrThrow({ where: { id: docIds[0] } });
    expect(good.storageKey).toBeNull();
    void dry;
  });

  it("apply stamps scope + PENDING disposition; rerun changes zero completed rows", async () => {
    const first = await Backfill.backfillClaimDocuments({ apply: true });
    expect(first.applied).toBeGreaterThanOrEqual(1);
    const good = await prisma.document.findUniqueOrThrow({ where: { id: docIds[0] } });
    expect(good.storageKey).toBe("legacy-1.pdf");
    expect(good.tenantId).toBe(world.tenants.alpha.id);
    expect(good.providerId).toBe(world.providers.a.id);
    expect(good.scanStatus).toBe("PENDING");
    expect(good.retentionClass).toBe("LEGACY_BACKFILL");

    // idempotent: a second apply migrates zero (the good row is ALREADY_MIGRATED)
    const second = await Backfill.backfillClaimDocuments({ apply: true });
    expect(second.applied).toBe(0);
    expect(second.counts.ALREADY_MIGRATED).toBeGreaterThanOrEqual(1);
  });
});
