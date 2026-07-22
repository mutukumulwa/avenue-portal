import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { parseClaimSubmissionV1 } from "./claim-intake/schema";
import { normalizeSubmission } from "./claim-intake/normalize";
import { resolveIntakeContext } from "./claim-intake/context";
import { computeRequestHash } from "./claim-intake/fingerprint";
import { reserveReceipt } from "./claim-intake/receipt";
import { ClaimIntakeService } from "./claim-intake/intake.service";
import { getSystemActorId } from "./system-actor.service";
import { createWithDocumentNumber } from "@/lib/document-number";
import type { BenefitCategory, CaseType, ClaimLineCategory, Prisma, ServiceType } from "@prisma/client";
import { FraudService } from "./fraud.service";

// ─── CASE MANAGEMENT (WP-D2, TPA_FEEDBACK_WORKPLAN.md §D) ────────────────────
// A clinical episode container. Services, pre-auths, and letters of
// undertaking accrue against an OPEN case (e.g. an inpatient stay). IPL-001:
// an open case can be billed in periodic interim SLICES (each a Claim from a
// subset of entries) while it stays open, and the final bill files the
// residual at closure — one case → many claims (the schema allows it).

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

    // PR-031: stamp the case with the SCHEME currency at open (same D2 rule
    // the claim intake uses) — a KES scheme's episode must never display UGX.
    const { ClaimsService } = await import("./claims.service");
    const currency = await ClaimsService.resolveClaimCurrency(input.tenantId, input.providerId, input.memberId);

    // B4: collision-safe case number (max+1 seed + reservation-retry).
    return createWithDocumentNumber(
      "CASE",
      (yp) =>
        prisma.clinicalCase
          .findFirst({
            where: { tenantId: input.tenantId, caseNumber: { startsWith: yp } },
            orderBy: { caseNumber: "desc" },
            select: { caseNumber: true },
          })
          .then((r) => r?.caseNumber ?? null),
      (caseNumber) =>
        prisma.clinicalCase.create({
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
        }),
    );
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
    // IPL-001 (CASE-12): a line already frozen into an interim/final slice is an
    // immutable financial fact — it cannot be voided. A late correction must go
    // through an adjustment on that claim, never by mutating a billed slice.
    if (entry.billedInClaimId) {
      const slice = await prisma.claim.findUnique({
        where: { id: entry.billedInClaimId },
        select: { claimNumber: true },
      });
      throw new Error(
        `This service line is already billed on slice ${slice?.claimNumber ?? entry.billedInClaimId} and cannot be voided — ` +
          `raise an adjustment on that claim instead.`,
      );
    }

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

  /** Inclusive end-of-day (UTC) for a cut-off calendar day — TIME-05 determinism:
   * an entry dated on the cut-off day is IN the slice; the next day is OUT,
   * regardless of the time component the caller passed. */
  private static cutoffDayEnd(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  }

  /**
   * F5.8/F5.9 canonical-case helpers.
   */

  /** Order-independent short identity of a frozen entry set (for keys). */
  private static entrySetHash(ids: string[]): string {
    return createHash("sha256").update([...ids].sort().join(",")).digest("hex").slice(0, 16);
  }

  /** Defensive entry→canonical-line mapper: conserves the entry TOTAL even when
   *  qty×unit drifted, drops non-canonical codes rather than failing the bill. */
  private static entryToLine(e: { category: string; serviceCode: string | null; description: string | null; quantity: number; unitAmount: unknown; totalAmount: unknown }) {
    const qty = Math.max(1, Math.trunc(e.quantity || 1));
    const unit = Number(e.unitAmount);
    const total = Number(e.totalAmount);
    const consistent = Number.isFinite(unit) && unit > 0 && Math.abs(qty * unit - total) <= 0.01;
    const desc = (e.description ?? "").replace(/<\s*[a-zA-Z/!]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) || "Service";
    const code = e.serviceCode && /^[A-Za-z0-9.\-]+$/.test(e.serviceCode) ? e.serviceCode : undefined;
    return {
      serviceCategory: e.category as never,
      ...(code ? { cptCode: code } : {}),
      description: desc,
      ...(consistent
        ? { quantity: qty, unitCost: unit, billedAmount: Math.round(qty * unit * 100) / 100 }
        : { quantity: 1, unitCost: total, billedAmount: total }),
    };
  }

  /** Case diagnoses (same JSON shape as Claim.diagnoses) → canonical envelope shape. */
  private static caseDiagnoses(raw: unknown) {
    const arr = ((raw as Array<{ icdCode?: string; code?: string; description?: string; isPrimary?: boolean }>) ?? [])
      .filter((d) => /^[A-Za-z0-9.\-]+$/.test((d.icdCode ?? d.code ?? "").trim()));
    const flagged = arr.findIndex((d) => d.isPrimary);
    const primaryIdx = flagged === -1 ? 0 : flagged;
    return arr.map((d, i) => ({
      code: (d.icdCode ?? d.code)!.trim(),
      ...(d.description?.trim() ? { description: d.description.trim() } : {}),
      isPrimary: i === primaryIdx,
    }));
  }

  /**
   * IPL-001 — cut an interim bill slice from an OPEN admission (plan §11, SET-01).
   * Freezes the non-voided, not-yet-billed service entries dated on/before the
   * Friday cut-off into exactly ONE claim (status RECEIVED), keeps the case OPEN
   * so care keeps accruing, and stamps the frozen entries with the slice's claim
   * id so they can never be voided or re-billed on a later slice (identity-based
   * double-billing guard, SET-02). The slice then flows through the ordinary
   * adjudication → settlement pipeline unchanged; benefit `used` is recognised
   * when the slice is DECIDED (§11.6), cash settles later.
   */
  static async cutInterimSlice(input: {
    tenantId: string;
    caseId: string;
    cutoffDate: Date;
    invoiceNumber?: string | null;
    cutById: string;
  }) {
    const claim = await CaseService.cutInterimSliceTx(input);
    // IPL-PA-01 (A5): screen the slice through the fraud rules (case-aware) for
    // parity with the wizard/B2B/offline rails. Post-commit + never-throw, so
    // screening can never fail the cut; the bed-day HIGH alert already gates
    // slices inline.
    await FraudService.evaluateClaim(claim.id, input.tenantId).catch(() => undefined);
    return claim;
  }

  private static async cutInterimSliceTx(input: {
    tenantId: string;
    caseId: string;
    cutoffDate: Date;
    invoiceNumber?: string | null;
    cutById: string;
  }) {
    const c = await prisma.clinicalCase.findUnique({
      where: { id: input.caseId, tenantId: input.tenantId },
      include: {
        claims: { select: { caseSliceSeq: true } },
        // Case PAs are read through at slice decision (IPL-PA-01), not
        // re-pointed here, so cutInterimSlice no longer needs to load them.
      },
    });
    if (!c) throw new Error("Case not found");
    if (c.status === "CLOSED_FILED") throw new Error("Case is already closed and filed — no further interim slices.");
    if (c.status === "CANCELLED") throw new Error("Case is cancelled — no interim slices.");

    const cutoffEnd = CaseService.cutoffDayEnd(input.cutoffDate);
    // Guard the obvious footgun: a cut-off before the admission bills nothing.
    if (c.admissionDate && cutoffEnd < c.admissionDate) {
      throw new Error("Cut-off date is before the admission date — nothing to bill.");
    }

    // Slice = non-voided, still-unbilled entries dated on/before the cut-off day.
    const eligible = await prisma.caseServiceEntry.findMany({
      where: { caseId: c.id, voided: false, billedInClaimId: null, entryDate: { lte: cutoffEnd } },
      orderBy: { entryDate: "asc" },
    });
    if (eligible.length === 0) {
      throw new Error(
        `No unbilled services on or before ${input.cutoffDate.toISOString().slice(0, 10)} to bill on a new slice. ` +
          `Every prior line is already on a slice, or nothing new has accrued.`,
      );
    }

    const seq = Math.max(0, ...c.claims.map((cl) => cl.caseSliceSeq ?? 0)) + 1;
    const sliceTotal = eligible.reduce((s, e) => s + Number(e.totalAmount), 0);
    const serviceFrom = eligible[0].entryDate;
    const serviceTo = eligible[eligible.length - 1].entryDate;
    const invoiceNumber = input.invoiceNumber?.trim() || `${c.caseNumber}-S${seq}`;
    const entryIds = eligible.map((e) => e.id);
    const lines = eligible.filter((e) => Number(e.totalAmount) > 0).map((e) => CaseService.entryToLine(e));
    if (lines.length === 0) throw new Error("Nothing billable on this slice — every eligible line has a zero amount.");

    // ── Canonical intake, DERIVED_TRANSACTIONAL (F5.8) ──────────────────────
    // Key = case + slice sequence + exact entry-set hash (§8.5); the strong
    // fingerprint carries the same identity (§8.3.3), so a concurrent identical
    // cut LINKS instead of double-billing.
    const raw = {
      schemaVersion: "1" as const,
      idempotencyKey: `${c.id}:slice:${seq}:${CaseService.entrySetHash(entryIds)}`,
      invoiceNumber,
      member: { memberId: c.memberId },
      provider: { providerId: c.providerId, ...(c.providerBranchId ? { branchId: c.providerBranchId } : {}) },
      encounter: {
        serviceType: CASE_TYPE_TO_SERVICE_TYPE[c.caseType],
        benefitCategory: c.benefitCategory,
        serviceFrom: serviceFrom.toISOString().slice(0, 10),
        serviceTo: serviceTo.toISOString().slice(0, 10),
        ...(c.admissionDate ? { admissionDate: c.admissionDate.toISOString().slice(0, 10) } : {}),
        ...(c.attendingDoctor?.trim() ? { attendingDoctor: c.attendingDoctor.trim() } : {}),
      },
      diagnoses: CaseService.caseDiagnoses(c.primaryDiagnoses),
      lines,
      currency: c.currency,
      origin: { caseId: c.id, caseSliceSeq: seq },
    };
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw new Error(`Slice cannot be billed: ${parsed.error.issues[0]?.message ?? "invalid case data"}`);
    const normalized = normalizeSubmission(parsed.data);
    const systemActorId = await getSystemActorId(input.tenantId);
    const context = await resolveIntakeContext(
      { kind: "caseSystem", tenantId: input.tenantId, caseId: c.id, isFinal: false, providerId: c.providerId, systemActorId, sourceHint: "MANUAL" },
      parsed.data,
    );
    const requestHash = computeRequestHash(normalized);
    const reservation = await reserveReceipt(prisma, {
      tenantId: input.tenantId, scopeKey: context.scopeKey, channel: context.channel,
      idempotencyKey: raw.idempotencyKey, schemaVersion: "1", requestHash,
      strongEventFingerprint: null, suspectedDuplicateFingerprint: "suspect:v1:case", correlationId: `${c.id}:${seq}`,
    });
    if (reservation.kind === "CONFLICT") {
      throw new Error("An identical slice cut is already recorded with different content — refresh the case.");
    }
    if (reservation.kind === "REPLAY" && reservation.receipt.claimId) {
      // The same entry set was already cut — return the existing slice claim.
      return prisma.claim.findUniqueOrThrow({ where: { id: reservation.receipt.claimId } });
    }
    const receiptId = reservation.receipt.id; // fresh, or an aborted attempt's PROCESSING receipt reused

    const origin = {
      caseId: c.id, caseSliceSeq: seq, isInterimBill: true,
      sliceCutoffAt: cutoffEnd, sliceServiceFrom: serviceFrom, sliceServiceTo: serviceTo,
      sliceEntryIds: entryIds,
    };

    let claimId: string;
    try {
      claimId = await prisma.$transaction(async (tx) => {
        const result = await ClaimIntakeService.submitWithinTransaction(tx, { context, normalized, receiptId, requestHash, origin });
        if (result.kind === "STRONG_LINK") return result.claimId; // a rival identical cut won — no extra writes

        await tx.adjudicationLog.create({
          data: {
            claimId: result.claimId, userId: input.cutById, action: "RECEIVED", toStatus: "RECEIVED",
            notes:
              `Interim slice ${seq} from case ${c.caseNumber} — cut-off ` +
              `${input.cutoffDate.toISOString().slice(0, 10)}, ${eligible.length} service line(s). Case remains open.`,
          },
        });

        // Same-day multiple bed-day charges hard-flag the slice for fraud clearance
        // before it can be approved/settled (IP-DEF-04, same rule as closeAndFile).
        const bedDayOverlaps = CaseService.detectBedDayOverlaps(eligible);
        if (bedDayOverlaps.length > 0) {
          await tx.claimFraudAlert.create({
            data: {
              tenantId: input.tenantId, claimId: result.claimId,
              rule: "Overlapping Bed-Day Charges", score: 80, severity: "HIGH",
              notes: bedDayOverlaps.map((o) => `${o.day}: ${o.items.join(" + ")}`).join("; ").slice(0, 900),
            },
          });
        }

        await tx.activityLog.create({
          data: {
            entityType: "CASE", entityId: c.id, action: "INTERIM_SLICE_CUT",
            description:
              `Interim slice ${seq} (${result.claimNumber}, invoice ${invoiceNumber}) cut from case ${c.caseNumber}: ` +
              `${eligible.length} line(s), ${c.currency} ${sliceTotal.toLocaleString()} billed. Case remains open.`,
            userId: input.cutById,
          },
        });

        return result.claimId;
      });
    } catch (err) {
      // A concurrent identical cut can win the strong-fingerprint unique at
      // commit — resolve to the winner's claim instead of failing the operator.
      const winner = await prisma.claimIntakeReceipt.findUnique({ where: { id: receiptId }, select: { claimId: true } });
      if (winner?.claimId) return prisma.claim.findUniqueOrThrow({ where: { id: winner.claimId } });
      const byKey = await prisma.claim.findFirst({ where: { tenantId: input.tenantId, caseId: c.id, caseSliceSeq: seq, status: { not: "VOID" } }, orderBy: { createdAt: "desc" } });
      if (byKey && err instanceof Error && /Unique constraint|strongEventFingerprint/i.test(err.message)) return byKey;
      throw err;
    }

    // D9: route/process the slice in-request (SHADOW-forced for case claims).
    const { processAcceptedRunInline } = await import("./claim-intake");
    await processAcceptedRunInline(claimId);
    return prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
  }

  /**
   * Close the case and file the FINAL claim from the residual (not-yet-sliced)
   * services. Interim slices already cut stay untouched; their entries are never
   * re-billed (SET-03). If every entry was already billed on a slice, the case
   * closes with no empty final claim — the slices ARE the claims. Case pre-auths
   * re-point at the final claim (WP-C2); LOUs become UTILISED; case is immutable.
   */
  static async closeAndFile(tenantId: string, caseId: string, closedById: string) {
    const c = await prisma.clinicalCase.findUnique({
      where: { id: caseId, tenantId },
      include: {
        serviceEntries: { where: { voided: false }, orderBy: { entryDate: "asc" } },
        preauths: { select: { id: true } },
        claims: { select: { caseSliceSeq: true } },
      },
    });
    if (!c) throw new Error("Case not found");
    if (c.status === "CLOSED_FILED") throw new Error("Case is already closed and filed");
    if (c.status === "CANCELLED") throw new Error("Case is cancelled");
    if (c.serviceEntries.length === 0) {
      throw new Error("Cannot file an empty case — add service entries or cancel it");
    }

    // IPL-001: the final claim bills only the RESIDUAL — non-voided entries not
    // already frozen into an interim slice. Sliced entries are never re-billed
    // (SET-03). If everything was already sliced, the case closes with no empty
    // final claim (the slices ARE the claims).
    const residual = c.serviceEntries.filter((e) => !e.billedInClaimId);
    const dischargeDate = c.dischargeDate ?? new Date();
    const nextSeq = Math.max(0, ...c.claims.map((cl) => cl.caseSliceSeq ?? 0)) + 1;

    // ── All-sliced path: no residual → close with no final claim ──────────────
    if (residual.length === 0) {
      await prisma.$transaction(async (tx) => {
        // CASE-13: same atomic OPEN/PENDING_CLOSURE → CLOSED_FILED guard.
        const claimedCase = await tx.clinicalCase.updateMany({
          where: { id: c.id, tenantId, status: { in: ["OPEN", "PENDING_CLOSURE"] } },
          data: { status: "CLOSED_FILED", closedById, closedAt: new Date(), dischargeDate },
        });
        if (claimedCase.count !== 1) {
          throw new Error("This case has just been filed by another user — refresh to see the claim.");
        }
        await tx.letterOfUndertaking.updateMany({
          where: { caseId: c.id, status: "ISSUED" },
          data: { status: "UTILISED" },
        });
        await tx.activityLog.create({
          data: {
            entityType: "CASE",
            entityId: c.id,
            action: "CASE_CLOSED_ALL_SLICED",
            description:
              `Case ${c.caseNumber} closed with no final claim — all services were already billed on ` +
              `${c.claims.length} interim slice(s). Nothing to re-bill (SET-03).`,
            userId: closedById,
          },
        });
      });
      return null;
    }

    // ── Canonical intake, DERIVED_TRANSACTIONAL (F5.9) ──────────────────────
    const residualIds = residual.map((e) => e.id);
    const lines = residual.filter((e) => Number(e.totalAmount) > 0).map((e) => CaseService.entryToLine(e));
    if (lines.length === 0) throw new Error("Nothing billable on the residual — every remaining line has a zero amount.");
    const finalServiceFrom = c.admissionDate ?? residual[0].entryDate;
    const raw = {
      schemaVersion: "1" as const,
      idempotencyKey: `${c.id}:final:${CaseService.entrySetHash(residualIds)}`,
      member: { memberId: c.memberId },
      provider: { providerId: c.providerId, ...(c.providerBranchId ? { branchId: c.providerBranchId } : {}) },
      encounter: {
        serviceType: CASE_TYPE_TO_SERVICE_TYPE[c.caseType],
        benefitCategory: c.benefitCategory,
        serviceFrom: finalServiceFrom.toISOString().slice(0, 10),
        serviceTo: residual[residual.length - 1].entryDate.toISOString().slice(0, 10),
        ...(c.admissionDate ? { admissionDate: c.admissionDate.toISOString().slice(0, 10) } : {}),
        dischargeDate: dischargeDate.toISOString().slice(0, 10),
        ...(c.attendingDoctor?.trim() ? { attendingDoctor: c.attendingDoctor.trim() } : {}),
      },
      diagnoses: CaseService.caseDiagnoses(c.primaryDiagnoses),
      lines,
      currency: c.currency,
      origin: { caseId: c.id },
    };
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw new Error(`Final claim cannot be billed: ${parsed.error.issues[0]?.message ?? "invalid case data"}`);
    const normalized = normalizeSubmission(parsed.data);
    const systemActorId = await getSystemActorId(tenantId);
    const context = await resolveIntakeContext(
      { kind: "caseSystem", tenantId, caseId: c.id, isFinal: true, providerId: c.providerId, systemActorId, sourceHint: "MANUAL" },
      parsed.data,
    );
    const requestHash = computeRequestHash(normalized);
    const reservation = await reserveReceipt(prisma, {
      tenantId, scopeKey: context.scopeKey, channel: context.channel,
      idempotencyKey: raw.idempotencyKey, schemaVersion: "1", requestHash,
      strongEventFingerprint: null, suspectedDuplicateFingerprint: "suspect:v1:case", correlationId: `${c.id}:final`,
    });
    if (reservation.kind === "CONFLICT") {
      throw new Error("A final filing for this case is already recorded with different content — refresh the case.");
    }
    if (reservation.kind === "REPLAY" && reservation.receipt.claimId) {
      return prisma.claim.findUniqueOrThrow({ where: { id: reservation.receipt.claimId } });
    }
    const receiptId = reservation.receipt.id;
    const origin = {
      caseId: c.id, caseSliceSeq: nextSeq, isInterimBill: false,
      sliceServiceFrom: residual[0].entryDate, sliceServiceTo: residual[residual.length - 1].entryDate,
      sliceEntryIds: residualIds,
    };

    const claim = await prisma.$transaction(async (tx) => {
      // CASE-13 / FG-C9: atomically claim the case as the FIRST write, so two
      // concurrent closeAndFile calls can't both file a final claim from it.
      const claimedCase = await tx.clinicalCase.updateMany({
        where: { id: c.id, tenantId, status: { in: ["OPEN", "PENDING_CLOSURE"] } },
        data: { status: "CLOSED_FILED", closedById, closedAt: new Date(), dischargeDate },
      });
      if (claimedCase.count !== 1) {
        throw new Error("This case has just been filed by another user — refresh to see the claim.");
      }

      const result = await ClaimIntakeService.submitWithinTransaction(tx, { context, normalized, receiptId, requestHash, origin });
      if (result.kind === "STRONG_LINK") {
        // Should be unreachable (the case-claim guard serialises closes) — but
        // never double-write case effects for a linked claim.
        return (await tx.claim.findUniqueOrThrow({ where: { id: result.claimId } }));
      }
      const created = await tx.claim.update({
        where: { id: result.claimId },
        data: {
          lengthOfStay: c.admissionDate
            ? Math.max(1, Math.ceil((dischargeDate.getTime() - c.admissionDate.getTime()) / 86_400_000))
            : null,
        },
      });

      await tx.adjudicationLog.create({
        data: {
          claimId: created.id, userId: closedById, action: "RECEIVED", toStatus: "RECEIVED",
          notes:
            `Final claim from case ${c.caseNumber} (${residual.length} residual service line(s)` +
            `${c.claims.length > 0 ? `, after ${c.claims.length} interim slice(s)` : ""}).`,
        },
      });

      // IP-DEF-04: same-date multiple bed-day charges on the residual hard-flag
      // the final claim for fraud clearance (same rule as an interim slice).
      const bedDayOverlaps = CaseService.detectBedDayOverlaps(residual);
      if (bedDayOverlaps.length > 0) {
        await tx.claimFraudAlert.create({
          data: {
            tenantId, claimId: created.id,
            rule: "Overlapping Bed-Day Charges", score: 80, severity: "HIGH",
            notes: bedDayOverlaps.map((o) => `${o.day}: ${o.items.join(" + ")}`).join("; ").slice(0, 900),
          },
        });
      }

      // Residual case PAs (still APPROVED and unattached — a prior slice may have
      // UTILISED or partly consumed others) re-point at the final claim.
      await tx.preAuthorization.updateMany({
        where: { caseId: c.id, status: "APPROVED", claimId: null },
        data: { claimId: created.id, attachedAt: new Date(), status: "ATTACHED" },
      });
      // LOUs on the case are consumed by the final filing.
      await tx.letterOfUndertaking.updateMany({
        where: { caseId: c.id, status: "ISSUED" },
        data: { status: "UTILISED" },
      });

      return created;
    });

    // D9: route/process the final claim in-request (SHADOW-forced for case claims).
    const { processAcceptedRunInline } = await import("./claim-intake");
    await processAcceptedRunInline(claim.id);

    // IPL-PA-01 (A5): screen the final claim (case-aware fraud rules), parity
    // with the other intake rails. Post-commit + never-throw.
    await FraudService.evaluateClaim(claim.id, tenantId).catch(() => undefined);
    return claim;
  }

  static async cancelCase(tenantId: string, caseId: string, closedById: string, reason: string) {
    const c = await CaseService.getOpenCase(tenantId, caseId);
    // IPL-PA-01 (A8): a case with already-cut interim slices cannot be
    // cancelled — those slice Claims are live/adjudicable, and clearing the
    // case's PAs would strand the guarantee behind them. Decline or void the
    // slices first, then cancel.
    const liveClaims = await prisma.claim.count({
      where: { caseId: c.id, status: { notIn: ["DECLINED", "VOID"] } },
    });
    if (liveClaims > 0) {
      throw new Error(
        `Case has ${liveClaims} billed slice(s)/claim(s) — decline or void them first, then cancel. ` +
          `A cancelled episode cannot leave live billable claims behind.`,
      );
    }
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
        claims: {
          select: { id: true, claimNumber: true, status: true, caseSliceSeq: true, isInterimBill: true },
          orderBy: { caseSliceSeq: "asc" },
        },
        openedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  /**
   * IPL-001 — per-case seven-ledger reconciliation (plan §3/§11.9, probe #11).
   * Derives billed / approved / paid / outstanding to-date and the residual
   * guarantee from the case's claims (interim slices + final), so an open long
   * stay can be reconciled every Friday without a single generic "balance".
   * Read-only; the money facts live on the claims and settlement batches.
   */
  static async getCaseReconciliation(tenantId: string, caseId: string) {
    const c = await prisma.clinicalCase.findUnique({
      where: { id: caseId, tenantId },
      select: { currency: true },
    });
    if (!c) throw new Error("Case not found");

    const [claims, entries] = await Promise.all([
      prisma.claim.findMany({
        where: { caseId, tenantId },
        select: {
          id: true, claimNumber: true, invoiceNumber: true, caseSliceSeq: true,
          isInterimBill: true, sliceCutoffAt: true, sliceServiceFrom: true, sliceServiceTo: true,
          billedAmount: true, approvedAmount: true, memberLiability: true, status: true, decidedAt: true,
          settlementBatch: { select: { status: true, settledAt: true } },
        },
        orderBy: [{ caseSliceSeq: "asc" }, { createdAt: "asc" }],
      }),
      prisma.caseServiceEntry.findMany({
        where: { caseId, voided: false },
        select: { totalAmount: true, billedInClaimId: true },
      }),
    ]);

    const claimIds = claims.map((cl) => cl.id);
    // PAs securing this episode — attached to the case OR to any of its claims.
    const pas = await prisma.preAuthorization.findMany({
      where: { tenantId, OR: [{ caseId }, { claimId: { in: claimIds } }] },
      select: { approvedAmount: true, estimatedCost: true, utilisedAmount: true, status: true },
    });

    const isSettled = (s?: { status: string } | null) => s?.status === "SETTLED";
    const num = (d: unknown) => Number(d ?? 0);

    const billedToDate = entries.reduce((s, e) => s + num(e.totalAmount), 0); // B
    const billedOnSlices = entries.filter((e) => e.billedInClaimId).reduce((s, e) => s + num(e.totalAmount), 0);
    const unbilledResidual = billedToDate - billedOnSlices;
    const approvedToDate = claims.reduce((s, cl) => s + num(cl.approvedAmount), 0); // U / provider payable pre-settlement
    const paidToDate = claims.filter((cl) => isSettled(cl.settlementBatch)).reduce((s, cl) => s + num(cl.approvedAmount), 0); // S
    const outstanding = approvedToDate - paidToDate; // P not yet settled
    const memberShare = claims.reduce((s, cl) => s + num(cl.memberLiability), 0);
    // Residual guarantee: episode PA/GOP approved not yet utilised (H).
    const remainingGuarantee = pas
      .filter((pa) => ["APPROVED", "ATTACHED"].includes(pa.status))
      .reduce((s, pa) => s + Math.max(0, num(pa.approvedAmount ?? pa.estimatedCost) - num(pa.utilisedAmount)), 0);

    return {
      currency: c.currency,
      billedToDate,
      billedOnSlices,
      unbilledResidual,
      approvedToDate,
      paidToDate,
      outstanding,
      memberShare,
      remainingGuarantee,
      sliceCount: claims.filter((cl) => cl.isInterimBill).length,
      slices: claims.map((cl) => ({
        id: cl.id,
        claimNumber: cl.claimNumber,
        invoiceNumber: cl.invoiceNumber,
        seq: cl.caseSliceSeq,
        isInterimBill: cl.isInterimBill,
        cutoffAt: cl.sliceCutoffAt,
        serviceFrom: cl.sliceServiceFrom,
        serviceTo: cl.sliceServiceTo,
        billed: num(cl.billedAmount),
        approved: num(cl.approvedAmount),
        status: cl.status,
        settlementStatus: cl.settlementBatch?.status ?? null,
        decidedAt: cl.decidedAt,
      })),
    };
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

    const now = new Date();

    // B4: collision-safe LOU number (max+1 seed + reservation-retry).
    return createWithDocumentNumber(
      "LOU",
      (yp) =>
        prisma.letterOfUndertaking
          .findFirst({
            where: { tenantId: input.tenantId, louNumber: { startsWith: yp } },
            orderBy: { louNumber: "desc" },
            select: { louNumber: true },
          })
          .then((r) => r?.louNumber ?? null),
      (louNumber) =>
        prisma.letterOfUndertaking.create({
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
        }),
    );
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
