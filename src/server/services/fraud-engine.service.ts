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
