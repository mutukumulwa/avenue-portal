import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient, DocumentScanStatus } from "@prisma/client";

/**
 * PNOS F2.7 — backfill legacy document metadata for ONE target class (CLAIM).
 *
 * Legacy rows (fileUrl set, storageKey null) predate the F2 regime. This derives
 * a private storageKey from the fileUrl, stamps tenant/provider scope from the
 * owning claim, and assigns a scan disposition per the approved legacy policy —
 * only for UNAMBIGUOUS rows. Ambiguous/broken rows are reported for a human,
 * never guessed. Idempotent: an already-migrated row (storageKey set) is skipped.
 * Legacy fileUrl stays readable throughout (F2.8/F2.9 retire it later).
 */

type Db = PrismaClient | Prisma.TransactionClient;

const DOCUMENTS_BUCKET = process.env.MINIO_DOCUMENTS_BUCKET || "aicare-documents";

export type LegacyDocStatus = "UNAMBIGUOUS" | "MISSING_TARGET" | "BROKEN_URL" | "ALREADY_MIGRATED";

/** Extract the private object key from a legacy public URL, or null if unparseable. */
export function parseStorageKeyFromUrl(fileUrl: string, bucket = DOCUMENTS_BUCKET): string | null {
  try {
    const path = new URL(fileUrl).pathname.replace(/^\/+/, ""); // "aicare-documents/1699-x.pdf"
    const prefix = `${bucket}/`;
    if (path.startsWith(prefix)) return path.slice(prefix.length) || null;
    // some legacy URLs may omit the bucket segment — treat a bare non-empty path as the key
    return path.includes("/") ? null : path || null;
  } catch {
    return null;
  }
}

export interface BackfillDocReport {
  total: number;
  counts: Record<LegacyDocStatus, number>;
  applied: number;
  exceptions: Array<{ documentId: string; status: LegacyDocStatus }>;
}

function emptyCounts(): Record<LegacyDocStatus, number> {
  return { UNAMBIGUOUS: 0, MISSING_TARGET: 0, BROKEN_URL: 0, ALREADY_MIGRATED: 0 };
}

export const ProviderDocumentBackfillService = {
  parseStorageKeyFromUrl,

  /** Backfill the CLAIM document class. Dry-run by default (apply=false). */
  async backfillClaimDocuments(
    opts: { apply?: boolean; disposition?: DocumentScanStatus; limit?: number; tenantId?: string },
    db: Db = prisma,
  ): Promise<BackfillDocReport> {
    const disposition = opts.disposition ?? "PENDING"; // safe default — force rescan before new-path use
    const docs = await db.document.findMany({
      where: { claimId: { not: null }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
      select: { id: true, fileUrl: true, storageKey: true, claimId: true },
      take: opts.limit ?? 1000,
    });

    const counts = emptyCounts();
    const exceptions: BackfillDocReport["exceptions"] = [];
    let applied = 0;

    for (const d of docs) {
      if (d.storageKey) { counts.ALREADY_MIGRATED++; continue; } // idempotent skip
      const claim = await db.claim.findUnique({ where: { id: d.claimId! }, select: { tenantId: true, providerId: true, providerBranchId: true } });
      if (!claim) { counts.MISSING_TARGET++; exceptions.push({ documentId: d.id, status: "MISSING_TARGET" }); continue; }
      const key = parseStorageKeyFromUrl(d.fileUrl);
      if (!key) { counts.BROKEN_URL++; exceptions.push({ documentId: d.id, status: "BROKEN_URL" }); continue; }

      counts.UNAMBIGUOUS++;
      if (opts.apply) {
        await db.document.update({
          where: { id: d.id },
          data: {
            storageKey: key, tenantId: claim.tenantId, providerId: claim.providerId, providerBranchId: claim.providerBranchId,
            sourceType: "OPERATOR", scanStatus: disposition, retentionClass: "LEGACY_BACKFILL",
          },
        });
        applied++;
      }
    }
    return { total: docs.length, counts, applied, exceptions };
  },
} as const;
