import { prisma } from "@/lib/prisma";
import type { BenefitCategory, CaseType, ClaimLineCategory, Prisma, ServiceType } from "@prisma/client";

// ─── CASE MANAGEMENT (WP-D2, TPA_FEEDBACK_WORKPLAN.md §D) ────────────────────
// A clinical episode container. Services, pre-auths, and letters of
// undertaking accrue against an OPEN case (e.g. an inpatient stay); closure
// assembles them into exactly ONE claim (the one-claim-per-case rule lives
// here — the schema deliberately allows many for the future).

const CASE_TYPE_TO_SERVICE_TYPE: Record<CaseType, ServiceType> = {
  INPATIENT_ADMISSION: "INPATIENT",
  OUTPATIENT_EPISODE: "OUTPATIENT",
  MATERNITY: "INPATIENT",
  DAY_CASE: "DAY_CASE",
  CHRONIC_CYCLE: "OUTPATIENT",
};

export class CaseService {
  static async openCase(input: {
    tenantId: string;
    memberId: string;
    providerId: string;
    providerBranchId?: string | null;
    caseType: CaseType;
    benefitCategory: BenefitCategory;
    admissionDate?: Date | null;
    expectedDischargeDate?: Date | null;
    primaryDiagnoses?: Record<string, unknown>[];
    attendingDoctor?: string;
    estimatedCost?: number | null;
    openedById: string;
  }) {
    const member = await prisma.member.findUnique({
      where: { id: input.memberId, tenantId: input.tenantId },
      select: { status: true, firstName: true, lastName: true },
    });
    if (!member) throw new Error("Member not found");
    if (["SUSPENDED", "LAPSED", "TERMINATED"].includes(member.status)) {
      throw new Error(`Cannot open a case: member is ${member.status}`);
    }
    const provider = await prisma.provider.findUnique({
      where: { id: input.providerId },
      select: { tenantId: true, contractStatus: true, name: true },
    });
    if (!provider || provider.tenantId !== input.tenantId) throw new Error("Facility not found");
    if (["EXPIRED", "SUSPENDED"].includes(provider.contractStatus)) {
      throw new Error(`Facility contract is ${provider.contractStatus}`);
    }

    const count = await prisma.clinicalCase.count({ where: { tenantId: input.tenantId } });
    const caseNumber = `CASE-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    // PR-031: stamp the case with the SCHEME currency at open (same D2 rule
    // the claim intake uses) — a KES scheme's episode must never display UGX.
    const { ClaimsService } = await import("./claims.service");
    const currency = await ClaimsService.resolveClaimCurrency(input.tenantId, input.providerId, input.memberId);

    return prisma.clinicalCase.create({
      data: {
        tenantId: input.tenantId,
        caseNumber,
        currency,
        memberId: input.memberId,
        providerId: input.providerId,
        providerBranchId: input.providerBranchId ?? null,
        caseType: input.caseType,
        benefitCategory: input.benefitCategory,
        admissionDate: input.admissionDate ?? null,
        expectedDischargeDate: input.expectedDischargeDate ?? null,
        primaryDiagnoses: (input.primaryDiagnoses ?? []) as Prisma.InputJsonValue,
        attendingDoctor: input.attendingDoctor ?? null,
        estimatedCost: input.estimatedCost ?? null,
        openedById: input.openedById,
      },
      include: { member: { select: { firstName: true, lastName: true, memberNumber: true } } },
    });
  }

  private static async getOpenCase(tenantId: string, caseId: string) {
    const c = await prisma.clinicalCase.findUnique({ where: { id: caseId, tenantId } });
    if (!c) throw new Error("Case not found");
    if (c.status !== "OPEN" && c.status !== "PENDING_CLOSURE") {
      throw new Error(`Case is ${c.status} — no further changes allowed`);
    }
    return c;
  }

  /** Recompute accruedAmount from non-voided entries (single source of truth). */
  private static async recomputeAccrued(tx: Prisma.TransactionClient, caseId: string) {
    const agg = await tx.caseServiceEntry.aggregate({
      where: { caseId, voided: false },
      _sum: { totalAmount: true },
    });
    return tx.clinicalCase.update({
      where: { id: caseId },
      data: { accruedAmount: agg._sum.totalAmount ?? 0 },
    });
  }

  /**
   * IP-DEF-04: accommodation ("bed-day") charges — ward/ICU/HDU bed days.
   * Matches "ICU bed", "General ward bed day", "Accommodation", "HDU day fee";
   * does NOT match "bedside X-ray" (word boundary) or "ward round" (ward only
   * counts next to bed/day/fee/charge).
   */
  static readonly BED_DAY_PATTERN = /\bbed\b|\baccommodation\b|\b(icu|hdu|ward)\s+(bed|day|fee|charge)s?\b/i;

  /**
   * IP-DEF-04: days on which MORE THAN ONE non-voided bed-day entry bills.
   * Same-date ward + ICU both pricing payable is either a transfer day
   * (legitimate — a reviewer confirms it) or double-billing. Pure function so
   * the rule is unit-testable.
   */
  static detectBedDayOverlaps(
    entries: Array<{ entryDate: Date; description: string; serviceCode?: string | null; voided?: boolean }>,
  ): Array<{ day: string; items: string[] }> {
    const byDay = new Map<string, string[]>();
    for (const e of entries) {
      if (e.voided) continue;
      if (!CaseService.BED_DAY_PATTERN.test(`${e.serviceCode ?? ""} ${e.description}`)) continue;
      const day = e.entryDate.toISOString().slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), e.description]);
    }
    return [...byDay.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([day, items]) => ({ day, items }));
  }

  static async addServiceEntry(input: {
    tenantId: string;
    caseId: string;
    entryDate: Date;
    category: ClaimLineCategory;
    serviceCode?: string | null;
    description: string;
    quantity?: number;
    unitAmount: number;
    source?: "MANUAL" | "HMS_BATCH";
    enteredById?: string;
    hmsBatchRef?: string | null;
  }) {
    const openCase = await CaseService.getOpenCase(input.tenantId, input.caseId);
    const quantity = input.quantity ?? 1;
    if (quantity < 1) throw new Error("Quantity must be at least 1");
    if (input.unitAmount < 0) throw new Error("Unit amount cannot be negative");

    // IP-DEF-02: a service entry must fall inside the admission episode and can
    // never be in the future — a post-discharge or future-dated entry accrues
    // billable money for care that has not (or cannot have) happened. Compared
    // at DAY granularity (entry dates are date-only).
    const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const entryDay = day(input.entryDate);
    if (entryDay > day(new Date())) {
      throw new Error("Service entry date cannot be in the future.");
    }
    if (openCase.admissionDate && entryDay < day(openCase.admissionDate)) {
      throw new Error(
        `Service entry date (${input.entryDate.toISOString().slice(0, 10)}) is before the admission date ` +
          `(${openCase.admissionDate.toISOString().slice(0, 10)}) — entries must fall inside the admission episode.`,
      );
    }
    if (openCase.dischargeDate && entryDay > day(openCase.dischargeDate)) {
      throw new Error(
        `Service entry date (${input.entryDate.toISOString().slice(0, 10)}) is after the discharge date ` +
          `(${openCase.dischargeDate.toISOString().slice(0, 10)}) — post-discharge services need a new episode, not a back-dated entry.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const entry = await tx.caseServiceEntry.create({
        data: {
          caseId: input.caseId,
          entryDate: input.entryDate,
          category: input.category,
          serviceCode: input.serviceCode ?? null,
          description: input.description,
          quantity,
          unitAmount: input.unitAmount,
          totalAmount: quantity * input.unitAmount,
          source: input.source ?? "MANUAL",
          enteredById: input.enteredById ?? null,
          hmsBatchRef: input.hmsBatchRef ?? null,
        },
      });
      await CaseService.recomputeAccrued(tx, input.caseId);

      // IP-DEF-04: the moment a SECOND same-day bed-day entry lands, record it
      // on the case timeline so the ward clerk sees the overlap immediately.
      // The enforcement (fraud-gate hold on the filed claim) happens at
      // closeAndFile — this is the early warning.
      if (CaseService.BED_DAY_PATTERN.test(`${input.serviceCode ?? ""} ${input.description}`)) {
        const sameDay = await tx.caseServiceEntry.findMany({
          where: { caseId: input.caseId, voided: false, entryDate: input.entryDate, id: { not: entry.id } },
          select: { description: true, serviceCode: true },
        });
        const overlapping = sameDay.filter((e) =>
          CaseService.BED_DAY_PATTERN.test(`${e.serviceCode ?? ""} ${e.description}`),
        );
        if (overlapping.length > 0) {
          await tx.activityLog.create({
            data: {
              entityType: "CASE",
              entityId: input.caseId,
              action: "BED_DAY_OVERLAP",
              description:
                `Multiple bed-day charges on ${input.entryDate.toISOString().slice(0, 10)}: ` +
                `"${input.description}" overlaps ${overlapping.map((e) => `"${e.description}"`).join(", ")}. ` +
                `The filed claim will require fraud clearance (transfer day vs double-billing).`,
              userId: input.enteredById ?? null,
            },
          });
        }
      }
      return entry;
    });
  }

  static async voidServiceEntry(tenantId: string, caseId: string, entryId: string, reason: string) {
    await CaseService.getOpenCase(tenantId, caseId);
    const entry = await prisma.caseServiceEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.caseId !== caseId) throw new Error("Service entry not found on this case");
    if (entry.voided) return entry;

    return prisma.$transaction(async (tx) => {
      const voided = await tx.caseServiceEntry.update({
        where: { id: entryId },
        data: { voided: true, voidReason: reason },
      });
      await CaseService.recomputeAccrued(tx, caseId);
      return voided;
    });
  }

  /** Attach an approved PA to the open case (member+facility must match). */
  static async attachPreauth(tenantId: string, caseId: string, preauthId: string) {
    const c = await CaseService.getOpenCase(tenantId, caseId);
    const pa = await prisma.preAuthorization.findUnique({
      where: { id: preauthId, tenantId },
      select: { memberId: true, providerId: true, status: true, claimId: true, caseId: true },
    });
    if (!pa) throw new Error("Pre-authorization not found");
    if (pa.caseId === caseId) return pa; // idempotent
    if (pa.caseId || pa.claimId) throw new Error("Pre-auth is already attached elsewhere");
    if (pa.status !== "APPROVED") throw new Error(`Only APPROVED pre-auths can attach (current: ${pa.status})`);
    if (pa.memberId !== c.memberId) throw new Error("Pre-auth belongs to a different member");
    if (pa.providerId !== c.providerId) throw new Error("Pre-auth was issued for a different facility");
    return prisma.preAuthorization.update({ where: { id: preauthId }, data: { caseId } });
  }

  /** Attach an issued LOU to the open case (member+facility must match). */
  static async attachLou(tenantId: string, caseId: string, louId: string) {
    const c = await CaseService.getOpenCase(tenantId, caseId);
    const lou = await prisma.letterOfUndertaking.findUnique({
      where: { id: louId },
      select: { tenantId: true, memberId: true, providerId: true, status: true, caseId: true },
    });
    if (!lou || lou.tenantId !== tenantId) throw new Error("Letter of undertaking not found");
    if (lou.caseId === caseId) return lou; // idempotent
    if (lou.caseId) throw new Error("LOU is already attached to another case");
    if (lou.status !== "ISSUED") throw new Error(`Only ISSUED LOUs can attach (current: ${lou.status})`);
    if (lou.memberId !== c.memberId) throw new Error("LOU belongs to a different member");
    if (lou.providerId !== c.providerId) throw new Error("LOU was issued for a different facility");
    return prisma.letterOfUndertaking.update({ where: { id: louId }, data: { caseId } });
  }

  /**
   * Close the case and file exactly ONE claim from the accrued services
   * (decision D5). Case pre-auths re-point at the filed claim (WP-C2 attach
   * semantics); LOUs become UTILISED; the case becomes immutable.
   */
  static async closeAndFile(tenantId: string, caseId: string, closedById: string) {
    const c = await prisma.clinicalCase.findUnique({
      where: { id: caseId, tenantId },
      include: {
        serviceEntries: { where: { voided: false }, orderBy: { entryDate: "asc" } },
        preauths: { select: { id: true } },
        claims: { select: { id: true } },
      },
    });
    if (!c) throw new Error("Case not found");
    if (c.status === "CLOSED_FILED") throw new Error("Case is already closed and filed");
    if (c.status === "CANCELLED") throw new Error("Case is cancelled");
    // One case → one claim (service-layer rule, D5).
    if (c.claims.length > 0) throw new Error("Case already has a filed claim");
    if (c.serviceEntries.length === 0) {
      throw new Error("Cannot file an empty case — add service entries or cancel it");
    }

    const dischargeDate = c.dischargeDate ?? new Date();
    const claimNumber = await prisma.claim
      .count({ where: { tenantId } })
      .then((n) => `CLM-${new Date().getFullYear()}-${String(n + 1).padStart(5, "0")}`);

    const claim = await prisma.$transaction(async (tx) => {
      // FG-C9: atomically claim the case as the FIRST write, so two concurrent
      // closeAndFile calls can't both file a claim from it (Claim.caseId is
      // non-unique — the "already filed" check above is not concurrency-safe).
      // Only an OPEN/PENDING_CLOSURE case files, and only once: the loser matches
      // 0 rows (row-locked behind the winner, re-evaluated as CLOSED_FILED) →
      // throws → rolls back before a second claim is created. (One-case→one-claim, D5.)
      const claimedCase = await tx.clinicalCase.updateMany({
        where: { id: c.id, tenantId, status: { in: ["OPEN", "PENDING_CLOSURE"] } },
        data: { status: "CLOSED_FILED", closedById, closedAt: new Date(), dischargeDate },
      });
      if (claimedCase.count !== 1) {
        throw new Error("This case has just been filed by another user — refresh to see the claim.");
      }

      const created = await tx.claim.create({
        data: {
          tenantId,
          claimNumber,
          memberId: c.memberId,
          providerId: c.providerId,
          providerBranchId: c.providerBranchId,
          caseId: c.id,
          serviceType: CASE_TYPE_TO_SERVICE_TYPE[c.caseType],
          dateOfService: c.admissionDate ?? c.serviceEntries[0].entryDate,
          admissionDate: c.admissionDate,
          dischargeDate,
          lengthOfStay: c.admissionDate
            ? Math.max(1, Math.ceil((dischargeDate.getTime() - c.admissionDate.getTime()) / 86_400_000))
            : null,
          attendingDoctor: c.attendingDoctor,
          diagnoses: (c.primaryDiagnoses ?? []) as Prisma.InputJsonValue,
          procedures: c.serviceEntries.map((e) => ({
            description: e.description,
            code: e.serviceCode,
            qty: e.quantity,
            unitCost: Number(e.unitAmount),
            total: Number(e.totalAmount),
          })) as Prisma.InputJsonValue,
          billedAmount: c.accruedAmount,
          benefitCategory: c.benefitCategory,
          status: "RECEIVED",
          claimLines: {
            create: c.serviceEntries.map((e, i) => ({
              lineNumber: i + 1,
              serviceCategory: e.category,
              description: e.description,
              cptCode: e.serviceCode,
              quantity: e.quantity,
              unitCost: e.unitAmount,
              billedAmount: e.totalAmount,
            })),
          },
          adjudicationLogs: {
            create: {
              userId: closedById,
              action: "RECEIVED",
              toStatus: "RECEIVED",
              notes: `Filed from case ${c.caseNumber} (${c.serviceEntries.length} service entries).`,
            },
          },
        },
      });

      // IP-DEF-04: same-date multiple bed-day charges (e.g. ward + ICU on one
      // day) hard-flag the filed claim. With the fraud gate enforced, the claim
      // cannot be approved until OPS/fraud/medical clears the alert — a genuine
      // transfer day is cleared with a note; double-billing is declined. This
      // is the "hard-flag with an authorised override path" shape.
      const bedDayOverlaps = CaseService.detectBedDayOverlaps(c.serviceEntries);
      if (bedDayOverlaps.length > 0) {
        await tx.claimFraudAlert.create({
          data: {
            tenantId,
            claimId: created.id,
            rule: "Overlapping Bed-Day Charges",
            score: 80,
            severity: "HIGH",
            notes: bedDayOverlaps
              .map((o) => `${o.day}: ${o.items.join(" + ")}`)
              .join("; ")
              .slice(0, 900),
          },
        });
      }

      // Case PAs re-point at the filed claim (WP-C2 attach semantics).
      if (c.preauths.length > 0) {
        await tx.preAuthorization.updateMany({
          where: { caseId: c.id },
          data: { claimId: created.id, attachedAt: new Date(), status: "ATTACHED" },
        });
      }
      // LOUs on the case are consumed by the filing.
      await tx.letterOfUndertaking.updateMany({
        where: { caseId: c.id, status: "ISSUED" },
        data: { status: "UTILISED" },
      });

      // Case status/closedBy/closedAt/dischargeDate were set by the atomic claim
      // at the top of this transaction.
      return created;
    });

    return claim;
  }

  static async cancelCase(tenantId: string, caseId: string, closedById: string, reason: string) {
    const c = await CaseService.getOpenCase(tenantId, caseId);
    // Release attached PAs back to the pool.
    await prisma.preAuthorization.updateMany({
      where: { caseId: c.id },
      data: { caseId: null },
    });
    const updated = await prisma.clinicalCase.update({
      where: { id: c.id },
      data: { status: "CANCELLED", closedById, closedAt: new Date() },
    });
    await prisma.activityLog.create({
      data: {
        entityType: "CASE",
        entityId: c.id,
        action: "CANCELLED",
        description: `Case ${c.caseNumber} cancelled: ${reason}`,
        userId: closedById,
      },
    });
    return updated;
  }

  /** Open-cases board, facility-first (mirrors the claims queue shape). */
  static async listOpenCases(tenantId: string, clientId?: string | null) {
    return prisma.clinicalCase.findMany({
      where: {
        tenantId,
        status: { in: ["OPEN", "PENDING_CLOSURE"] },
        ...(clientId ? { member: { group: { clientId } } } : {}),
      },
      include: {
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { id: true, name: true } },
        _count: { select: { serviceEntries: { where: { voided: false } }, preauths: true, lous: true } },
      },
      orderBy: { admissionDate: "asc" },
    });
  }

  static async getCaseDetail(tenantId: string, caseId: string) {
    return prisma.clinicalCase.findUnique({
      where: { id: caseId, tenantId },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { id: true, name: true } },
        serviceEntries: { orderBy: { entryDate: "asc" } },
        preauths: {
          select: { id: true, preauthNumber: true, status: true, approvedAmount: true, validUntil: true },
        },
        lous: { select: { id: true, louNumber: true, status: true, amountCeiling: true, validUntil: true } },
        claims: { select: { id: true, claimNumber: true, status: true } },
        openedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }
}

// ─── LETTERS OF UNDERTAKING (WP-D2, decision D6) ─────────────────────────────

export class LouService {
  static async issue(input: {
    tenantId: string;
    memberId: string;
    providerId: string;
    caseId?: string | null;
    amountCeiling: number;
    currency?: string;
    validityDays?: number;
    notes?: string;
    issuedById: string;
  }) {
    if (input.amountCeiling <= 0) throw new Error("LOU amount ceiling must be positive");
    const member = await prisma.member.findUnique({
      where: { id: input.memberId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!member) throw new Error("Member not found");

    const count = await prisma.letterOfUndertaking.count({ where: { tenantId: input.tenantId } });
    const louNumber = `LOU-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
    const now = new Date();

    return prisma.letterOfUndertaking.create({
      data: {
        tenantId: input.tenantId,
        louNumber,
        memberId: input.memberId,
        providerId: input.providerId,
        caseId: input.caseId ?? null,
        amountCeiling: input.amountCeiling,
        currency: input.currency ?? "UGX",
        status: "ISSUED",
        issuedById: input.issuedById,
        issuedAt: now,
        validFrom: now,
        validUntil: new Date(now.getTime() + (input.validityDays ?? 30) * 86_400_000),
        notes: input.notes ?? null,
      },
      include: { member: { select: { firstName: true, lastName: true } }, provider: { select: { name: true } } },
    });
  }

  static async cancel(tenantId: string, louId: string) {
    const lou = await prisma.letterOfUndertaking.findUnique({ where: { id: louId } });
    if (!lou || lou.tenantId !== tenantId) throw new Error("LOU not found");
    if (lou.status === "UTILISED") throw new Error("LOU has been utilised and cannot be cancelled");
    return prisma.letterOfUndertaking.update({
      where: { id: louId },
      data: { status: "CANCELLED" },
    });
  }

  static async list(tenantId: string, take = 200) {
    return prisma.letterOfUndertaking.findMany({
      where: { tenantId },
      include: {
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
        case: { select: { caseNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  }
}
