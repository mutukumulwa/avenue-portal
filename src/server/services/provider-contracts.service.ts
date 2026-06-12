import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient, UnlistedServiceRule } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

// Priority when several tariff rows cover the same code: a negotiated rate
// beats a gazetted one, which beats a published price list.
const TARIFF_PRIORITY: Record<string, number> = { NEGOTIATED: 0, GAZETTED: 1, PUBLISHED: 2 };

export type LineRateRule =
  | "CONTRACT_TARIFF" // priced from the active contract's schedule
  | "STANDALONE_TARIFF" // priced from a provider-level rate not tied to a contract
  | "EXCLUDED" // contractually not payable at this provider
  | "UNLISTED_PAY_AS_BILLED"
  | "UNLISTED_DISCOUNT"
  | "UNLISTED_REFER"
  | "UNLISTED_REJECT"
  | "NO_CONTRACT"; // provider has no active contract covering the service date

export interface ResolvedLineRate {
  lineId: string;
  cptCode: string | null;
  quantity: number;
  unitCost: number; // billed per unit
  agreedRate: number | null; // contracted per-unit rate when the code is on a schedule
  /**
   * Per-unit payable ceiling after applying contract rules.
   * null = no automatic ceiling (REFER_FOR_REVIEW or no contract) — human decides.
   */
  allowedUnit: number | null;
  ruleApplied: LineRateRule;
  requiresPreauth: boolean;
  maxQuantityPerVisit: number | null;
  quantityExceeded: boolean;
  variance: number | null; // unitCost − agreedRate
  variancePct: number | null;
}

export interface ContractSummary {
  id: string;
  contractNumber: string;
  title: string;
  status: string;
  unlistedServiceRule: UnlistedServiceRule;
  unlistedDiscountPct: number | null;
  invoiceDiscountPct: number | null;
  endDate: Date;
}

export interface ResolvedClaimRates {
  contract: ContractSummary | null;
  lines: ResolvedLineRate[];
}

export class ProviderContractsService {
  /** The contract whose schedule governs services rendered on `onDate`. */
  static async getActiveContract(tenantId: string, providerId: string, onDate: Date) {
    return prisma.providerContract.findFirst({
      where: {
        tenantId,
        providerId,
        status: "ACTIVE",
        startDate: { lte: onDate },
        endDate: { gte: onDate },
      },
      orderBy: { startDate: "desc" },
    });
  }

  /**
   * Resolve the contracted position for every line on a claim:
   * scheduled rate, exclusions, unlisted-service rule, preauth and quantity flags.
   * Read-only — does not write to the DB.
   */
  static async resolveClaimLineRates(
    tenantId: string,
    providerId: string,
    dateOfService: Date,
    lines: { id: string; cptCode: string | null; description?: string | null; unitCost: number; quantity: number }[],
  ): Promise<ResolvedClaimRates> {
    const contract = await this.getActiveContract(tenantId, providerId, dateOfService);

    const cptCodes = lines.map(l => l.cptCode).filter(Boolean) as string[];

    const tariffs = cptCodes.length
      ? await prisma.providerTariff.findMany({
          where: {
            providerId,
            cptCode: { in: cptCodes },
            isActive: true,
            effectiveFrom: { lte: dateOfService },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: dateOfService } }],
            // Only the governing contract's lines or standalone (legacy) lines apply —
            // never rates belonging to a draft/expired/other contract.
            AND: [{ OR: [{ contractId: contract?.id ?? "__none__" }, { contractId: null }] }],
          },
        })
      : [];

    // Best rate per code: contract-scoped beats standalone, then tariff-type priority, then latest.
    tariffs.sort((a, b) => {
      const aContract = a.contractId ? 0 : 1;
      const bContract = b.contractId ? 0 : 1;
      if (aContract !== bContract) return aContract - bContract;
      const pa = TARIFF_PRIORITY[a.tariffType] ?? 9;
      const pb = TARIFF_PRIORITY[b.tariffType] ?? 9;
      if (pa !== pb) return pa - pb;
      return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
    });
    const tariffMap = new Map<string, (typeof tariffs)[number]>();
    for (const t of tariffs) {
      if (t.cptCode && !tariffMap.has(t.cptCode)) tariffMap.set(t.cptCode, t);
    }

    const exclusions = contract
      ? await prisma.providerContractExclusion.findMany({ where: { contractId: contract.id } })
      : [];
    const excludedCodes = new Set(exclusions.map(e => e.cptCode).filter(Boolean) as string[]);
    const excludedNames = new Set(exclusions.map(e => e.serviceName.trim().toLowerCase()));

    const unlistedRule = contract?.unlistedServiceRule ?? null;
    const unlistedPct = contract?.unlistedDiscountPct != null ? Number(contract.unlistedDiscountPct) : null;

    const resolved: ResolvedLineRate[] = lines.map(l => {
      const base = {
        lineId: l.id,
        cptCode: l.cptCode,
        quantity: l.quantity,
        unitCost: l.unitCost,
        requiresPreauth: false,
        maxQuantityPerVisit: null as number | null,
        quantityExceeded: false,
      };

      // 1. Contractual exclusion — not payable at this provider.
      const isExcluded =
        (l.cptCode && excludedCodes.has(l.cptCode)) ||
        (l.description && excludedNames.has(l.description.trim().toLowerCase()));
      if (contract && isExcluded) {
        return { ...base, agreedRate: null, allowedUnit: 0, ruleApplied: "EXCLUDED" as const, variance: null, variancePct: null };
      }

      // 2. On a tariff schedule.
      const tariff = l.cptCode ? tariffMap.get(l.cptCode) : undefined;
      if (tariff) {
        const agreedRate = Number(tariff.agreedRate);
        const variance = l.unitCost - agreedRate;
        const maxQty = tariff.maxQuantityPerVisit ?? null;
        return {
          ...base,
          agreedRate,
          allowedUnit: Math.min(agreedRate, l.unitCost),
          ruleApplied: tariff.contractId ? ("CONTRACT_TARIFF" as const) : ("STANDALONE_TARIFF" as const),
          requiresPreauth: tariff.requiresPreauth,
          maxQuantityPerVisit: maxQty,
          quantityExceeded: maxQty != null && l.quantity > maxQty,
          variance,
          variancePct: agreedRate > 0 ? Math.round((variance / agreedRate) * 100) : null,
        };
      }

      // 3. Not on any schedule — the contract's unlisted-service rule decides.
      if (!contract) {
        return { ...base, agreedRate: null, allowedUnit: null, ruleApplied: "NO_CONTRACT" as const, variance: null, variancePct: null };
      }
      switch (unlistedRule) {
        case "PAY_AS_BILLED":
          return { ...base, agreedRate: null, allowedUnit: l.unitCost, ruleApplied: "UNLISTED_PAY_AS_BILLED" as const, variance: null, variancePct: null };
        case "DISCOUNT_OFF_BILLED": {
          const pct = unlistedPct ?? 0;
          return {
            ...base,
            agreedRate: null,
            allowedUnit: Math.round(l.unitCost * (1 - pct / 100) * 100) / 100,
            ruleApplied: "UNLISTED_DISCOUNT" as const,
            variance: null,
            variancePct: null,
          };
        }
        case "REJECT":
          return { ...base, agreedRate: null, allowedUnit: 0, ruleApplied: "UNLISTED_REJECT" as const, variance: null, variancePct: null };
        case "REFER_FOR_REVIEW":
        default:
          return { ...base, agreedRate: null, allowedUnit: null, ruleApplied: "UNLISTED_REFER" as const, variance: null, variancePct: null };
      }
    });

    return {
      contract: contract
        ? {
            id: contract.id,
            contractNumber: contract.contractNumber,
            title: contract.title,
            status: contract.status,
            unlistedServiceRule: contract.unlistedServiceRule,
            unlistedDiscountPct: unlistedPct,
            invoiceDiscountPct: contract.invoiceDiscountPct != null ? Number(contract.invoiceDiscountPct) : null,
            endDate: contract.endDate,
          }
        : null,
      lines: resolved,
    };
  }

  /** PC-2026-007 style numbers, per tenant per year. */
  static async nextContractNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.providerContract.count({
      where: { tenantId, contractNumber: { startsWith: `PC-${year}-` } },
    });
    return `PC-${year}-${String(count + 1).padStart(3, "0")}`;
  }

  /**
   * Activating a contract suspends other overlapping ACTIVE contracts for the
   * provider (one governing agreement per period) and syncs the provider's
   * legacy summary fields so list pages stay accurate.
   */
  static async activateContract(tenantId: string, contractId: string) {
    const contract = await prisma.providerContract.findUnique({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new Error("Contract not found");
    if (contract.endDate < new Date()) throw new Error("Cannot activate a contract whose end date is in the past. Renew it instead.");
    const tariffCount = await prisma.providerTariff.count({ where: { contractId } });
    if (tariffCount === 0 && contract.unlistedServiceRule === "REJECT") {
      throw new Error("This contract rejects unlisted services but has an empty tariff schedule — nothing would ever be payable. Add tariff lines first.");
    }

    await prisma.$transaction(async tx => {
      await tx.providerContract.updateMany({
        where: {
          tenantId,
          providerId: contract.providerId,
          status: "ACTIVE",
          id: { not: contractId },
          // overlapping period
          startDate: { lte: contract.endDate },
          endDate: { gte: contract.startDate },
        },
        data: { status: "SUSPENDED" },
      });
      await tx.providerContract.update({ where: { id: contractId }, data: { status: "ACTIVE" } });
      await this.syncProviderSummary(tx, contract.providerId);
    });
  }

  static async setContractStatus(tenantId: string, contractId: string, status: "SUSPENDED" | "TERMINATED" | "DRAFT") {
    const contract = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
    if (!contract) throw new Error("Contract not found");
    await prisma.$transaction(async tx => {
      await tx.providerContract.update({ where: { id: contractId }, data: { status } });
      await this.syncProviderSummary(tx, contract.providerId);
    });
  }

  /** Keep the flat Provider.contract* fields (used by list pages) in line with the contract register. */
  static async syncProviderSummary(tx: Tx, providerId: string) {
    const now = new Date();
    const active = await tx.providerContract.findFirst({
      where: { providerId, status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { endDate: "desc" },
    });
    if (active) {
      await tx.provider.update({
        where: { id: providerId },
        data: {
          contractStatus: "ACTIVE",
          contractStartDate: active.startDate,
          contractEndDate: active.endDate,
          paymentTermDays: active.paymentTermDays,
          creditLimit: active.creditLimit,
        },
      });
      return;
    }
    const any = await tx.providerContract.findFirst({ where: { providerId }, orderBy: { endDate: "desc" } });
    await tx.provider.update({
      where: { id: providerId },
      data: {
        contractStatus: any ? (any.endDate < now || any.status === "EXPIRED" ? "EXPIRED" : any.status === "TERMINATED" ? "TERMINATED" : "PENDING") : "PENDING",
        contractStartDate: any?.startDate ?? null,
        contractEndDate: any?.endDate ?? null,
      },
    });
  }

  /**
   * Renewal: clone the agreement into a new DRAFT for the next period with an
   * optional % uplift across the whole rate schedule. The old contract keeps
   * its history and points at its successor.
   */
  static async renewContract(
    tenantId: string,
    contractId: string,
    opts: { startDate: Date; endDate: Date; upliftPct: number; userId?: string },
  ) {
    const old = await prisma.providerContract.findUnique({
      where: { id: contractId, tenantId },
      include: { tariffLines: { where: { isActive: true } }, diagnosisTariffs: { where: { isActive: true } }, exclusions: true },
    });
    if (!old) throw new Error("Contract not found");
    if (old.supersededById) throw new Error("This contract has already been renewed.");
    if (opts.endDate <= opts.startDate) throw new Error("Renewal end date must be after the start date.");

    const factor = 1 + opts.upliftPct / 100;
    const contractNumber = await this.nextContractNumber(tenantId);

    return prisma.$transaction(async tx => {
      const renewed = await tx.providerContract.create({
        data: {
          tenantId,
          providerId: old.providerId,
          contractNumber,
          title: old.title.replace(/\b(20\d{2})\b/, String(opts.startDate.getFullYear())) === old.title
            ? `${old.title} (Renewal)`
            : old.title.replace(/\b(20\d{2})\b/, String(opts.startDate.getFullYear())),
          status: "DRAFT",
          startDate: opts.startDate,
          endDate: opts.endDate,
          autoRenew: old.autoRenew,
          paymentTermDays: old.paymentTermDays,
          creditLimit: old.creditLimit,
          invoiceDiscountPct: old.invoiceDiscountPct,
          unlistedServiceRule: old.unlistedServiceRule,
          unlistedDiscountPct: old.unlistedDiscountPct,
          notes: old.notes,
          createdById: opts.userId,
        },
      });

      if (old.tariffLines.length) {
        await tx.providerTariff.createMany({
          data: old.tariffLines.map(t => ({
            providerId: old.providerId,
            contractId: renewed.id,
            cptCode: t.cptCode,
            serviceName: t.serviceName,
            agreedRate: Math.round(Number(t.agreedRate) * factor * 100) / 100,
            tariffType: t.tariffType,
            requiresPreauth: t.requiresPreauth,
            maxQuantityPerVisit: t.maxQuantityPerVisit,
            effectiveFrom: opts.startDate,
          })),
        });
      }
      if (old.diagnosisTariffs.length) {
        await tx.providerDiagnosisTariff.createMany({
          data: old.diagnosisTariffs.map(t => ({
            providerId: old.providerId,
            contractId: renewed.id,
            icdCode: t.icdCode,
            diagnosisLabel: t.diagnosisLabel,
            bundledRate: t.bundledRate != null ? Math.round(Number(t.bundledRate) * factor * 100) / 100 : null,
            perDayRate: t.perDayRate != null ? Math.round(Number(t.perDayRate) * factor * 100) / 100 : null,
            tariffType: t.tariffType,
            notes: t.notes,
            effectiveFrom: opts.startDate,
          })),
        });
      }
      if (old.exclusions.length) {
        await tx.providerContractExclusion.createMany({
          data: old.exclusions.map(e => ({
            contractId: renewed.id,
            cptCode: e.cptCode,
            serviceName: e.serviceName,
            reason: e.reason,
          })),
        });
      }

      await tx.providerContract.update({ where: { id: old.id }, data: { supersededById: renewed.id } });
      return renewed;
    });
  }

  /**
   * Parse a pasted CSV rate schedule. Expected columns (header optional):
   * cptCode,serviceName,rate[,requiresPreauth][,maxQuantityPerVisit]
   * cptCode may be blank for uncoded services.
   */
  static parseTariffCsv(raw: string): { rows: { cptCode: string | null; serviceName: string; agreedRate: number; requiresPreauth: boolean; maxQuantityPerVisit: number | null }[]; errors: string[] } {
    const rows: { cptCode: string | null; serviceName: string; agreedRate: number; requiresPreauth: boolean; maxQuantityPerVisit: number | null }[] = [];
    const errors: string[] = [];
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    lines.forEach((line, idx) => {
      const cols = line.split(",").map(c => c.trim());
      // Skip a header row
      if (idx === 0 && /service|rate|cpt/i.test(line) && !/\d/.test(cols[2] ?? "")) return;
      const [cptCode, serviceName, rateRaw, preauthRaw, maxQtyRaw] = cols;
      const rate = Number((rateRaw ?? "").replace(/[^\d.]/g, ""));
      if (!serviceName || !rateRaw || Number.isNaN(rate) || rate <= 0) {
        errors.push(`Line ${idx + 1}: expected "cptCode,serviceName,rate" — got "${line.slice(0, 60)}"`);
        return;
      }
      rows.push({
        cptCode: cptCode || null,
        serviceName,
        agreedRate: rate,
        requiresPreauth: /^(y|yes|true|1)$/i.test(preauthRaw ?? ""),
        maxQuantityPerVisit: maxQtyRaw && !Number.isNaN(Number(maxQtyRaw)) ? Number(maxQtyRaw) : null,
      });
    });

    return { rows, errors };
  }
}
