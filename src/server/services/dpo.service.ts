import { prisma } from "@/lib/prisma";
import type { DsrType } from "@prisma/client";

/**
 * Data Protection Officer service (Uganda DPPA-2019 / gap G1.2). Consent capture
 * with purpose limitation, and data-subject-rights (DSR) intake with a statutory
 * SLA. Processor register + breach workflow are managed via their models.
 */
const DSR_SLA_DAYS = 30; // statutory response window

export class DpoService {
  /** Record a consent grant for a purpose (hooked into onboarding + the portal). */
  static async recordConsent(
    tenantId: string,
    memberId: string,
    data: { purpose: string; lawfulBasis: string; version: string; channel?: string },
  ) {
    return prisma.consentRecord.create({
      data: { tenantId, memberId, purpose: data.purpose, lawfulBasis: data.lawfulBasis, version: data.version, channel: data.channel },
    });
  }

  /** Withdraw the active consent(s) for a purpose (purpose limitation). */
  static async withdrawConsent(tenantId: string, memberId: string, purpose: string) {
    return prisma.consentRecord.updateMany({
      where: { tenantId, memberId, purpose, withdrawnAt: null },
      data: { withdrawnAt: new Date() },
    });
  }

  /** True when the member has an active (granted, not withdrawn) consent for a purpose. */
  static async hasActiveConsent(tenantId: string, memberId: string, purpose: string): Promise<boolean> {
    const c = await prisma.consentRecord.findFirst({
      where: { tenantId, memberId, purpose, withdrawnAt: null },
      select: { id: true },
    });
    return !!c;
  }

  /** Open a data-subject request with the statutory SLA deadline. */
  static async openDsr(tenantId: string, memberId: string, type: DsrType, notes?: string) {
    const slaDeadlineAt = new Date(Date.now() + DSR_SLA_DAYS * 24 * 3600 * 1000);
    return prisma.dataSubjectRequest.create({
      data: { tenantId, memberId, type, status: "RECEIVED", slaDeadlineAt, notes },
    });
  }

  /** Advance / fulfil / reject a DSR, attaching the fulfilment artefact ref. */
  static async setDsrStatus(
    tenantId: string,
    id: string,
    status: "IN_PROGRESS" | "FULFILLED" | "REJECTED",
    fulfilmentRef?: string,
  ) {
    const dsr = await prisma.dataSubjectRequest.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!dsr) throw new Error("DSR not found");
    return prisma.dataSubjectRequest.update({ where: { id }, data: { status, fulfilmentRef } });
  }
}
