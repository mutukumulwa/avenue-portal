import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient, UnlistedServiceRule } from "@prisma/client";
import {
  loadCandidateTariffs,
  normalizeServiceText,
  selectTariffByCodeOrDescription,
} from "./contract-engine/tariff-selection";

type Tx = Prisma.TransactionClient | PrismaClient;

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
  /**
   * How the contract was resolved — the contract engine's own stage 1–2
   * (`ContractLifecycleService.precheck`). `CON-010` means several active
   * contracts match: callers must fail closed, never pick one (plan P01.03).
   */
  contractResolution: { matched: boolean; reasonCode: string | null; message: string };
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
   *
   * Family Hospital UAT plan P01.03 — this resolver now reads EXACTLY what the
   * contract engine reads, through the engine's own functions:
   *   - the contract is the engine's stage 1–2 match (`precheck`: branch scope,
   *     payer applicability, and CON-010 when several contracts match — which is
   *     reported, never resolved by picking the latest);
   *   - the candidate rows are `loadCandidateTariffs` — contract-bound only.
   *     Standalone (`contractId = null`) rows are NOT an implicit pricing
   *     fallback any more; they remain admin reference data;
   *   - each line is matched by `selectTariffByCodeOrDescription` — code first
   *     with the shared precedence (client-specific beats master, G5.4), then the
   *     engine's normalised description (BD-04: an uncoded line still binds).
   * So the approval ceiling, the PA gate and the tariff stamp can no longer
   * disagree with the price adjudication applies.
   */
  static async resolveClaimLineRates(
    tenantId: string,
    providerId: string,
    dateOfService: Date,
    lines: { id: string; cptCode: string | null; description?: string | null; unitCost: number; quantity: number }[],
    clientId?: string | null,
    /** The claim's branch; the engine scopes branch-specific rows by it. */
    providerBranchId?: string | null,
  ): Promise<ResolvedClaimRates> {
    // Dynamic import: contract-lifecycle.service imports this module.
    const { ContractLifecycleService } = await import("./contract-lifecycle.service");
    const match = await ContractLifecycleService.precheck({ tenantId, providerId, providerBranchId, clientId, pricingDate: dateOfService });
    const contract = match.matched && match.contract
      ? await prisma.providerContract.findUnique({ where: { id: match.contract.id } })
      : null;

    const tariffs = contract
      ? await loadCandidateTariffs(prisma, { contractId: contract.id, pricingDate: dateOfService, providerBranchId, clientId })
      : [];

    const exclusions = contract
      ? await prisma.providerContractExclusion.findMany({ where: { contractId: contract.id } })
      : [];
    const excludedCodes = new Set(exclusions.map(e => e.cptCode).filter(Boolean) as string[]);
    // The engine's normaliser, so an exclusion matches here iff it matches there.
    const excludedNames = new Set(exclusions.map(e => normalizeServiceText(e.serviceName)));

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
        (l.description && excludedNames.has(normalizeServiceText(l.description)));
      if (contract && isExcluded) {
        return { ...base, agreedRate: null, allowedUnit: 0, ruleApplied: "EXCLUDED" as const, variance: null, variancePct: null };
      }

      // 2. On a tariff schedule — the engine's selection: code, else normalised
      //    description (BD-04: CPT-less lines still bind to the contracted rate).
      const tariff = selectTariffByCodeOrDescription(tariffs, {
        cptCode: l.cptCode,
        providerServiceCode: null,
        description: l.description ?? "",
      })?.tariff;
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
      contractResolution: { matched: !!contract, reasonCode: match.reasonCode ?? null, message: match.message },
    };
  }

  /** PC-2026-007 style numbers, per tenant per year. */
  static async nextContractNumber(tenantId: string): Promise<string> {
    // B4-WIDE: seed from max+1 (not count()+1) so a purge/gap can't collide.
    // Inline (not the shared helper) because PC numbers pad to 3, not 5.
    const year = new Date().getFullYear();
    const latest = await prisma.providerContract.findFirst({
      where: { tenantId, contractNumber: { startsWith: `PC-${year}-` } },
      orderBy: { contractNumber: "desc" },
      select: { contractNumber: true },
    });
    const parsed = latest?.contractNumber
      ? Number.parseInt(latest.contractNumber.slice(latest.contractNumber.lastIndexOf("-") + 1), 10)
      : 0;
    return `PC-${year}-${String((Number.isFinite(parsed) ? parsed : 0) + 1).padStart(3, "0")}`;
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
    // GAP-A1.2 (WP-N4): a manual SUSPENDED is STICKY — a contract lifecycle
    // transition must never silently revert it to ACTIVE. This sync only ever
    // computes ACTIVE / EXPIRED / TERMINATED / PENDING, so a `contractStatus` of
    // SUSPENDED here can only have come from the manual admin action
    // (setProviderStatus) — it IS the manual-suspension marker. Preserve it while
    // still refreshing the summary dates/terms; only a manual reactivation clears it.
    const current = await tx.provider.findUnique({
      where: { id: providerId },
      select: { contractStatus: true },
    });
    const manuallySuspended = current?.contractStatus === "SUSPENDED";

    const active = await tx.providerContract.findFirst({
      where: { providerId, status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { endDate: "desc" },
    });
    if (active) {
      await tx.provider.update({
        where: { id: providerId },
        data: {
          contractStatus: manuallySuspended ? "SUSPENDED" : "ACTIVE",
          contractStartDate: active.startDate,
          contractEndDate: active.endDate,
          paymentTermDays: active.paymentTermDays,
          creditLimit: active.creditLimit,
        },
      });
      return;
    }
    const any = await tx.providerContract.findFirst({ where: { providerId }, orderBy: { endDate: "desc" } });
    const computed = any
      ? (any.endDate < now || any.status === "EXPIRED" ? "EXPIRED" : any.status === "TERMINATED" ? "TERMINATED" : "PENDING")
      : "PENDING";
    await tx.provider.update({
      where: { id: providerId },
      data: {
        contractStatus: manuallySuspended ? "SUSPENDED" : computed,
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
            providerServiceCode: t.providerServiceCode,
            serviceName: t.serviceName,
            agreedRate: Math.round(Number(t.agreedRate) * factor * 100) / 100,
            tariffType: t.tariffType,
            requiresPreauth: t.requiresPreauth,
            maxQuantityPerVisit: t.maxQuantityPerVisit,
            serviceCategoryId: t.serviceCategoryId,
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
