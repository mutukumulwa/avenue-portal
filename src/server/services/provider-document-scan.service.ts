import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient, DocumentScanStatus } from "@prisma/client";

/**
 * PNOS F2.5 — malware scan + quarantine lifecycle (D8).
 *
 * A durable, lease-based worker moves each PENDING document to a terminal
 * disposition. Only CLEAN documents are ever usable; QUARANTINED/REJECTED/ERROR
 * and still-PENDING are denied ordinary access. The scanner is an injectable
 * port (a real engine is wired in ops); the state machine + retry control live
 * here. Does NOT touch legacy documents (null scanStatus) — F2.7.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type ScanVerdict = "CLEAN" | "INFECTED" | "CORRUPT" | "ERROR";

export interface DocumentScannerPort {
  scan(input: { storageKey: string; sha256: string | null }): Promise<{ verdict: ScanVerdict; engine: string }>;
}

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;

/** The single gate every consumer uses: only a CLEAN document is usable. */
export function isDocumentUsable(scanStatus: DocumentScanStatus | null): boolean {
  return scanStatus === "CLEAN";
}

export const ProviderDocumentScanService = {
  isDocumentUsable,

  /**
   * Scan one document by id. Idempotent: a document not in PENDING is a no-op
   * (already terminal). Applies the verdict → terminal state, or retries a
   * transient ERROR until attempts are exhausted.
   */
  async scanOne(
    documentId: string,
    scanner: DocumentScannerPort,
    opts: { maxAttempts?: number } = {},
    db: Db = prisma,
  ): Promise<{ status: DocumentScanStatus | "SKIPPED" }> {
    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const doc = await db.document.findUnique({ where: { id: documentId }, select: { id: true, scanStatus: true, storageKey: true, sha256: true, scanAttempts: true } });
    if (!doc || doc.scanStatus !== "PENDING") return { status: "SKIPPED" }; // terminal or legacy → no-op (idempotent)

    const attempts = doc.scanAttempts + 1;
    let verdict: ScanVerdict; let engine: string;
    try {
      const r = await scanner.scan({ storageKey: doc.storageKey ?? "", sha256: doc.sha256 });
      verdict = r.verdict; engine = r.engine;
    } catch {
      verdict = "ERROR"; engine = "unknown";
    }

    let next: DocumentScanStatus;
    let reason: string | null = null;
    if (verdict === "CLEAN") next = "CLEAN";
    else if (verdict === "INFECTED") { next = "QUARANTINED"; reason = "Malware detected"; }
    else if (verdict === "CORRUPT") { next = "REJECTED"; reason = "File could not be validated"; }
    else {
      // transient ERROR — retry until exhausted, then terminal ERROR
      if (attempts < maxAttempts) {
        await db.document.update({ where: { id: doc.id }, data: { scanStatus: "PENDING", scanAttempts: attempts, scanLeaseUntil: null, scanEngine: engine } });
        return { status: "PENDING" };
      }
      next = "ERROR"; reason = "Scan failed after maximum attempts";
    }

    await db.document.update({
      where: { id: doc.id },
      data: { scanStatus: next, scanAttempts: attempts, scannedAt: new Date(), scanEngine: engine, scanReason: reason, scanLeaseUntil: null },
    });
    return { status: next };
  },

  /**
   * Sweep PENDING documents with a free/expired lease, claiming each with a
   * lease before scanning so concurrent workers don't double-process.
   */
  async runScanSweep(
    scanner: DocumentScannerPort,
    opts: { limit?: number; leaseMs?: number; maxAttempts?: number } = {},
    db: Db = prisma,
  ): Promise<{ scanned: number; byStatus: Record<string, number> }> {
    const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
    const now = new Date();
    const candidates = await db.document.findMany({
      where: { scanStatus: "PENDING", OR: [{ scanLeaseUntil: null }, { scanLeaseUntil: { lt: now } }] },
      select: { id: true },
      take: opts.limit ?? 50,
    });
    const byStatus: Record<string, number> = {};
    let scanned = 0;
    for (const c of candidates) {
      // claim: only proceed if we win the lease (guards against concurrent workers)
      const claimed = await db.document.updateMany({
        where: { id: c.id, scanStatus: "PENDING", OR: [{ scanLeaseUntil: null }, { scanLeaseUntil: { lt: now } }] },
        data: { scanLeaseUntil: new Date(now.getTime() + leaseMs) },
      });
      if (claimed.count !== 1) continue;
      const res = await this.scanOne(c.id, scanner, { maxAttempts: opts.maxAttempts }, db);
      byStatus[res.status] = (byStatus[res.status] ?? 0) + 1;
      scanned++;
    }
    return { scanned, byStatus };
  },
} as const;
