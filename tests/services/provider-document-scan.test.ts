/**
 * F2.5 — malware scan + quarantine lifecycle.
 *
 * Pure block: the usability gate. DB block (opt-in): clean/infected/corrupt
 * verdicts, transient-error retry then exhaustion, idempotent re-scan of a
 * terminal doc, lease-claim prevents double-processing, and a quarantined doc
 * is not usable.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isDocumentUsable, type DocumentScannerPort, type ScanVerdict } from "@/server/services/provider-document-scan.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

// scanner whose verdict is chosen per storageKey; ERR_THROW throws.
function fakeScanner(map: Record<string, ScanVerdict | "ERR_THROW">): DocumentScannerPort {
  return {
    async scan({ storageKey }) {
      const v = map[storageKey ?? ""] ?? "CLEAN";
      if (v === "ERR_THROW") throw new Error("scanner down");
      return { verdict: v, engine: "fake-1.0" };
    },
  };
}

describe("F2.5 isDocumentUsable (pure)", () => {
  it("only CLEAN is usable", () => {
    expect(isDocumentUsable("CLEAN")).toBe(true);
    for (const s of ["PENDING", "QUARANTINED", "REJECTED", "ERROR", null] as const) expect(isDocumentUsable(s)).toBe(false);
  });
});

describe.skipIf(!URL_SET)("F2.5 ProviderDocumentScanService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Scan: typeof import("@/server/services/provider-document-scan.service").ProviderDocumentScanService;
  let world: import("../factories/provider-network").ProviderWorld;
  const docIds: string[] = [];

  async function pending(key: string) {
    const d = await prisma.document.create({ data: { fileName: "x", fileUrl: "", category: "CLAIM_SUPPORT", tenantId: world.tenants.alpha.id, storageKey: key, sha256: "abc", scanStatus: "PENDING" } });
    docIds.push(d.id);
    return d;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Scan = (await import("@/server/services/provider-document-scan.service")).ProviderDocumentScanService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });

  afterAll(async () => {
    if (world) { await prisma.document.deleteMany({ where: { id: { in: docIds } } }); await world.teardown(); }
  });

  it("clean → CLEAN (usable); infected → QUARANTINED; corrupt → REJECTED", async () => {
    const clean = await pending("k/clean");
    const bad = await pending("k/bad");
    const corrupt = await pending("k/corrupt");
    const scanner = fakeScanner({ "k/clean": "CLEAN", "k/bad": "INFECTED", "k/corrupt": "CORRUPT" });
    expect((await Scan.scanOne(clean.id, scanner)).status).toBe("CLEAN");
    expect((await Scan.scanOne(bad.id, scanner)).status).toBe("QUARANTINED");
    expect((await Scan.scanOne(corrupt.id, scanner)).status).toBe("REJECTED");

    const cleanRow = await prisma.document.findUniqueOrThrow({ where: { id: clean.id } });
    expect(isDocumentUsable(cleanRow.scanStatus)).toBe(true);
    const badRow = await prisma.document.findUniqueOrThrow({ where: { id: bad.id } });
    expect(isDocumentUsable(badRow.scanStatus)).toBe(false); // quarantined = not usable
    expect(badRow.scanReason).toMatch(/malware/i);
  });

  it("transient scanner error retries then exhausts to ERROR", async () => {
    const d = await pending("k/err");
    const scanner = fakeScanner({ "k/err": "ERR_THROW" });
    // maxAttempts 2: first attempt → still PENDING (retry), second → ERROR
    expect((await Scan.scanOne(d.id, scanner, { maxAttempts: 2 })).status).toBe("PENDING");
    expect((await Scan.scanOne(d.id, scanner, { maxAttempts: 2 })).status).toBe("ERROR");
    const row = await prisma.document.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.scanAttempts).toBe(2);
    expect(row.scanStatus).toBe("ERROR");
  });

  it("re-scanning a terminal document is a no-op (idempotent)", async () => {
    const d = await pending("k/clean2");
    const scanner = fakeScanner({ "k/clean2": "CLEAN" });
    expect((await Scan.scanOne(d.id, scanner)).status).toBe("CLEAN");
    // a second scan (e.g. duplicate job) does nothing
    expect((await Scan.scanOne(d.id, scanner)).status).toBe("SKIPPED");
  });

  it("sweep claims + scans PENDING docs; a leased doc is not double-processed", async () => {
    await pending("k/s1");
    await pending("k/s2");
    const scanner = fakeScanner({ "k/s1": "CLEAN", "k/s2": "INFECTED" });
    const first = await Scan.runScanSweep(scanner, { limit: 100 });
    expect(first.scanned).toBeGreaterThanOrEqual(2);
    // a second immediate sweep finds nothing PENDING left from this batch
    const second = await Scan.runScanSweep(scanner, { limit: 100 });
    expect(second.byStatus["SKIPPED"] ?? 0).toBe(0); // terminal docs are not re-swept
  });
});
