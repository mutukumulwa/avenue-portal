/**
 * backfill-claim-intake-provenance.ts — Claims Autopilot F2.6.
 *
 * Report-only by DEFAULT. Writes only with `--apply`. Idempotent on repeated
 * runs. NEVER synthesises transport idempotency keys or fabricates receipts for
 * historical claims (§9.8) — the only write is a NON-unique
 * `suspectedDuplicateFingerprint` computed from a claim's own content so
 * retroactive duplicate-detection works.
 *
 * Flags:
 *   (none)            report-only: counts, anomalies, and a policies-non-live check.
 *   --apply           backfill missing suspectedDuplicateFingerprint on claims.
 *   --verify-non-live  exit non-zero if ANY policy resolves LIVE (post-deploy gate).
 *   --rollback        disable live automation: set every non-OFF policy to OFF +
 *                     DEACTIVATED. Never deletes receipts/runs (safe rollback).
 *
 * CLI: npx tsx scripts/backfill-claim-intake-provenance.ts [--apply|--verify-non-live|--rollback]
 */
import type { PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";
import { computeSuspectedDuplicateFingerprint } from "../src/server/services/claim-intake/fingerprint";
import type { NormalizedSubmission } from "../src/server/services/claim-intake/normalize";
import { effectivePolicyMode, type PolicyLike } from "../src/server/services/claim-autopilot/policy";

type Db = Pick<PrismaClient, "claim" | "autoAdjudicationPolicy" | "claimIntakeReceipt" | "claimProcessingRun">;

interface ClaimForFingerprint {
  id: string;
  tenantId: string;
  providerId: string;
  providerBranchId: string | null;
  memberId: string;
  serviceType: string;
  benefitCategory: string;
  dateOfService: Date;
  currency: string;
  billedAmount: Decimal | number | string;
  claimLines: Array<{ cptCode: string | null; drugCode?: string | null; icdCode: string | null; quantity: number; billedAmount: Decimal | number | string }>;
}

const upper = (s: string | null | undefined): string | null => (s == null ? null : s.trim().toUpperCase() || null);
const money = (v: Decimal | number | string): string => new Decimal(v.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed();

/**
 * Suspected-duplicate fingerprint for a historical claim, computed from the
 * claim's own content so it is consistent with what the canonical rail produces.
 */
export function claimSuspectFingerprint(claim: ClaimForFingerprint): string {
  const normalized = {
    encounter: {
      serviceType: claim.serviceType,
      benefitCategory: claim.benefitCategory,
      serviceFrom: claim.dateOfService.toISOString().slice(0, 10),
      serviceTo: null,
    },
    currency: claim.currency ?? null,
    totalBilled: money(claim.billedAmount),
    lines: claim.claimLines.map((l) => ({
      cptCode: upper(l.cptCode),
      drugCode: upper(l.drugCode ?? null),
      icdCode: upper(l.icdCode),
      quantity: l.quantity,
      billedAmount: money(l.billedAmount),
    })),
  } as unknown as NormalizedSubmission;
  return computeSuspectedDuplicateFingerprint({
    tenantId: claim.tenantId,
    providerId: claim.providerId,
    branchId: claim.providerBranchId,
    memberKey: claim.memberId,
    normalized,
  });
}

export interface BackfillReport {
  claimsTotal: number;
  claimsMissingSuspectFp: number;
  claimsUpdated: number;
  policiesTotal: number;
  policiesResolvingLive: string[];
  anomalies: string[];
  applied: boolean;
}

/** List policy ids that resolve LIVE under the fail-closed resolver. */
export async function verifyPoliciesNonLive(db: Db): Promise<string[]> {
  const policies = await db.autoAdjudicationPolicy.findMany();
  return policies.filter((p) => effectivePolicyMode(p as unknown as PolicyLike) === "LIVE").map((p) => p.id);
}

/** Report + (optionally) backfill suspectedDuplicateFingerprint. Idempotent. */
export async function runBackfill(db: Db, opts: { apply: boolean }): Promise<BackfillReport> {
  const anomalies: string[] = [];

  const claimsTotal = await db.claim.count();
  const missing = await db.claim.findMany({
    where: { suspectedDuplicateFingerprint: null },
    select: {
      id: true, tenantId: true, providerId: true, providerBranchId: true, memberId: true,
      serviceType: true, benefitCategory: true, dateOfService: true, currency: true, billedAmount: true,
      claimLines: { select: { cptCode: true, icdCode: true, quantity: true, billedAmount: true } },
    },
  });

  let claimsUpdated = 0;
  if (opts.apply) {
    for (const c of missing) {
      const fp = claimSuspectFingerprint(c as unknown as ClaimForFingerprint);
      await db.claim.update({ where: { id: c.id }, data: { suspectedDuplicateFingerprint: fp } });
      claimsUpdated += 1;
    }
  }

  // Anomaly: a SUCCEEDED receipt must reference a claim (accepted ⇒ one claim).
  const succeededWithoutClaim = await db.claimIntakeReceipt.count({ where: { state: "SUCCEEDED", claimId: null } });
  if (succeededWithoutClaim > 0) anomalies.push(`${succeededWithoutClaim} SUCCEEDED receipt(s) with no linked claim`);

  const policiesTotal = await db.autoAdjudicationPolicy.count();
  const policiesResolvingLive = await verifyPoliciesNonLive(db);

  return {
    claimsTotal,
    claimsMissingSuspectFp: missing.length,
    claimsUpdated,
    policiesTotal,
    policiesResolvingLive,
    anomalies,
    applied: opts.apply,
  };
}

/**
 * Safe rollback: stop live automation without losing data. Sets every non-OFF
 * policy to OFF + DEACTIVATED. Receipts and processing runs are never deleted.
 */
export async function rollbackDisableLive(db: Db, actorId: string, reason: string): Promise<number> {
  const res = await db.autoAdjudicationPolicy.updateMany({
    where: { mode: { not: "OFF" } },
    data: { mode: "OFF", status: "DEACTIVATED", deactivatedById: actorId, deactivationReason: reason },
  });
  return res.count;
}

// ── CLI (runs only when executed directly, not when imported by tests) ────────
async function mainCli(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });
  try {
    const argv = process.argv.slice(2);
    if (argv.includes("--rollback")) {
      const n = await rollbackDisableLive(prisma, "cli-rollback", "operator rollback via backfill script");
      console.log(`Rollback: disabled ${n} non-OFF policy row(s). Receipts/runs preserved.`);
      return;
    }
    const report = await runBackfill(prisma, { apply: argv.includes("--apply") });
    console.log(JSON.stringify(report, null, 2));
    if (argv.includes("--verify-non-live") && report.policiesResolvingLive.length > 0) {
      console.error(`✗ ${report.policiesResolvingLive.length} policy(ies) resolve LIVE: ${report.policiesResolvingLive.join(", ")}`);
      process.exitCode = 1;
    } else if (report.anomalies.length > 0) {
      console.error(`⚠ anomalies: ${report.anomalies.join("; ")}`);
      process.exitCode = 1;
    } else {
      console.log(report.applied ? `✓ Backfill applied (${report.claimsUpdated} updated).` : "✓ Report-only (no writes).");
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].endsWith("backfill-claim-intake-provenance.ts")) {
  mainCli().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
