import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ProviderEntitlementService } from "./provider-entitlement.service";
import { ProviderAccessSettingsService } from "./provider-access-settings.service";

/**
 * PNOS F1.12 — entitlement gate for PROVIDER-PORTAL claim submission.
 *
 * ELIG-GAP-020 (Phase 3, PRIVACY-S1-A): member resolution is ALWAYS
 * entitlement-scoped at the CLAIM'S service date — a provider can never resolve
 * (or file a claim for) a member outside the clients its active contracts cover,
 * regardless of the D3 enforcement flag. Previously this scoping applied ONLY
 * when deny-by-default was enabled; that flag is now decoupled from whether PII/
 * among-clients scoping applies (it may still govern other posture elsewhere).
 *
 * An out-of-entitlement member is simply not resolvable — the caller returns its
 * normal "no member found" result, so this is a structural reject (no claim is
 * created), matching the B2B API's entitlement-scoped resolution. Receipt /
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
    // ELIG-GAP-020 (PRIVACY-S1-A): ALWAYS entitlement-scope — not only when the
    // D3 flag is on. `entitledMemberWhere` is deny-by-default (returns an
    // impossible filter when the provider has no active applicability).
    const scope = await ProviderEntitlementService.entitledMemberWhere(input.providerId, input.serviceDate);
    const member = await db.member.findFirst({
      where: { tenantId: input.tenantId, memberNumber: { equals: input.memberNumber, mode: "insensitive" }, ...scope },
      select: { id: true },
    });
    return { member, enforced };
  },
} as const;
