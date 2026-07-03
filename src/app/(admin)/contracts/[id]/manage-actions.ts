"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EligibilityRule, TariffRateType, UnitOfMeasure, PricingRuleKind, ContractRuleScope } from "@prisma/client";

function s(fd: FormData, k: string) { const v = fd.get(k); return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined; }
function n(fd: FormData, k: string) { const v = s(fd, k); if (v === undefined) return undefined; const x = Number(v); return Number.isNaN(x) ? undefined : x; }

async function ownedContract(fd: FormData, tenantId: string) {
  const id = s(fd, "contractId");
  if (!id) throw new Error("contractId required");
  const c = await prisma.providerContract.findUnique({ where: { id, tenantId } });
  if (!c) throw new Error("Contract not found");
  return c;
}

function back(id: string) {
  revalidatePath(`/contracts/${id}`);
  redirect(`/contracts/${id}`);
}

// ── Applicability (§5.4) ──
export async function addApplicabilityAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const clientId = s(fd, "clientId");
  if (!clientId) redirect(`/contracts/${c.id}?error=Select+a+payer`);
  await prisma.contractApplicability.create({
    data: {
      contractId: c.id,
      clientId: clientId!,
      benefitCategory: s(fd, "benefitCategory") as never,
      memberCategory: s(fd, "memberCategory"),
      inclusionType: (s(fd, "inclusionType") as EligibilityRule) ?? "INCLUDE",
    },
  });
  back(c.id);
}

export async function removeApplicabilityAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const id = s(fd, "applicabilityId");
  if (id) await prisma.contractApplicability.update({ where: { id }, data: { isActive: false } });
  back(c.id);
}

// ── Branch coverage (§5.1 LISTED) ──
export async function attachBranchAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const branchId = s(fd, "branchId");
  if (branchId) {
    await prisma.contractBranch.upsert({
      where: { contractId_branchId: { contractId: c.id, branchId } },
      create: { contractId: c.id, branchId },
      update: {},
    });
  }
  back(c.id);
}

export async function detachBranchAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const id = s(fd, "contractBranchId");
  if (id) await prisma.contractBranch.delete({ where: { id } });
  back(c.id);
}

export async function createProviderBranchAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const name = s(fd, "name");
  if (name) await prisma.providerBranch.create({ data: { tenantId: session.user.tenantId, providerId: c.providerId, name, code: s(fd, "code") } });
  back(c.id);
}

// ── Tariff lines (§5.6) ──
export async function addTariffLineAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const serviceName = s(fd, "serviceName");
  if (!serviceName) redirect(`/contracts/${c.id}?error=Service+name+required`);
  const rateMissing = s(fd, "rateMissing") === "on";
  const rate = n(fd, "agreedRate");
  if (!rateMissing && (rate == null || rate <= 0)) redirect(`/contracts/${c.id}?error=Enter+a+rate+or+mark+rate-missing`);
  await prisma.providerTariff.create({
    data: {
      providerId: c.providerId,
      contractId: c.id,
      serviceName: serviceName!,
      cptCode: s(fd, "cptCode"),
      agreedRate: rate ?? 0,
      currency: c.currency,
      rateType: (s(fd, "rateType") as TariffRateType) ?? "FIXED",
      unitOfMeasure: (s(fd, "unitOfMeasure") as UnitOfMeasure) ?? "PER_ITEM",
      requiresPreauth: s(fd, "requiresPreauth") === "on",
      requiresReferral: s(fd, "requiresReferral") === "on",
      maxQuantityPerVisit: n(fd, "maxQuantityPerVisit"),
      rateMissing,
      effectiveFrom: c.startDate,
    },
  });
  back(c.id);
}

export async function deactivateTariffAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const id = s(fd, "tariffId");
  if (id) await prisma.providerTariff.update({ where: { id }, data: { isActive: false } });
  back(c.id);
}

// ── Exclusions (§5.9) ──
export async function addExclusionAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const serviceName = s(fd, "serviceName");
  if (serviceName) {
    await prisma.providerContractExclusion.create({
      data: { contractId: c.id, serviceName, cptCode: s(fd, "cptCode"), reason: s(fd, "reason"), level: "TARIFF_LINE" },
    });
  }
  back(c.id);
}

// ── Pricing rules — rule builder (§5.7 / §11.5) ──
export async function addPricingRuleAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const ruleKind = s(fd, "ruleKind") as PricingRuleKind | undefined;
  if (!ruleKind) redirect(`/contracts/${c.id}?error=Pick+a+rule+kind`);
  // Build kind-specific params from the simple builder fields.
  const params: Record<string, unknown> = {};
  const rate = n(fd, "rate");
  const pct = n(fd, "pct");
  const poolId = s(fd, "poolId");
  const carveOuts = s(fd, "carveOutDescriptions");
  if (rate != null) params.rate = rate;
  if (pct != null) params.pct = pct;
  if (poolId) params.poolId = poolId;
  if (carveOuts) params.carveOutDescriptions = carveOuts.split(",").map(x => x.trim()).filter(Boolean);
  await prisma.pricingRule.create({
    data: {
      tenantId: session.user.tenantId,
      contractId: c.id,
      scope: (s(fd, "scope") as ContractRuleScope) ?? "CONTRACT",
      ruleKind: ruleKind!,
      params: params as never,
      priority: n(fd, "priority") ?? 100,
    },
  });
  back(c.id);
}

export async function deactivatePricingRuleAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const c = await ownedContract(fd, session.user.tenantId);
  const id = s(fd, "ruleId");
  if (id) await prisma.pricingRule.update({ where: { id }, data: { isActive: false } });
  back(c.id);
}
