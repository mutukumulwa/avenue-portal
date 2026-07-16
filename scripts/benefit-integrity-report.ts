/**
 * benefit-integrity-report.ts — P1.4 (TPA_PRIORITY_SIX): REPORT, don't correct.
 *
 * Reports, per tenant:
 *   1. NEGATIVE_USAGE / NEGATIVE_HOLD — benefit ledger below zero.
 *   2. CATEGORY_OVER_LIMIT / OVERALL_OVER_LIMIT / SHARED_POOL_OVER_LIMIT —
 *      consumption above a contractual limit (a writer bypassed the P1 gate).
 *   3. HOLD_DRIFT — stored BenefitUsage.activeHoldAmount differs from the live
 *      Σ of ACTIVE, unexpired BenefitHold rows for that (member, category).
 *
 * Read-only by default. `--apply` performs exactly ONE remediation class —
 * recomputing stored activeHoldAmount from the live ACTIVE unexpired holds
 * (a derived value, safe to rebuild). Every other violation class names the
 * offending records and requires a separately approved remediation
 * (plan §P1.4 rule 4: never silently correct production money data).
 *
 * Usage:
 *   npx tsx scripts/benefit-integrity-report.ts            # report only
 *   npx tsx scripts/benefit-integrity-report.ts --apply    # + fix HOLD_DRIFT
 */
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }));
const prisma = new PrismaClient({ adapter });
const EPS = 0.01;
const APPLY = process.argv.includes("--apply");

type Finding = { code: string; detail: string; fixable?: boolean };

async function run() {
  const now = new Date();
  const findings: Finding[] = [];

  // Live ACTIVE unexpired holds per (member, category).
  const activeHolds = await prisma.benefitHold.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: now } },
    select: { memberId: true, benefitCategory: true, heldAmount: true },
  });
  const liveHeld = new Map<string, number>();
  for (const h of activeHolds) {
    const key = `${h.memberId}::${h.benefitCategory}`;
    liveHeld.set(key, (liveHeld.get(key) ?? 0) + Number(h.heldAmount));
  }

  const rows = await prisma.benefitUsage.findMany({
    where: { periodStart: { lte: now }, periodEnd: { gte: now } },
    select: {
      id: true,
      memberId: true,
      amountUsed: true,
      activeHoldAmount: true,
      benefitConfig: {
        select: {
          annualSubLimit: true,
          category: true,
          packageVersion: { select: { package: { select: { name: true, annualLimit: true } } } },
        },
      },
    },
  });

  const overall = new Map<string, { used: number; limit: number; pkg: string }>();
  const driftRows: Array<{ id: string; memberId: string; category: string; stored: number; live: number }> = [];

  for (const r of rows) {
    const used = Number(r.amountUsed);
    const stored = Number(r.activeHoldAmount);
    const cat = String(r.benefitConfig.category);
    const key = `${r.memberId}::${cat}`;

    if (used < -EPS) findings.push({ code: "NEGATIVE_USAGE", detail: `member=${r.memberId} ${cat} amountUsed=${used.toFixed(2)}` });
    if (stored < -EPS) findings.push({ code: "NEGATIVE_HOLD", detail: `member=${r.memberId} ${cat} activeHoldAmount=${stored.toFixed(2)}` });

    const sub = Number(r.benefitConfig.annualSubLimit);
    if (sub > 0 && used > sub + EPS) {
      findings.push({ code: "CATEGORY_OVER_LIMIT", detail: `member=${r.memberId} ${cat} used=${used.toFixed(2)} > sublimit=${sub.toFixed(2)}` });
    }

    const pkg = r.benefitConfig.packageVersion?.package;
    if (pkg && Number(pkg.annualLimit) > 0) {
      const cur = overall.get(r.memberId) ?? { used: 0, limit: Number(pkg.annualLimit), pkg: pkg.name };
      cur.used += used;
      overall.set(r.memberId, cur);
    }

    const live = liveHeld.get(key) ?? 0;
    if (Math.abs(stored - live) > EPS) {
      findings.push({
        code: "HOLD_DRIFT",
        detail: `member=${r.memberId} ${cat} stored=${stored.toFixed(2)} live-active-unexpired=${live.toFixed(2)}`,
        fixable: true,
      });
      driftRows.push({ id: r.id, memberId: r.memberId, category: cat, stored, live });
    }
  }

  for (const [memberId, o] of overall) {
    if (o.used > o.limit + EPS) {
      findings.push({ code: "OVERALL_OVER_LIMIT", detail: `member=${memberId} package="${o.pkg}" used=${o.used.toFixed(2)} > annualLimit=${o.limit.toFixed(2)}` });
    }
  }

  const groups = await prisma.sharedLimitGroup.findMany({ include: { benefitConfigs: { select: { benefitConfigId: true } } } });
  for (const g of groups) {
    const configIds = g.benefitConfigs.map((c) => c.benefitConfigId);
    if (configIds.length === 0) continue;
    const poolRows = await prisma.benefitUsage.findMany({
      where: { benefitConfigId: { in: configIds }, periodStart: { lte: now }, periodEnd: { gte: now } },
      select: { memberId: true, amountUsed: true, member: { select: { principalId: true } } },
    });
    const totals = new Map<string, number>();
    for (const r of poolRows) {
      const scope = g.appliesTo === "FAMILY" ? r.member?.principalId ?? r.memberId : r.memberId;
      totals.set(scope, (totals.get(scope) ?? 0) + Number(r.amountUsed));
    }
    for (const [scope, total] of totals) {
      if (total > Number(g.limitAmount) + EPS) {
        findings.push({ code: "SHARED_POOL_OVER_LIMIT", detail: `group="${g.name}" (${g.appliesTo}) scope=${scope} used=${total.toFixed(2)} > pool=${Number(g.limitAmount).toFixed(2)}` });
      }
    }
  }

  if (findings.length === 0) {
    console.log("✓ Benefit ledger clean: no negative balances, no over-limit consumption, no hold drift.");
    return;
  }

  console.log(`✗ ${findings.length} finding(s):`);
  for (const f of findings) console.log(`  - [${f.code}]${f.fixable ? " (fixable with --apply)" : ""} ${f.detail}`);

  if (APPLY && driftRows.length > 0) {
    console.log(`\n--apply: recomputing stored activeHoldAmount from live ACTIVE unexpired holds for ${driftRows.length} row(s)…`);
    for (const d of driftRows) {
      await prisma.benefitUsage.update({ where: { id: d.id }, data: { activeHoldAmount: d.live, lastUpdated: new Date() } });
      console.log(`  ✓ member=${d.memberId} ${d.category}: ${d.stored.toFixed(2)} → ${d.live.toFixed(2)}`);
    }
    console.log("Done. Re-run without --apply to confirm a clean report.");
  } else if (driftRows.length > 0) {
    console.log(`\n${driftRows.length} HOLD_DRIFT row(s) are fixable — re-run with --apply to recompute them. All other classes need an approved remediation.`);
  }
  process.exitCode = 1;
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
