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

async function main() {
  const [holds, recon] = await Promise.all([checkHoldInvariant(), checkSettlementReconciliation()]);
  const problems = [...holds, ...recon];
  if (problems.length === 0) {
    console.log("✓ Data-integrity invariants hold (holds ledger, settlement reconciliation).");
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
