import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient, ProviderContractStatus } from "@prisma/client";
import { ProviderAccessService, type ProviderAccessContext } from "@/server/services/provider-access.service";
import {
  CONTRACT_VIEW_STATUSES,
  projectCapitationRule,
  projectContractHeader,
  projectDocRule,
  projectExclusion,
  projectPreauthRule,
  projectServedScope,
  projectTariff,
  projectVersion,
} from "./projection";
import { buildContractRatesCsv, type ContractRatesCsvEvidence } from "./csv";

/**
 * PNOS F7.2 — provider contract/rate read service.
 *
 * The ONE provider-safe view of a facility's OWN effective contracts, applicability,
 * branches, rules, and rates (F7.1 policy). It authorizes through the F1.3
 * ProviderAccessContext (provider.contract.read), scopes every query to the caller's
 * provider (non-enumerating), returns ONLY the F7.1 allow-listed fields (never
 * extraction/internal), and labels current/future/expired. It OWNS no contract state
 * — it never writes. Provider-facing pages (F7.3) stay gated on the F7.1 §10
 * network/legal/security sign-off; this service is stage-1 internal evidence.
 */

export const CONTRACT_VIEW_PERMISSION = "provider.contract.read";
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;

/** The provider-visible contract statuses as a typed Prisma `in` filter (F7.1 §2). */
const VISIBLE_STATUS: { in: ProviderContractStatus[] } = { in: [...CONTRACT_VIEW_STATUSES] as ProviderContractStatus[] };

type Db = PrismaClient | Prisma.TransactionClient;

function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
}

export const ProviderContractViewService = {
  /** List the provider's own contracts (in-force + historical), safe headers + effective label. */
  async list(ctx: ProviderAccessContext, opts: { now?: Date } = {}, db: Db = prisma) {
    ProviderAccessService.requirePermission(ctx, CONTRACT_VIEW_PERMISSION);
    const now = opts.now ?? new Date();
    const rows = await db.providerContract.findMany({
      where: { tenantId: ctx.tenantId, providerId: ctx.providerId, status: VISIBLE_STATUS },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      take: MAX_PAGE_SIZE,
    });
    return rows.map((c) => projectContractHeader(c, now));
  },

  /**
   * One contract, provider-scoped + non-enumerating (a contract that is not this
   * provider's, or is in a hidden negotiation state, resolves to null). Returns the
   * safe header + effective versions + derived served-scope + covered branches +
   * PA/document rules + exclusions + a capitation summary.
   */
  async getById(ctx: ProviderAccessContext, contractId: string, opts: { now?: Date } = {}, db: Db = prisma) {
    ProviderAccessService.requirePermission(ctx, CONTRACT_VIEW_PERMISSION);
    const now = opts.now ?? new Date();
    const c = await db.providerContract.findFirst({
      where: { id: contractId, tenantId: ctx.tenantId, providerId: ctx.providerId, status: VISIBLE_STATUS },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
        applicability: { where: { isActive: true } },
        contractBranches: { include: { branch: true } },
        preauthRules: { where: { isActive: true } },
        documentationRules: { where: { isActive: true } },
        exclusions: true,
        pricingRules: { where: { isActive: true } },
      },
    });
    if (!c) return null;
    return {
      header: projectContractHeader(c, now),
      versions: c.versions.map((v) => projectVersion(v, now)),
      servedScope: projectServedScope(c.applicability),
      branches: c.contractBranches.map((cb) => ({ name: cb.branch.name, code: cb.branch.code, county: cb.branch.county, isActive: cb.branch.isActive })),
      preauthRules: c.preauthRules.map(projectPreauthRule),
      documentRules: c.documentationRules.map(projectDocRule),
      exclusions: c.exclusions.map(projectExclusion),
      capitation: c.pricingRules.map(projectCapitationRule).filter((x): x is NonNullable<typeof x> => x != null),
    };
  },

  /**
   * The effective rate lines of one of the provider's contracts, at a service date,
   * with code/name search + deterministic pagination. Effective window mirrors the
   * engine (effectiveFrom ≤ endOfDay AND (effectiveTo null OR ≥ startOfDay)).
   */
  async getRates(
    ctx: ProviderAccessContext,
    contractId: string,
    opts: { serviceDate?: Date; code?: string; name?: string; page?: number; pageSize?: number } = {},
    db: Db = prisma,
  ): Promise<{ rates: ReturnType<typeof projectTariff>[]; page: { page: number; pageSize: number; total: number; totalPages: number } } | null> {
    ProviderAccessService.requirePermission(ctx, CONTRACT_VIEW_PERMISSION);
    // Scope the contract to the provider first (non-enumerating).
    const contract = await db.providerContract.findFirst({
      where: { id: contractId, tenantId: ctx.tenantId, providerId: ctx.providerId, status: VISIBLE_STATUS },
      select: { id: true },
    });
    if (!contract) return null;

    const { start, end } = dayBounds(opts.serviceDate ?? new Date());
    const page = Math.max(1, Math.trunc(opts.page ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(opts.pageSize ?? DEFAULT_PAGE_SIZE)));
    const and: Prisma.ProviderTariffWhereInput[] = [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] }];
    if (opts.code?.trim()) and.push({ OR: [{ cptCode: { contains: opts.code.trim(), mode: "insensitive" } }, { providerServiceCode: { contains: opts.code.trim(), mode: "insensitive" } }] });
    if (opts.name?.trim()) and.push({ OR: [{ serviceName: { contains: opts.name.trim(), mode: "insensitive" } }, { standardDescription: { contains: opts.name.trim(), mode: "insensitive" } }] });

    const where: Prisma.ProviderTariffWhereInput = { providerId: ctx.providerId, contractId, isActive: true, effectiveFrom: { lte: end }, AND: and };
    const [total, rows] = await Promise.all([
      db.providerTariff.count({ where }),
      db.providerTariff.findMany({ where, orderBy: [{ serviceName: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { rates: rows.map(projectTariff), page: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  /**
   * F7.3 — a provider-safe, watermarked CSV of one contract's effective rate
   * schedule (the same allow-listed rows the page shows). Provider-scoped +
   * non-enumerating (returns null for another provider's / a hidden contract).
   * Pages the effective rates to exhaustion so no line is omitted. The caller
   * (route) audits the egress with the returned evidence.
   */
  async exportRatesCsv(
    ctx: ProviderAccessContext,
    contractId: string,
    opts: { serviceDate?: Date } = {},
    db: Db = prisma,
  ): Promise<{ filename: string; csv: string; evidence: ContractRatesCsvEvidence } | null> {
    ProviderAccessService.requirePermission(ctx, CONTRACT_VIEW_PERMISSION);
    const serviceDate = opts.serviceDate ?? new Date();
    const detail = await ProviderContractViewService.getById(ctx, contractId, { now: serviceDate }, db);
    if (!detail) return null; // absent / another provider's / hidden state — indistinguishable

    const provider = await db.provider.findFirst({ where: { id: ctx.providerId, tenantId: ctx.tenantId }, select: { name: true } });

    // Page the effective rate lines to exhaustion (no omitted rows).
    const rates: ReturnType<typeof projectTariff>[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await ProviderContractViewService.getRates(ctx, contractId, { serviceDate, page, pageSize: MAX_PAGE_SIZE }, db);
      if (!res) return null;
      rates.push(...res.rates);
      totalPages = res.page.totalPages;
      page += 1;
    } while (page <= totalPages);

    const { csv, evidence } = buildContractRatesCsv({ header: detail.header, providerName: provider?.name ?? "provider", rates });
    const filename = `contract-rates-${detail.header.contractNumber}-${contractId.slice(0, 8)}.csv`.replace(/[^\w.-]+/g, "_");
    return { filename, csv, evidence };
  },
} as const;
