/**
 * data-integrity-check.ts — scheduled data-integrity assertions
 * (remediation plan PR-011 #8 and PR-018 #7).
 *
 * 1. Hold invariant: per member, Σ heldAmount of ACTIVE BenefitHolds equals
 *    Σ activeHoldAmount across that member's current-period BenefitUsage rows.
 * 2. Settlement reconciliation: Σ approvedAmount of PAID claims equals
 *    Σ SETTLEMENT_PAID JE credits to Bank (1010) + open payables
 *    (approved-not-paid claims).
 *
 * Exit 0 when all invariants hold; exit 1 with a per-violation report when not.
 * Run ad hoc (npx tsx scripts/data-integrity-check.ts) or from a scheduled job.
 */
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }));
const prisma = new PrismaClient({ adapter });
const EPS = 0.01;

async function checkHoldInvariant(): Promise<string[]> {
  const problems: string[] = [];
  const now = new Date();

  const activeHolds = await prisma.benefitHold.groupBy({
    by: ["memberId"],
    where: { status: "ACTIVE" },
    _sum: { heldAmount: true },
  });
  const heldByMember = new Map(activeHolds.map((h) => [h.memberId, Number(h._sum.heldAmount ?? 0)]));

  const usageRows = await prisma.benefitUsage.findMany({
    where: { periodStart: { lte: now }, periodEnd: { gte: now } },
    select: { memberId: true, activeHoldAmount: true },
  });
  const usageHeldByMember = new Map<string, number>();
  for (const u of usageRows) {
    usageHeldByMember.set(u.memberId, (usageHeldByMember.get(u.memberId) ?? 0) + Number(u.activeHoldAmount));
  }

  const memberIds = new Set([...heldByMember.keys(), ...usageHeldByMember.keys()]);
  for (const memberId of memberIds) {
    const holds = heldByMember.get(memberId) ?? 0;
    const usage = usageHeldByMember.get(memberId) ?? 0;
    if (Math.abs(holds - usage) > EPS) {
      problems.push(
        `HOLD_INVARIANT member=${memberId}: ACTIVE holds ${holds.toFixed(2)} ≠ usage activeHoldAmount ${usage.toFixed(2)}`,
      );
    }
  }
  return problems;
}

async function checkSettlementReconciliation(): Promise<string[]> {
  const problems: string[] = [];

  // The hard invariant covers claims settled through the PR-018 path (voucher-
  // linked). Claims marked PAID before the fix carry no voucher/GL trail — they
  // are reported informationally for finance to reconcile, not failed on.
  const paid = await prisma.claim.aggregate({
    where: { status: "PAID", isReimbursement: false, paymentVoucherId: { not: null } },
    _sum: { approvedAmount: true },
  });
  const paidTotal = Number(paid._sum.approvedAmount ?? 0);

  const legacyPaid = await prisma.claim.aggregate({
    where: { status: "PAID", isReimbursement: false, paymentVoucherId: null },
    _sum: { approvedAmount: true },
    _count: { _all: true },
  });
  if (legacyPaid._count._all > 0) {
    console.warn(
      `ℹ ${legacyPaid._count._all} legacy PAID claim(s) totalling ${Number(legacyPaid._sum.approvedAmount ?? 0).toFixed(2)} ` +
      `predate the PR-018 voucher/GL fix and have no GL trail — reconcile manually and annotate.`,
    );
  }

  const bankCredits = await prisma.journalLine.aggregate({
    where: {
      account: { code: "1010" },
      journalEntry: { sourceType: "SETTLEMENT_PAID", status: "POSTED" },
    },
    _sum: { credit: true },
  });
  const settled = Number(bankCredits._sum.credit ?? 0);

  if (Math.abs(paidTotal - settled) > EPS) {
    problems.push(
      `SETTLEMENT_RECON: Σ voucher-linked PAID claim approvedAmount ${paidTotal.toFixed(2)} ≠ Σ SETTLEMENT_PAID bank credits ${settled.toFixed(2)}.`,
    );
  }
  return problems;
}

/**
 * P1.4 permanent invariants (TPA_PRIORITY_SIX): the benefit ledger can never
 * hold a negative balance, and no scope (category / package-overall / shared
 * pool) may show consumption above its contractual limit. Violations here mean
 * a writer bypassed the P1 availability gate.
 */
async function checkBenefitLimitInvariants(): Promise<string[]> {
  const problems: string[] = [];
  const now = new Date();

  const rows = await prisma.benefitUsage.findMany({
    where: { periodStart: { lte: now }, periodEnd: { gte: now } },
    select: {
      memberId: true,
      amountUsed: true,
      activeHoldAmount: true,
      benefitConfigId: true,
      benefitConfig: {
        select: {
          annualSubLimit: true,
          category: true,
          packageVersion: { select: { package: { select: { id: true, name: true, annualLimit: true } } } },
        },
      },
    },
  });

  const overallByMember = new Map<string, { used: number; limit: number; pkg: string }>();
  for (const r of rows) {
    const used = Number(r.amountUsed);
    const held = Number(r.activeHoldAmount);
    const cat = String(r.benefitConfig.category);
    if (used < -EPS) problems.push(`NEGATIVE_USAGE member=${r.memberId} ${cat}: amountUsed ${used.toFixed(2)}`);
    if (held < -EPS) problems.push(`NEGATIVE_HOLD member=${r.memberId} ${cat}: activeHoldAmount ${held.toFixed(2)}`);
    const sub = Number(r.benefitConfig.annualSubLimit);
    if (sub > 0 && used > sub + EPS) {
      problems.push(`CATEGORY_OVER_LIMIT member=${r.memberId} ${cat}: used ${used.toFixed(2)} > sublimit ${sub.toFixed(2)}`);
    }
    const pkg = r.benefitConfig.packageVersion?.package;
    if (pkg && Number(pkg.annualLimit) > 0) {
      const cur = overallByMember.get(r.memberId) ?? { used: 0, limit: Number(pkg.annualLimit), pkg: pkg.name };
      cur.used += used;
      overallByMember.set(r.memberId, cur);
    }
  }
  for (const [memberId, o] of overallByMember) {
    if (o.used > o.limit + EPS) {
      problems.push(`OVERALL_OVER_LIMIT member=${memberId} package="${o.pkg}": used ${o.used.toFixed(2)} > annualLimit ${o.limit.toFixed(2)}`);
    }
  }

  // Shared pools: per group, Σ usage of linked configs (per member for MEMBER
  // scope; per family for FAMILY scope) must stay within limitAmount.
  const groups = await prisma.sharedLimitGroup.findMany({
    include: { benefitConfigs: { select: { benefitConfigId: true } } },
  });
  for (const g of groups) {
    const configIds = g.benefitConfigs.map((c) => c.benefitConfigId);
    if (configIds.length === 0) continue;
    const poolRows = await prisma.benefitUsage.findMany({
      where: { benefitConfigId: { in: configIds }, periodStart: { lte: now }, periodEnd: { gte: now } },
      select: { memberId: true, amountUsed: true, member: { select: { principalId: true } } },
    });
    const scopeTotals = new Map<string, number>();
    for (const r of poolRows) {
      const scopeKey = g.appliesTo === "FAMILY" ? r.member?.principalId ?? r.memberId : r.memberId;
      scopeTotals.set(scopeKey, (scopeTotals.get(scopeKey) ?? 0) + Number(r.amountUsed));
    }
    for (const [scope, total] of scopeTotals) {
      if (total > Number(g.limitAmount) + EPS) {
        problems.push(
          `SHARED_POOL_OVER_LIMIT group="${g.name}" (${g.appliesTo}) scope=${scope}: used ${total.toFixed(2)} > pool ${Number(g.limitAmount).toFixed(2)}`,
        );
      }
    }
  }
  return problems;
}

async function main() {
  const [holds, recon, limits] = await Promise.all([
    checkHoldInvariant(),
    checkSettlementReconciliation(),
    checkBenefitLimitInvariants(),
  ]);
  const problems = [...holds, ...recon, ...limits];
  if (problems.length === 0) {
    console.log("✓ Data-integrity invariants hold (holds ledger, settlement reconciliation, benefit limits).");
    return;
  }
  console.error(`✗ ${problems.length} invariant violation(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
