/**
 * P1.6 / P1-DoD — the concurrency proof: one remaining balance cannot be
 * double-spent (Story P1-A), demonstrated against a REAL Postgres under
 * Serializable isolation with bounded retry.
 *
 * OPT-IN: runs only when BOTH are true (so it can never touch a real DB):
 *   P1_TEST_DB   = postgres URL of a THROWAWAY database
 *   DATABASE_URL = the same URL (services read @/lib/prisma at import)
 *
 * Driver (see uat/priority-six/P1_IMPLEMENTATION_LOG.md):
 *   createdb p1_race && DATABASE_URL=... npx prisma db push
 *   DATABASE_URL=... npx tsx prisma/seed.ts
 *   P1_TEST_DB=... DATABASE_URL=... npx vitest run tests/integration/benefit-race.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.P1_TEST_DB && process.env.DATABASE_URL === process.env.P1_TEST_DB;

describe.skipIf(!URL_SET)("P1-A integration — concurrent approvals cannot double-spend one balance", () => {
  // Imports deferred so the mocked-prisma unit suites never construct a client.
  let prisma: (typeof import("@/lib/prisma"))["prisma"];
  let Decisions: (typeof import("@/server/services/claim-decision.service"))["ClaimDecisionService"];

  let tenantId: string;
  let memberId: string;
  let reviewerId: string;
  let configId: string;
  let periodStartAt: Date;
  let configLimit = 0;
  let usedBefore = 0;
  const claimIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    Decisions = (await import("@/server/services/claim-decision.service")).ClaimDecisionService;

    // Pick a seeded ACTIVE principal whose package has an OUTPATIENT config.
    const member = await prisma.member.findFirst({
      where: {
        status: "ACTIVE",
        relationship: "PRINCIPAL",
        packageVersion: { benefits: { some: { category: "OUTPATIENT" } } },
      },
      select: {
        id: true,
        tenantId: true,
        enrollmentDate: true,
        packageVersionId: true,
        groupId: true,
        packageId: true,
        group: { select: { clientId: true } },
      },
    });
    if (!member) throw new Error("Seed data has no ACTIVE principal with an OUTPATIENT config");
    memberId = member.id;
    tenantId = member.tenantId;

    const config = await prisma.benefitConfig.findFirst({
      where: { packageVersionId: member.packageVersionId!, category: "OUTPATIENT" },
      select: { id: true, annualSubLimit: true },
    });
    configLimit = Number(config!.annualSubLimit);

    const reviewer = await prisma.user.findFirst({ where: { tenantId, role: "SUPER_ADMIN" }, select: { id: true } });
    reviewerId = reviewer!.id;

    // Force the member's remaining OUTPATIENT balance to exactly 100,000 for
    // the current enrollment-anniversary period.
    const { BenefitUsageService } = await import("@/server/services/benefit-usage.service");
    const { periodStart, periodEnd } = BenefitUsageService.periodFor(member.enrollmentDate);
    configId = config!.id;
    periodStartAt = periodStart;
    usedBefore = configLimit - 100_000;
    await prisma.benefitUsage.upsert({
      where: { memberId_benefitConfigId_periodStart: { memberId, benefitConfigId: config!.id, periodStart } },
      update: { amountUsed: usedBefore, activeHoldAmount: 0 },
      create: { memberId, benefitConfigId: config!.id, periodStart, periodEnd, amountUsed: usedBefore, activeHoldAmount: 0, claimCount: 1 },
    });

    // Two line-less UNDER_REVIEW claims of 80,000 each (line-less keeps the
    // contract machinery out of the way; the race is about the benefit ledger).
    const provider = await prisma.provider.findFirst({ where: { tenantId }, select: { id: true } });
    for (const n of [1, 2]) {
      const created = await prisma.claim.create({
        data: {
          tenantId,
          claimNumber: `CLM-P1RACE-${Date.now()}-${n}`,
          memberId,
          providerId: provider!.id,
          serviceType: "OUTPATIENT",
          benefitCategory: "OUTPATIENT",
          status: "UNDER_REVIEW",
          dateOfService: new Date(),
          billedAmount: 80_000,
          approvedAmount: 0,
          copayAmount: 0,
          diagnoses: [],
          procedures: [],
        },
        select: { id: true },
      });
      claimIds.push(created.id);
    }
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("exactly one of two simultaneous 80k approvals against a 100k balance commits", async () => {
    const results = await Promise.allSettled(
      claimIds.map((id) =>
        Decisions.decide(tenantId, id, {
          action: "APPROVED",
          approvedAmount: 80_000,
          reviewerId,
          reviewerRole: "SUPER_ADMIN",
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    // Surfaced on failure so a fixture problem is distinguishable from a race problem.
    for (const r of rejected) console.log("REJECTED:", String(r.reason?.message ?? r.reason));

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser is a clean benefit block (retry re-ran it against the winner's
    // committed state) or, at worst, the bounded-retry operator message.
    expect(String(rejected[0].reason?.message ?? rejected[0].reason)).toMatch(
      /BENEFIT_CATEGORY_EXHAUSTED|BENEFIT_CONCURRENCY_RETRY/,
    );

    // Ledger: exactly ONE consumption on the controlled row — remaining is
    // 20k, never negative (the member may hold other seed-era usage rows).
    const row = await prisma.benefitUsage.findUnique({
      where: { memberId_benefitConfigId_periodStart: { memberId, benefitConfigId: configId, periodStart: periodStartAt } },
      select: { amountUsed: true },
    });
    const totalUsed = Number(row!.amountUsed);
    expect(totalUsed).toBe(usedBefore + 80_000);
    expect(totalUsed).toBeLessThanOrEqual(configLimit);

    // Claim states: one APPROVED, one still UNDER_REVIEW (no side effects).
    const claims = await prisma.claim.findMany({ where: { id: { in: claimIds } }, select: { status: true } });
    expect(claims.map((c) => c.status).sort()).toEqual(["APPROVED", "UNDER_REVIEW"]);
  }, 60_000);
});
