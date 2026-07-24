import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * PNOS F5.2 — claim submission-chain read.
 *
 * A submission chain is an original claim plus every version that superseded a
 * predecessor (correction / resubmission / reconsideration — F5.7/F5.10/F5.16).
 * Given ANY claim in the chain, getChain resolves the root (chainRootClaimId, or the
 * claim itself when it is the root) and returns every version in the chain, oldest
 * first. Scoped like the F3.7/F3.10 read models (tenant + optional client/provider);
 * an out-of-scope claim resolves to an empty chain (non-enumerating). Pure read — it
 * never mutates and never touches money. The lineage is populated by F5.4 (backfill /
 * new original) and F5.7 (atomic replacement); an un-backfilled claim is a singleton chain.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface ClaimChainScope {
  tenantId: string;
  clientId?: string | null;
  providerId?: string;
}

export const ClaimSubmissionChainService = {
  async getChain(scope: ClaimChainScope, claimId: string, db: Db = prisma) {
    const claim = await db.claim.findFirst({
      where: {
        id: claimId,
        tenantId: scope.tenantId,
        ...(scope.providerId ? { providerId: scope.providerId } : {}),
        ...(scope.clientId ? { member: { group: { clientId: scope.clientId } } } : {}),
      },
      select: { id: true, chainRootClaimId: true },
    });
    if (!claim) return []; // not found / out of scope — non-enumerating

    const rootId = claim.chainRootClaimId ?? claim.id;
    return db.claim.findMany({
      // A chain's versions all share tenant + provider + member, so resolving from an
      // in-scope claim keeps the whole chain in scope; tenant is the invariant filter.
      where: { tenantId: scope.tenantId, OR: [{ id: rootId }, { chainRootClaimId: rootId }] },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        submissionType: true,
        supersedesClaimId: true,
        supersededByClaimId: true,
        supersededAt: true,
        billedAmount: true,
        approvedAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  },
} as const;
