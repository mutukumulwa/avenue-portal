import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@prisma/client";
import { auditChainService } from "@/server/services/audit-chain.service";
import { buildCohortKey, cohortDistribution, cohortMeetsAnonymity } from "./cohort";

/**
 * PNOS F8.4 — publish an approved score period: freeze anonymized cohort benchmarks
 * and transition the provider scores to PUBLISHED.
 *
 * For each metric + cohort (tenant|type|tier) it computes the peer distribution
 * (percentile/median/range) over the SAMPLED providers and writes a frozen
 * PerformanceCohortBenchmark — but ONLY when the cohort has >= MIN_COHORT_PROVIDERS
 * distinct providers; a smaller cohort is SUPPRESSED (no benchmark row, so no peer is
 * derivable). The benchmark carries no provider identity. A corrected republish is a
 * NEW publicationVersion (the prior remains as history). This is advisory (D21) — it
 * never mutates a rate, tier, or provider status. Role-gated to the network operator
 * (the explicit network-analytics permission arrives F8.6). Stop (F8.4): no UI.
 */

const PUBLISH_ROLES = ["SUPER_ADMIN"];

export interface PublicationActor { userId: string; tenantId: string; role: string }

function assertPublisher(actor: PublicationActor): void {
  if (!PUBLISH_ROLES.includes(actor.role)) throw new Error("A network operator role is required to publish performance scores.");
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(6));
}

export interface PublicationResult {
  period: string;
  definitionVersion: string;
  benchmarks: number; // cohort benchmarks written
  suppressedCohorts: number; // metric+cohort groups below the anonymity threshold
  published: number; // provider score rows transitioned to PUBLISHED
}

export const ProviderPerformancePublicationService = {
  async publishPeriod(
    actor: PublicationActor,
    input: { period: string; definitionVersion?: string },
    db: PrismaClient = prisma,
  ): Promise<PublicationResult> {
    assertPublisher(actor);
    const tenantId = actor.tenantId;
    const definitionVersion = input.definitionVersion ?? "PNMC-1.0";
    const now = new Date();

    const scores = await db.providerPerformanceScore.findMany({ where: { tenantId, period: input.period, definitionVersion, providerBranchId: "" } });
    if (scores.length === 0) return { period: input.period, definitionVersion, benchmarks: 0, suppressedCohorts: 0, published: 0 };

    // Resolve each provider's cohort (type + tier) — the anonymized peer set.
    const providerIds = [...new Set(scores.map((s) => s.providerId))];
    const providers = await db.provider.findMany({ where: { id: { in: providerIds }, tenantId }, select: { id: true, type: true, tier: true } });
    const cohortOf = new Map(providers.map((p) => [p.id, buildCohortKey(tenantId, p.type, p.tier)]));

    // Group the SAMPLED, valued scores by (metricKey, cohortKey).
    const SEP = "";
    const groups = new Map<string, { metricKey: string; cohortKey: string; scores: typeof scores }>();
    for (const s of scores) {
      if (!s.meetsMinimumSample || s.value == null) continue; // an under-sample provider is excluded from the benchmark
      const cohortKey = cohortOf.get(s.providerId) ?? buildCohortKey(tenantId, null, null);
      const gk = `${s.metricKey}${SEP}${cohortKey}`;
      const g = groups.get(gk) ?? { metricKey: s.metricKey, cohortKey, scores: [] };
      g.scores.push(s);
      groups.set(gk, g);
    }

    let benchmarks = 0;
    let suppressedCohorts = 0;
    for (const g of groups.values()) {
      const distinctProviders = new Set(g.scores.map((s) => s.providerId));
      if (!cohortMeetsAnonymity(distinctProviders.size)) {
        suppressedCohorts += 1;
        continue; // suppressed — no benchmark row, no peer derivable
      }
      const values = g.scores.map((s) => Number(s.value));
      const d = cohortDistribution(values);
      const sampleSize = g.scores.reduce((a, s) => a + s.sampleSize, 0);
      const prior = await db.performanceCohortBenchmark.findFirst({ where: { tenantId, period: input.period, metricKey: g.metricKey, definitionVersion, cohortKey: g.cohortKey }, orderBy: { publicationVersion: "desc" }, select: { publicationVersion: true } });
      const publicationVersion = (prior?.publicationVersion ?? 0) + 1;
      const watermark = createHash("sha256").update(JSON.stringify({ tenantId, period: input.period, metricKey: g.metricKey, definitionVersion, cohortKey: g.cohortKey, publicationVersion, providerCount: distinctProviders.size, d }), "utf8").digest("hex");
      await db.performanceCohortBenchmark.create({
        data: {
          tenantId, period: input.period, periodStart: g.scores[0].periodStart, periodEnd: g.scores[0].periodEnd,
          metricKey: g.metricKey, definitionVersion, cohortKey: g.cohortKey,
          providerCount: distinctProviders.size, sampleSize, unit: g.scores[0].unit,
          minValue: dec(d.min), p25: dec(d.p25), median: dec(d.median), p75: dec(d.p75), p90: dec(d.p90), maxValue: dec(d.max),
          publicationVersion, publicationWatermark: watermark, frozenAt: now,
        },
      });
      benchmarks += 1;
    }

    // Publish every provider score for the period (DRAFT/PUBLISHED → PUBLISHED); a
    // corrected republish bumps its publicationVersion. Set the resolved cohortKey.
    for (const s of scores) {
      await db.providerPerformanceScore.update({
        where: { id: s.id },
        data: {
          status: "PUBLISHED", publishedAt: s.publishedAt ?? now, cohortKey: cohortOf.get(s.providerId) ?? null,
          publicationVersion: s.status === "PUBLISHED" ? s.publicationVersion + 1 : s.publicationVersion,
        },
      });
    }

    await auditChainService.append({
      actorId: actor.userId, action: "PERFORMANCE:PUBLISH", module: "PROVIDER",
      entityType: "PerformanceCohortBenchmark", entityId: `${input.period}:${definitionVersion}`, tenantId,
      payload: { period: input.period, definitionVersion, benchmarks, suppressedCohorts, published: scores.length },
      description: `Published performance period ${input.period} (${definitionVersion}): ${benchmarks} benchmark(s), ${suppressedCohorts} suppressed.`,
    });

    return { period: input.period, definitionVersion, benchmarks, suppressedCohorts, published: scores.length };
  },

  /** Read the frozen benchmark for a metric/cohort at the latest (or a given) publication version. */
  async getBenchmark(actor: PublicationActor, input: { period: string; metricKey: string; cohortKey: string; definitionVersion?: string; publicationVersion?: number }, db: PrismaClient = prisma) {
    assertPublisher(actor);
    return db.performanceCohortBenchmark.findFirst({
      where: { tenantId: actor.tenantId, period: input.period, metricKey: input.metricKey, cohortKey: input.cohortKey, definitionVersion: input.definitionVersion ?? "PNMC-1.0", ...(input.publicationVersion ? { publicationVersion: input.publicationVersion } : {}) },
      orderBy: { publicationVersion: "desc" },
    });
  },
} as const;
