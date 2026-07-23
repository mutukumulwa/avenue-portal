import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ProviderEntitlementService } from "./provider-entitlement.service";
import { ProviderAccessSettingsService } from "./provider-access-settings.service";

/**
 * PNOS F1.12 — entitlement gate for PROVIDER-PORTAL claim submission.
 *
 * The provider-portal intake channel currently resolves the claimed member by
 * tenant alone (claim-intake/context.ts PROVIDER_PORTAL sets
 * scopeMembersByEntitlement:false — the documented bypass). This gate removes
 * that bypass ONLY when deny-by-default is enabled for the provider (D3 flag,
 * same ProviderAccessSettings as F1.11), evaluated at the CLAIM'S service date.
 *
 * When enforced, an out-of-entitlement member is simply not resolvable — the
 * caller returns its normal "no member found" result, so this is a structural
 * reject (no claim is created), matching the B2B API's entitlement-scoped
 * resolution. When not enforced (default), behavior is unchanged. Receipt /
 * idempotency / routing all remain owned by Claims Autopilot downstream.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface SubmittableMemberResult {
  member: { id: string } | null;
  enforced: boolean;
}

export const ProviderClaimEntitlementGate = {
  /**
   * Resolve the member a provider portal claim may be filed for. Entitlement is
   * evaluated at `serviceDate` when the provider is under enforcement.
   */
  async resolveSubmittableMember(
    input: { tenantId: string; providerId: string; memberNumber: string; serviceDate: Date },
    db: Db = prisma,
  ): Promise<SubmittableMemberResult> {
    const enforced = await ProviderAccessSettingsService.isEntitlementEnforced(input.tenantId, input.providerId, db);
    const scope = enforced
      ? await ProviderEntitlementService.entitledMemberWhere(input.providerId, input.serviceDate)
      : {};
    const member = await db.member.findFirst({
      where: { tenantId: input.tenantId, memberNumber: { equals: input.memberNumber, mode: "insensitive" }, ...scope },
      select: { id: true },
    });
    return { member, enforced };
  },
} as const;
