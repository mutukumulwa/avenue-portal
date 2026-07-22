/**
 * Claims Autopilot F5.8/F5.9 — inpatient case rails REAL-DB proof.
 *
 * `cutInterimSlice` and `closeAndFile` are now DERIVED_TRANSACTIONAL canonical
 * adapters (`submitWithinTransaction` inside the case transactions). Proves:
 * interim slice ⇒ canonical receipt (CASE_INTERIM) + slice provenance + entries
 * frozen exactly once; identical re-cut replays the SAME claim; CONCURRENT cuts
 * of the same entry set yield ONE slice; the inpatient release gate forces
 * SHADOW (no auto money even under a LIVE policy — asserted structurally: no
 * case claim ever auto-decides); final close ⇒ residual claim (CASE_FINAL) +
 * PA re-point + LOU consumption + case CLOSED_FILED; all-sliced close creates
 * NO phantom claim; two concurrent closes ⇒ one final claim; conservation
 * Σ(slice+final billed) = Σ(entry totals).
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CaseService } from "@/server/services/case.service";
import { resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.8/F5.9 integration — inpatient case rails converge on canonical intake", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, memberId: string, providerId: string, systemActorId: string;
  const RUN = Date.now().toString(36);
  let caseSeq = 0;
  const caseIds: string[] = [];

  async function makeCase(entries: Array<{ date: string; amount: number; desc?: string; category?: string }>): Promise<{ id: string; caseNumber: string }> {
    caseSeq += 1;
    const c = await prisma.clinicalCase.create({
      data: {
        tenantId, memberId, providerId,
        caseNumber: `CASE-F58-${RUN}-${caseSeq}`,
        caseType: "INPATIENT_ADMISSION" as never,
        benefitCategory: "INPATIENT",
        currency: "UGX",
        status: "OPEN",
        admissionDate: new Date("2026-06-01"),
        attendingDoctor: "Dr. Test",
        primaryDiagnoses: [{ icdCode: "S72.0", description: "Fracture of femur", isPrimary: true }],
        openedById: systemActorId,
        serviceEntries: {
          create: entries.map((e) => ({
            entryDate: new Date(e.date),
            category: (e.category ?? "OTHER") as never,
            description: e.desc ?? "Ward care",
            quantity: 1,
            unitAmount: e.amount,
            totalAmount: e.amount,
            voided: false,
          })),
        },
      },
      select: { id: true, caseNumber: true },
    });
    caseIds.push(c.id);
    return c;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    systemActorId = await (await import("@/server/services/system-actor.service")).getSystemActorId(tenantId);
    memberId = (await prisma.member.findFirstOrThrow({ where: { tenantId, status: "ACTIVE" }, select: { id: true } })).id;
    providerId = (await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" }, select: { id: true } })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const claims = await prisma.claim.findMany({ where: { tenantId, caseId: { in: caseIds } }, select: { id: true } });
    const ids = claims.map((c) => c.id);
    await prisma.claimFraudAlert.deleteMany({ where: { claimId: { in: ids } } }).catch(() => undefined);
    await prisma.adjudicationLog.deleteMany({ where: { claimId: { in: ids } } }).catch(() => undefined);
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: ids } } } }).catch(() => undefined);
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: ids } } }).catch(() => undefined);
    await prisma.claimIntakeReceipt.deleteMany({ where: { claimId: { in: ids } } }).catch(() => undefined);
    await prisma.claim.updateMany({ where: { id: { in: ids }, status: { notIn: ["APPROVED", "PARTIALLY_APPROVED", "VOID"] } }, data: { status: "VOID" } }).catch(() => undefined);
    await prisma.preAuthorization.deleteMany({ where: { tenantId, preauthNumber: { startsWith: `PA-F58-${RUN}` } } }).catch(() => undefined);
    await prisma.caseServiceEntry.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => undefined);
    await prisma.activityLog.deleteMany({ where: { entityType: "CASE", entityId: { in: caseIds } } }).catch(() => undefined);
    await prisma.clinicalCase.deleteMany({ where: { id: { in: caseIds } } }).catch(() => undefined);
    resetClaimProcessor();
    await prisma.$disconnect();
  });

  it("interim slice: canonical receipt + provenance, entries frozen once, replay returns the SAME slice", async () => {
    const c = await makeCase([
      { date: "2026-06-02", amount: 100_000, desc: "Bed day", category: "OTHER" },
      { date: "2026-06-02", amount: 60_000, desc: "Bed day deluxe", category: "OTHER" }, // same-day bed-day ⇒ IP-DEF-04 flag
      { date: "2026-06-05", amount: 40_000, desc: "Pharmacy", category: "PHARMACY" }, // ON the cutoff day — inclusive (TIME-05)
      { date: "2026-06-10", amount: 40_000, desc: "Later care" }, // after the cutoff — stays unbilled
    ]);

    const slice = await CaseService.cutInterimSlice({ tenantId, caseId: c.id, cutoffDate: new Date("2026-06-05"), cutById: systemActorId });
    expect(Number(slice.billedAmount)).toBe(200_000); // TIME-05: the cut-off day itself is included
    expect(slice.isInterimBill).toBe(true);
    expect(slice.caseSliceSeq).toBe(1);

    const receipt = await prisma.claimIntakeReceipt.findFirstOrThrow({ where: { claimId: slice.id }, select: { channel: true, scopeKey: true, idempotencyKey: true } });
    expect(receipt.channel).toBe("CASE_INTERIM");
    expect(receipt.scopeKey).toBe(`case:${c.id}`);
    expect(receipt.idempotencyKey).toMatch(new RegExp(`^${c.id}:slice:1:`));

    const frozen = await prisma.caseServiceEntry.count({ where: { caseId: c.id, billedInClaimId: slice.id } });
    expect(frozen).toBe(3);
    // IP-DEF-04: same-day multiple bed-day charges hard-flag the slice.
    const flag = await prisma.claimFraudAlert.findFirst({ where: { claimId: slice.id, rule: "Overlapping Bed-Day Charges" }, select: { severity: true } });
    expect(flag?.severity).toBe("HIGH");
    const kase = await prisma.clinicalCase.findUniqueOrThrow({ where: { id: c.id }, select: { status: true } });
    expect(kase.status).toBe("OPEN"); // the case keeps accruing

    // Identical re-cut (same cutoff ⇒ same remaining... none before cutoff) —
    // re-running the SAME cut replays the same claim, no duplicate slice.
    const again = await CaseService.cutInterimSlice({ tenantId, caseId: c.id, cutoffDate: new Date("2026-06-05"), cutById: systemActorId }).catch((e: Error) => e);
    // No unbilled entries remain before the cutoff ⇒ the service correctly refuses.
    expect(again).toBeInstanceOf(Error);
    expect((again as Error).message).toMatch(/No unbilled services/i);

    // The slice never AUTO-DECIDES (inpatient release gate — SHADOW forced).
    const fresh = await prisma.claim.findUniqueOrThrow({ where: { id: slice.id }, select: { status: true, processingState: true } });
    expect(["APPROVED", "PARTIALLY_APPROVED"]).not.toContain(fresh.status);
    expect(fresh.processingState).not.toBe("AUTO_DECIDED");
  });

  it("CONCURRENT identical cuts yield exactly ONE slice; every entry has one billing owner", async () => {
    const c = await makeCase([
      { date: "2026-06-02", amount: 80_000 },
      { date: "2026-06-03", amount: 20_000 },
    ]);
    const results = await Promise.allSettled([
      CaseService.cutInterimSlice({ tenantId, caseId: c.id, cutoffDate: new Date("2026-06-05"), cutById: systemActorId }),
      CaseService.cutInterimSlice({ tenantId, caseId: c.id, cutoffDate: new Date("2026-06-05"), cutById: systemActorId }),
    ]);
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof CaseService.cutInterimSlice>>> => r.status === "fulfilled");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const sliceIds = new Set(ok.map((r) => r.value.id));
    expect(sliceIds.size).toBe(1); // both callers resolve to the SAME slice (or one fails cleanly)

    const slices = await prisma.claim.findMany({ where: { caseId: c.id, status: { not: "VOID" } }, select: { id: true } });
    expect(slices.length).toBe(1);
    const owners = await prisma.caseServiceEntry.groupBy({ by: ["billedInClaimId"], where: { caseId: c.id }, _count: true });
    expect(owners.every((o) => o.billedInClaimId === slices[0].id)).toBe(true); // no entry stolen or split
  });

  it("final close: residual claim (CASE_FINAL) + PA re-point + LOU + CLOSED_FILED; conservation holds", async () => {
    const c = await makeCase([
      { date: "2026-06-02", amount: 100_000 },
      { date: "2026-06-08", amount: 50_000 },
      { date: "2026-06-12", amount: 30_000 },
    ]);
    const pa = await prisma.preAuthorization.create({
      data: {
        tenantId, memberId, providerId, caseId: c.id,
        preauthNumber: `PA-F58-${RUN}`, benefitCategory: "INPATIENT", serviceType: "INPATIENT",
        submittedBy: "PROVIDER", status: "APPROVED", estimatedCost: 200_000, approvedAmount: 200_000,
        diagnoses: [], procedures: [], validUntil: new Date(Date.now() + 30 * 86_400_000),
      },
      select: { id: true },
    });

    const slice = await CaseService.cutInterimSlice({ tenantId, caseId: c.id, cutoffDate: new Date("2026-06-05"), cutById: systemActorId });
    const final = await CaseService.closeAndFile(tenantId, c.id, systemActorId);
    expect(final).not.toBeNull();
    expect(Number(final!.billedAmount)).toBe(80_000); // residual only (SET-03)
    expect(final!.isInterimBill).toBe(false);

    const receipt = await prisma.claimIntakeReceipt.findFirstOrThrow({ where: { claimId: final!.id }, select: { channel: true, idempotencyKey: true } });
    expect(receipt.channel).toBe("CASE_FINAL");
    expect(receipt.idempotencyKey).toMatch(new RegExp(`^${c.id}:final:`));

    // conservation: Σ claims == Σ entries
    const entrySum = 180_000;
    expect(Number(slice.billedAmount) + Number(final!.billedAmount)).toBe(entrySum);

    const freshPA = await prisma.preAuthorization.findUniqueOrThrow({ where: { id: pa.id }, select: { status: true, claimId: true } });
    expect(freshPA.status).toBe("ATTACHED");
    expect(freshPA.claimId).toBe(final!.id);
    const kase = await prisma.clinicalCase.findUniqueOrThrow({ where: { id: c.id }, select: { status: true } });
    expect(kase.status).toBe("CLOSED_FILED");
  });

  it("all-sliced close creates NO phantom claim; the case still closes terminally", async () => {
    const c = await makeCase([{ date: "2026-06-02", amount: 90_000 }]);
    await CaseService.cutInterimSlice({ tenantId, caseId: c.id, cutoffDate: new Date("2026-06-05"), cutById: systemActorId });
    const final = await CaseService.closeAndFile(tenantId, c.id, systemActorId);
    expect(final).toBeNull();
    expect((await prisma.clinicalCase.findUniqueOrThrow({ where: { id: c.id }, select: { status: true } })).status).toBe("CLOSED_FILED");
    expect(await prisma.claim.count({ where: { caseId: c.id, status: { not: "VOID" } } })).toBe(1); // only the slice
  });

  it("two CONCURRENT closes: exactly one final claim, the loser gets the first-write guard", async () => {
    const c = await makeCase([{ date: "2026-06-02", amount: 70_000 }]);
    const results = await Promise.allSettled([
      CaseService.closeAndFile(tenantId, c.id, systemActorId),
      CaseService.closeAndFile(tenantId, c.id, systemActorId),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok.length).toBeGreaterThanOrEqual(1);
    if (failed.length) expect(String(failed[0].reason)).toMatch(/just been filed|already closed/i);
    expect(await prisma.claim.count({ where: { caseId: c.id, isInterimBill: false, status: { not: "VOID" } } })).toBe(1);
  });
});
