import { prisma } from "@/lib/prisma";
import { FxService, BASE_CURRENCY } from "./fx.service";
import { AdminFeeService } from "./admin-fee.service";
import type { CrossBorderCaseStatus } from "@prisma/client";

/**
 * Cross-border / overseas care coordination (Medvex spec §5.15 / gap G5.15).
 *
 * A coordination layer on top of client pre-auth for the cross-border
 * employee-benefits play (AD-8). The lifecycle is a small state machine:
 *
 *   SOURCING → ESTIMATED → GOP_ISSUED → IN_TREATMENT → INVOICED → SETTLED
 *
 * (CANCELLED is reachable from any non-terminal state.) Every money step is
 * FX-normalised to the base currency (UGX, G3.5) at capture so limits, the GOP
 * commitment and the final invoice are all comparable and audit-reproducible.
 * On settlement a per-case CROSS_BORDER coordination fee (G2.3) accrues to the
 * admin-fee ledger when the client has an active agreement.
 */

/** Allowed forward transitions; CANCELLED is handled separately. */
const TRANSITIONS: Record<CrossBorderCaseStatus, CrossBorderCaseStatus[]> = {
  SOURCING: ["ESTIMATED", "CANCELLED"],
  ESTIMATED: ["GOP_ISSUED", "CANCELLED"],
  GOP_ISSUED: ["IN_TREATMENT", "CANCELLED"],
  IN_TREATMENT: ["INVOICED", "CANCELLED"],
  INVOICED: ["SETTLED", "CANCELLED"],
  SETTLED: [],
  CANCELLED: [],
};

type LineInput = { description: string; amount: number; currency: string; serviceDate?: Date };

export class CrossBorderService {
  // ── Vetted-facility registry ──────────────────────────────────────────
  static async listFacilities(
    tenantId: string,
    opts: { country?: string; onlyVetted?: boolean; includeInactive?: boolean } = {},
  ) {
    return prisma.crossBorderFacility.findMany({
      where: {
        tenantId,
        ...(opts.includeInactive ? {} : { isActive: true }),
        ...(opts.onlyVetted ? { isVetted: true } : {}),
        ...(opts.country ? { country: opts.country } : {}),
      },
      orderBy: [{ country: "asc" }, { name: "asc" }],
    });
  }

  static async upsertFacility(
    tenantId: string,
    input: {
      id?: string;
      name: string;
      country: string;
      city?: string;
      currency?: string;
      specialties?: string[];
      accreditation?: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      notes?: string;
      isVetted?: boolean;
    },
  ) {
    const data = {
      name: input.name,
      country: input.country,
      city: input.city ?? null,
      currency: input.currency ?? BASE_CURRENCY,
      specialties: input.specialties ?? [],
      accreditation: input.accreditation ?? null,
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      notes: input.notes ?? null,
      isVetted: input.isVetted ?? false,
    };
    if (input.id) {
      const existing = await prisma.crossBorderFacility.findFirst({ where: { id: input.id, tenantId } });
      if (!existing) throw new Error("Facility not found");
      return prisma.crossBorderFacility.update({ where: { id: input.id }, data });
    }
    return prisma.crossBorderFacility.create({ data: { tenantId, ...data } });
  }

  /** Never delete — retire the facility (closes the effective window). */
  static async retireFacility(tenantId: string, id: string) {
    const existing = await prisma.crossBorderFacility.findFirst({ where: { id, tenantId } });
    if (!existing) throw new Error("Facility not found");
    return prisma.crossBorderFacility.update({
      where: { id },
      data: { isActive: false, effectiveTo: new Date() },
    });
  }

  // ── Coordination cases ────────────────────────────────────────────────
  private static async nextCaseNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.crossBorderCase.count({
      where: { tenantId, caseNumber: { startsWith: `CBC-${year}-` } },
    });
    return `CBC-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  static async openCase(
    tenantId: string,
    input: {
      clientId: string;
      memberId: string;
      diagnosis: string;
      facilityId?: string;
      preauthId?: string;
      treatmentSummary?: string;
      createdById?: string;
    },
  ) {
    // Member must belong to the paying client (member → group → client).
    const member = await prisma.member.findFirst({
      where: { id: input.memberId, tenantId },
      select: { id: true, group: { select: { clientId: true } } },
    });
    if (!member) throw new Error("Member not found");
    if (member.group.clientId !== input.clientId) {
      throw new Error("Member does not belong to the specified client");
    }
    if (input.facilityId) await this.assertVettedFacility(tenantId, input.facilityId);

    return prisma.crossBorderCase.create({
      data: {
        tenantId,
        clientId: input.clientId,
        memberId: input.memberId,
        diagnosis: input.diagnosis,
        facilityId: input.facilityId ?? null,
        preauthId: input.preauthId ?? null,
        treatmentSummary: input.treatmentSummary ?? null,
        createdById: input.createdById ?? null,
        caseNumber: await this.nextCaseNumber(tenantId),
        status: "SOURCING",
      },
    });
  }

  static async assignFacility(tenantId: string, caseId: string, facilityId: string) {
    await this.assertVettedFacility(tenantId, facilityId);
    const c = await this.requireCase(tenantId, caseId);
    if (c.status === "SETTLED" || c.status === "CANCELLED") {
      throw new Error(`Cannot reassign facility on a ${c.status.toLowerCase()} case`);
    }
    return prisma.crossBorderCase.update({ where: { id: caseId }, data: { facilityId } });
  }

  /**
   * Capture the upfront estimate lines, FX-normalised to the base currency.
   * Replaces any prior estimate lines (idempotent re-estimation). Moves the
   * case to ESTIMATED.
   */
  static async captureEstimate(tenantId: string, caseId: string, lines: LineInput[]) {
    if (lines.length === 0) throw new Error("At least one estimate line is required");
    const c = await this.requireCase(tenantId, caseId);
    this.assertTransition(c.status, "ESTIMATED");

    const normalised = await this.normaliseLines(tenantId, lines);
    const totalUgx = round2(normalised.reduce((s, l) => s + l.amountUgx, 0));
    const currencies = new Set(lines.map((l) => l.currency));
    const uniformCurrency = currencies.size === 1 ? [...currencies][0] : null;
    const rawTotal = uniformCurrency ? round2(lines.reduce((s, l) => s + l.amount, 0)) : null;

    return prisma.$transaction(async (tx) => {
      await tx.crossBorderLineItem.deleteMany({ where: { caseId, kind: "ESTIMATE" } });
      await tx.crossBorderLineItem.createMany({
        data: normalised.map((l) => ({ tenantId, caseId, kind: "ESTIMATE" as const, ...l })),
      });
      return tx.crossBorderCase.update({
        where: { id: caseId },
        data: {
          estimatedAmount: rawTotal,
          estimatedCurrency: uniformCurrency,
          estimatedAmountUgx: totalUgx,
          status: "ESTIMATED",
        },
      });
    });
  }

  /**
   * Issue a Guarantee of Payment, committed strictly within the member's
   * benefit limit. The GOP amount is FX-normalised; if it exceeds
   * `approvedLimitUgx` the commitment is rejected (the "within-limits" rule).
   */
  static async issueGop(
    tenantId: string,
    caseId: string,
    input: { amount: number; currency: string; approvedLimitUgx: number },
  ) {
    const c = await this.requireCase(tenantId, caseId);
    this.assertTransition(c.status, "GOP_ISSUED");
    if (input.amount <= 0) throw new Error("GOP amount must be positive");

    const { baseAmount } = await FxService.normalise(tenantId, input.amount, input.currency);
    const gopAmountUgx = round2(baseAmount);
    if (gopAmountUgx > input.approvedLimitUgx) {
      throw new Error(
        `GOP of ${gopAmountUgx} ${BASE_CURRENCY} exceeds the approved limit of ` +
          `${input.approvedLimitUgx} ${BASE_CURRENCY}`,
      );
    }

    return prisma.crossBorderCase.update({
      where: { id: caseId },
      data: {
        gopAmount: input.amount,
        gopCurrency: input.currency,
        gopAmountUgx,
        approvedLimitUgx: input.approvedLimitUgx,
        gopWithinLimit: true,
        status: "GOP_ISSUED",
      },
    });
  }

  static async startTreatment(tenantId: string, caseId: string) {
    const c = await this.requireCase(tenantId, caseId);
    this.assertTransition(c.status, "IN_TREATMENT");
    return prisma.crossBorderCase.update({ where: { id: caseId }, data: { status: "IN_TREATMENT" } });
  }

  /** Append a consolidated-invoice line (FX-normalised). */
  static async addInvoiceLine(tenantId: string, caseId: string, line: LineInput) {
    const c = await this.requireCase(tenantId, caseId);
    if (!["IN_TREATMENT", "INVOICED"].includes(c.status)) {
      throw new Error(`Cannot add invoice lines to a ${c.status.toLowerCase()} case`);
    }
    const [normalised] = await this.normaliseLines(tenantId, [line]);
    return prisma.crossBorderLineItem.create({
      data: { tenantId, caseId, kind: "INVOICE", ...normalised },
    });
  }

  private static async nextInvoiceReference(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.crossBorderCase.count({
      where: { tenantId, invoiceReference: { startsWith: `CBI-${year}-` } },
    });
    return `CBI-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  /**
   * Consolidate every INVOICE line into a single audit-ready invoice:
   * one reference, one UGX total. Moves the case to INVOICED.
   */
  static async consolidateInvoice(tenantId: string, caseId: string) {
    const c = await this.requireCase(tenantId, caseId);
    this.assertTransition(c.status, "INVOICED");
    const lines = await prisma.crossBorderLineItem.findMany({
      where: { tenantId, caseId, kind: "INVOICE" },
      select: { amountUgx: true },
    });
    if (lines.length === 0) throw new Error("No invoice lines to consolidate");
    const totalUgx = round2(lines.reduce((s, l) => s + Number(l.amountUgx), 0));
    const reference = c.invoiceReference ?? (await this.nextInvoiceReference(tenantId));
    return prisma.crossBorderCase.update({
      where: { id: caseId },
      data: {
        invoiceReference: reference,
        invoiceTotalUgx: totalUgx,
        invoicedAt: new Date(),
        status: "INVOICED",
      },
    });
  }

  /**
   * Settle the case and accrue the CROSS_BORDER coordination fee when the
   * client has an active agreement. Idempotent on the fee (only accrues once).
   */
  static async settle(tenantId: string, caseId: string, opts: { period?: string } = {}) {
    const c = await this.requireCase(tenantId, caseId);
    this.assertTransition(c.status, "SETTLED");

    let adminFeeLedgerEntryId = c.adminFeeLedgerEntryId ?? null;
    if (!adminFeeLedgerEntryId) {
      const agreement = await prisma.adminFeeAgreement.findFirst({
        where: { tenantId, clientId: c.clientId, method: "CROSS_BORDER", isActive: true },
        select: { id: true },
      });
      if (agreement) {
        const entry = await AdminFeeService.recordEventFee(tenantId, agreement.id, { period: opts.period });
        adminFeeLedgerEntryId = entry.id;
      }
    }

    return prisma.crossBorderCase.update({
      where: { id: caseId },
      data: { status: "SETTLED", settledAt: new Date(), adminFeeLedgerEntryId },
    });
  }

  static async cancelCase(tenantId: string, caseId: string) {
    const c = await this.requireCase(tenantId, caseId);
    if (c.status === "SETTLED" || c.status === "CANCELLED") {
      throw new Error(`Cannot cancel a ${c.status.toLowerCase()} case`);
    }
    return prisma.crossBorderCase.update({ where: { id: caseId }, data: { status: "CANCELLED" } });
  }

  static async getCase(tenantId: string, caseId: string) {
    return prisma.crossBorderCase.findFirst({
      where: { id: caseId, tenantId },
      include: {
        facility: true,
        member: { select: { id: true, memberNumber: true, firstName: true, lastName: true } },
        lineItems: { orderBy: [{ kind: "asc" }, { createdAt: "asc" }] },
      },
    });
  }

  static async listCases(
    tenantId: string,
    opts: { clientId?: string; status?: CrossBorderCaseStatus } = {},
  ) {
    return prisma.crossBorderCase.findMany({
      where: {
        tenantId,
        ...(opts.clientId ? { clientId: opts.clientId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: { facility: { select: { name: true, country: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── internals ─────────────────────────────────────────────────────────
  private static async requireCase(tenantId: string, caseId: string) {
    const c = await prisma.crossBorderCase.findFirst({ where: { id: caseId, tenantId } });
    if (!c) throw new Error("Cross-border case not found");
    return c;
  }

  private static assertTransition(from: CrossBorderCaseStatus, to: CrossBorderCaseStatus) {
    if (!TRANSITIONS[from].includes(to)) {
      throw new Error(`Invalid transition ${from} → ${to}`);
    }
  }

  private static async assertVettedFacility(tenantId: string, facilityId: string) {
    const f = await prisma.crossBorderFacility.findFirst({
      where: { id: facilityId, tenantId, isActive: true },
      select: { isVetted: true },
    });
    if (!f) throw new Error("Facility not found or inactive");
    if (!f.isVetted) throw new Error("Facility is not vetted");
  }

  private static async normaliseLines(tenantId: string, lines: LineInput[]) {
    return Promise.all(
      lines.map(async (l) => {
        const { baseAmount, rate } = await FxService.normalise(tenantId, l.amount, l.currency);
        return {
          description: l.description,
          serviceDate: l.serviceDate ?? null,
          amount: l.amount,
          currency: l.currency,
          fxRate: rate,
          amountUgx: round2(baseAmount),
        };
      }),
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
