import { prisma } from "@/lib/prisma";

/**
 * Configurable fraud engine + investigations (Medvex spec §5.11 / gap G5.11).
 * Promotes hard-coded rules into client-configurable rules and adds an
 * investigation workflow over the alerts they raise. Uganda typologies:
 * phantom billing, dual invoicing, upcoding, unbundling, identity sharing,
 * collusive networks, AI-forgery.
 */
export class FraudEngineService {
  /**
   * Active rules for a (client) context: a client-specific rule overrides the
   * operator default of the same code. Returns the effective rule set.
   */
  static async getActiveRules(tenantId: string, clientId?: string | null) {
    const now = new Date();
    const rows = await prisma.fraudRule.findMany({
      where: {
        tenantId,
        enabled: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        AND: [{ OR: [{ clientId: clientId ?? null }, { clientId: null }] }],
      },
    });
    // Dedupe by code, preferring the client-specific rule.
    const byCode = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const existing = byCode.get(r.code);
      if (!existing || (r.clientId === (clientId ?? null) && existing.clientId === null)) {
        byCode.set(r.code, r);
      }
    }
    return [...byCode.values()];
  }

  /**
   * Configurable-rule scan over recently received claims (fraud-scan job).
   * Evaluates the effective FraudRule set per claim's client; thresholds come
   * from FraudRule.config. Idempotent: a claim never gets a second open alert
   * for the same rule code. Distinct from FraudService's intake heuristics —
   * these are the client-tunable Uganda typology rules.
   *
   * Supported codes (config keys, with defaults):
   *  - UPCODING           { variancePct: 20 }           billed vs contracted variance
   *  - HIGH_FREQUENCY     { maxClaims: 5, windowDays: 30 } member claim velocity
   *  - IDENTITY_SHARING   { maxProvidersPerDay: 2 }     one member, many providers, same day
   *  - PHANTOM_BILLING    { maxProviderClaimsPerDay: 30 } provider daily volume spike
   */
  static async scanRecentClaims(
    tenantId: string,
    opts: { lookbackHours?: number; now?: Date } = {},
  ): Promise<{ scanned: number; alertsCreated: number }> {
    const now = opts.now ?? new Date();
    const since = new Date(now.getTime() - (opts.lookbackHours ?? 24) * 60 * 60 * 1000);

    const claims = await prisma.claim.findMany({
      where: { tenantId, receivedAt: { gte: since }, status: { not: "VOID" } },
      select: {
        id: true,
        memberId: true,
        providerId: true,
        dateOfService: true,
        contractedVariancePct: true,
        member: { select: { group: { select: { clientId: true } } } },
      },
    });

    let alertsCreated = 0;
    const rulesByClient = new Map<string | null, Awaited<ReturnType<typeof FraudEngineService.getActiveRules>>>();

    for (const claim of claims) {
      const clientId = claim.member?.group?.clientId ?? null;
      if (!rulesByClient.has(clientId)) {
        rulesByClient.set(clientId, await this.getActiveRules(tenantId, clientId));
      }
      const rules = rulesByClient.get(clientId)!;

      for (const rule of rules) {
        const cfg = (rule.config ?? {}) as Record<string, number>;
        let triggered = false;
        let notes = "";

        switch (rule.code) {
          case "UPCODING": {
            const thresholdPct = cfg.variancePct ?? 20;
            const variancePct = claim.contractedVariancePct != null ? Number(claim.contractedVariancePct) * 100 : null;
            if (variancePct != null && variancePct > thresholdPct) {
              triggered = true;
              notes = `Billed ${variancePct.toFixed(1)}% above contracted rate (rule threshold ${thresholdPct}%)`;
            }
            break;
          }
          case "HIGH_FREQUENCY": {
            const maxClaims = cfg.maxClaims ?? 5;
            const windowDays = cfg.windowDays ?? 30;
            const count = await prisma.claim.count({
              where: {
                tenantId,
                memberId: claim.memberId,
                receivedAt: { gte: new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000) },
                status: { not: "VOID" },
              },
            });
            if (count > maxClaims) {
              triggered = true;
              notes = `Member has ${count} claims in ${windowDays} days (rule threshold ${maxClaims})`;
            }
            break;
          }
          case "IDENTITY_SHARING": {
            const maxProviders = cfg.maxProvidersPerDay ?? 2;
            const dayStart = new Date(claim.dateOfService); dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
            const sameDay = await prisma.claim.findMany({
              where: {
                tenantId,
                memberId: claim.memberId,
                dateOfService: { gte: dayStart, lt: dayEnd },
                status: { not: "VOID" },
              },
              select: { providerId: true },
            });
            const distinctProviders = new Set(sameDay.map((c) => c.providerId)).size;
            if (distinctProviders > maxProviders) {
              triggered = true;
              notes = `Member seen at ${distinctProviders} distinct providers on the same day (rule threshold ${maxProviders}) — possible identity sharing`;
            }
            break;
          }
          case "PHANTOM_BILLING": {
            const maxDaily = cfg.maxProviderClaimsPerDay ?? 30;
            const dayStart = new Date(claim.dateOfService); dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
            const count = await prisma.claim.count({
              where: {
                tenantId,
                providerId: claim.providerId,
                dateOfService: { gte: dayStart, lt: dayEnd },
                status: { not: "VOID" },
              },
            });
            if (count > maxDaily) {
              triggered = true;
              notes = `Provider recorded ${count} claims on one service day (rule threshold ${maxDaily}) — possible phantom billing`;
            }
            break;
          }
          default:
            break; // unknown codes are configuration for future evaluators
        }

        if (!triggered) continue;

        // Idempotency: one alert per (claim, rule code).
        const existing = await prisma.claimFraudAlert.findFirst({
          where: { tenantId, claimId: claim.id, rule: rule.code },
          select: { id: true },
        });
        if (existing) continue;

        await prisma.claimFraudAlert.create({
          data: {
            tenantId,
            claimId: claim.id,
            rule: rule.code,
            score: Math.min(100, rule.weight * 20),
            severity: rule.weight >= 5 ? "HIGH" : rule.weight >= 3 ? "MEDIUM" : "LOW",
            notes: `${rule.name}: ${notes}`,
          },
        });
        alertsCreated++;
      }
    }

    return { scanned: claims.length, alertsCreated };
  }
}

export class FraudInvestigationService {
  /** Open an investigation over a claim and/or a fraud alert. */
  static async open(tenantId: string, ref: { claimId?: string; fraudAlertId?: string; assigneeId?: string }) {
    return prisma.fraudInvestigation.create({
      data: {
        tenantId,
        claimId: ref.claimId ?? null,
        fraudAlertId: ref.fraudAlertId ?? null,
        assigneeId: ref.assigneeId ?? null,
        status: "OPEN",
      },
    });
  }

  static async assign(tenantId: string, id: string, assigneeId: string) {
    await this.load(tenantId, id);
    return prisma.fraudInvestigation.update({ where: { id }, data: { assigneeId, status: "IN_PROGRESS" } });
  }

  /** Close an investigation as SUBSTANTIATED or DISMISSED with findings/outcome. */
  static async resolve(
    tenantId: string,
    id: string,
    status: "SUBSTANTIATED" | "DISMISSED",
    data: { findings?: string; outcome?: string },
  ) {
    await this.load(tenantId, id);
    return prisma.fraudInvestigation.update({
      where: { id },
      data: { status, findings: data.findings, outcome: data.outcome, closedAt: new Date() },
    });
  }

  private static async load(tenantId: string, id: string) {
    const inv = await prisma.fraudInvestigation.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!inv) throw new Error("Investigation not found");
    return inv;
  }
}
