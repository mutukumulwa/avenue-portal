/**
 * Diagnosis Gate C2.5 — shadow read model REAL-DB proof.
 *
 * These are the numbers the go-live decision (gate G-C4) turns on, so the arithmetic is
 * pinned here. The most important assertion is that **dormant evaluations are excluded**:
 * counting "no pack in force" rows as clean claims would flatter every rate and could
 * make a gate look ready when it has barely been exercised.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { ClinicalGateReadService } from "@/server/services/diagnosis-gate/clinical-gate-read.service";
import type { ClinicalStageResult } from "@/server/services/claim-autopilot/stage-clinical";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("DG C2.5 integration — shadow read model", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, memberId: string, providerId: string, reviewerId: string;
  const tag = `dgs-${randomUUID().slice(0, 8)}`;
  const claimIds: string[] = [];
  const runIds: string[] = [];
  const receiptIds: string[] = [];
  const window = { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2030-01-01T00:00:00Z") };
  let seq = 0;

  /** Create a claim + run + a CLINICAL stage row carrying `result`. */
  async function recordEvaluation(result: ClinicalStageResult) {
    seq += 1;
    const claim = await prisma.claim.create({
      data: {
        tenantId, memberId, providerId, claimNumber: `${tag}-${seq}`,
        serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT",
        dateOfService: new Date("2026-06-01T09:00:00Z"),
        diagnoses: [], procedures: [], billedAmount: 1000, status: "APPROVED", currency: "UGX",
      },
      select: { id: true, claimNumber: true },
    });
    claimIds.push(claim.id);

    const receipt = await prisma.claimIntakeReceipt.create({
      data: {
        tenantId, scopeKey: `${tag}-scope`, channel: "ADMIN_PORTAL", idempotencyKey: `${tag}-${seq}`,
        schemaVersion: "1", requestHash: `${tag}-${seq}`, suspectedDuplicateFingerprint: `${tag}-${seq}`,
        correlationId: `${tag}-${seq}`, state: "SUCCEEDED", claimId: claim.id,
      },
      select: { id: true },
    });
    receiptIds.push(receipt.id);

    const run = await prisma.claimProcessingRun.create({
      data: { tenantId, claimId: claim.id, receiptId: receipt.id, state: "SHADOW_COMPLETE" },
      select: { id: true },
    });
    runIds.push(run.id);

    await prisma.claimProcessingStage.create({
      data: { runId: run.id, stage: "CLINICAL", state: "PASSED", result: result as never },
    });
    return claim;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const member = await prisma.member.findFirstOrThrow({ where: { status: "ACTIVE" }, select: { id: true, tenantId: true } });
    memberId = member.id;
    tenantId = member.tenantId;
    providerId = (await prisma.provider.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
    reviewerId = (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;

    // 2 dormant (no pack) — must not count as clean claims
    await recordEvaluation({ skipped: "NO_ACTIVE_PACK" });
    await recordEvaluation({ skipped: "GROUP_DISABLED", groupCode: "CIG-002" });
    // 1 out of scope
    await recordEvaluation({ packId: "p1", packVersion: 1, outOfScope: true });
    // 2 in scope and clean
    await recordEvaluation({ packId: "p1", packVersion: 1, groupCode: "CIG-001", groupName: "Malaria" });
    await recordEvaluation({ packId: "p1", packVersion: 1, groupCode: "CIG-001", groupName: "Malaria" });
    // 1 in scope, ambiguous, clean
    await recordEvaluation({ packId: "p1", packVersion: 1, groupCode: "CIG-001", groupName: "Malaria", ambiguous: true });
    // 1 in scope, clean, but with a rule that COULD NOT be checked (DG-D14)
    await recordEvaluation({
      packId: "p1", packVersion: 1, groupCode: "CIG-001", groupName: "Malaria",
      inertRules: [{ rule: "R3", testCode: "LAB003", testName: "Malaria RDT", windowHours: 12, reason: "SUBDAY_WINDOW_DATE_ONLY_DATA" }],
    });
    // 2 in scope with findings
    await recordEvaluation({
      packId: "p1", packVersion: 1, groupCode: "CIG-001", groupName: "Malaria", recordOnly: true,
      ruleHits: [{ rule: "R2", routeCode: "CLINICAL_LAB_UNSUPPORTED", testCode: "LAB010", testName: "Stool H Pylori", message: "H. pylori test lacks documented indication" }],
    });
    await recordEvaluation({
      packId: "p1", packVersion: 1, groupCode: "CIG-001", groupName: "Malaria", recordOnly: true,
      ruleHits: [
        { rule: "R2", routeCode: "CLINICAL_LAB_UNSUPPORTED", testCode: "LAB010", testName: "Stool H Pylori" },
        { rule: "R3", routeCode: "CLINICAL_REPEAT_WINDOW", testCode: "LAB003", testName: "Malaria RDT", priorClaimNumbers: ["OLD-1"] },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.clinicalShadowVerdict.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claimProcessingStage.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.claimProcessingRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.claim.deleteMany({ where: { id: { in: claimIds } } });
    await prisma.auditLog.deleteMany({ where: { tenantId, action: "CLINICAL_GATE:EXPORT" } });
    await prisma.$disconnect();
  });

  it("EXCLUDES dormant evaluations — they are not evidence that the rules found nothing", async () => {
    const s = await ClinicalGateReadService.summarize(tenantId, window);
    expect(s.dormant).toBe(2);
    // 9 recorded, 2 dormant, 1 out of scope ⇒ 6 in scope.
    expect(s.inScope).toBe(6);
    expect(s.outOfScope).toBe(1);
  });

  it("computes the would-route rate against IN-SCOPE claims only", async () => {
    const s = await ClinicalGateReadService.summarize(tenantId, window);
    expect(s.wouldRoute).toBe(2);
    expect(s.wouldRouteRate).toBeCloseTo(2 / 6, 6); // the guard against re-routing the book
  });

  it("counts claims and findings per rule separately", async () => {
    const s = await ClinicalGateReadService.summarize(tenantId, window);
    const r2 = s.rules.find((r) => r.rule === "R2")!;
    const r3 = s.rules.find((r) => r.rule === "R3")!;
    const r4 = s.rules.find((r) => r.rule === "R4")!;
    expect(r2.claims).toBe(2);
    expect(r2.findings).toBe(2);
    expect(r3.claims).toBe(1);
    expect(r4.findings).toBe(0);
    // Nothing reviewed yet ⇒ no false-positive rate may be claimed.
    expect(r2.sampledFalsePositiveRate).toBeNull();
  });

  it("surfaces ambiguity and the per-condition / per-test breakdown", async () => {
    const s = await ClinicalGateReadService.summarize(tenantId, window);
    expect(s.ambiguous).toBe(1);
    const malaria = s.byGroup.find((g) => g.groupCode === "CIG-001")!;
    expect(malaria).toMatchObject({ groupName: "Malaria", evaluated: 6, flagged: 2 });
    expect(s.topTests[0]).toMatchObject({ testCode: "LAB010", findings: 2 });
  });

  it("reports rules it COULD NOT check, so a low hit count is not read as clean (DG-D14)", async () => {
    const s = await ClinicalGateReadService.summarize(tenantId, window);
    expect(s.inertRules).toHaveLength(1);
    expect(s.inertRules[0]).toMatchObject({ rule: "R3", testCode: "LAB003", windowHours: 12, evaluations: 1 });
    // and it is attributed to the rule, beside that rule's hit counts
    expect(s.rules.find((r) => r.rule === "R3")!.inertEvaluations).toBe(1);
    expect(s.rules.find((r) => r.rule === "R2")!.inertEvaluations).toBe(0);
  });

  it("lists findings with bounded pagination and no member identifiers", async () => {
    const page = await ClinicalGateReadService.listHits(tenantId, { window, pageSize: 1 });
    expect(page.total).toBe(3); // 2 R2 + 1 R3
    expect(page.items).toHaveLength(1);
    expect(page.pageSize).toBe(1);
    const serialised = JSON.stringify(page.items);
    expect(serialised).not.toContain(memberId);
    // Filtering by rule narrows correctly.
    const r3 = await ClinicalGateReadService.listHits(tenantId, { window, rule: "R3" });
    expect(r3.total).toBe(1);
    expect(r3.items[0].hit.priorClaimNumbers).toEqual(["OLD-1"]);
  });

  it("caps an over-large page size rather than dumping everything", async () => {
    const page = await ClinicalGateReadService.listHits(tenantId, { window, pageSize: 100_000 });
    expect(page.pageSize).toBe(200);
  });

  it("turns clinician verdicts into the sampled false-positive rate", async () => {
    const hits = await ClinicalGateReadService.listHits(tenantId, { window, rule: "R2" });
    await ClinicalGateReadService.recordVerdict(tenantId, { claimId: hits.items[0].claimId, ruleCode: "R2", routeCode: "CLINICAL_LAB_UNSUPPORTED", verdict: "FALSE_POSITIVE", note: "clinically justified", reviewedById: reviewerId });
    await ClinicalGateReadService.recordVerdict(tenantId, { claimId: hits.items[1].claimId, ruleCode: "R2", routeCode: "CLINICAL_LAB_UNSUPPORTED", verdict: "TRUE_POSITIVE", reviewedById: reviewerId });

    const s = await ClinicalGateReadService.summarize(tenantId, window);
    const r2 = s.rules.find((r) => r.rule === "R2")!;
    expect(r2.verdicts).toMatchObject({ truePositive: 1, falsePositive: 1, total: 2 });
    expect(r2.sampledFalsePositiveRate).toBeCloseTo(0.5, 6);

    // A reviewer changing their mind updates rather than double-counting.
    await ClinicalGateReadService.recordVerdict(tenantId, { claimId: hits.items[0].claimId, ruleCode: "R2", routeCode: "CLINICAL_LAB_UNSUPPORTED", verdict: "TRUE_POSITIVE", reviewedById: reviewerId });
    const after = await ClinicalGateReadService.summarize(tenantId, window);
    expect(after.rules.find((r) => r.rule === "R2")!.verdicts).toMatchObject({ truePositive: 2, falsePositive: 0, total: 2 });
  });

  it("shows an existing verdict back to the reviewer instead of asking twice", async () => {
    const hits = await ClinicalGateReadService.listHits(tenantId, { window, rule: "R2" });
    expect(hits.items.some((i) => i.verdict === "TRUE_POSITIVE")).toBe(true);
  });

  it("exports CSV and writes an audit entry, because the data leaves the platform", async () => {
    const before = await prisma.auditLog.count({ where: { tenantId, action: "CLINICAL_GATE:EXPORT" } });
    const out = await ClinicalGateReadService.exportCsv(tenantId, { window, rule: "R2" }, { userId: reviewerId });
    expect(out.rowCount).toBe(2);
    expect(out.csv).toContain("Stool H Pylori");
    expect(out.csv).toContain("Claim,Service date,Provider");
    // No member identifier reaches the file.
    expect(out.csv).not.toContain(memberId);
    expect(await prisma.auditLog.count({ where: { tenantId, action: "CLINICAL_GATE:EXPORT" } })).toBe(before + 1);
  });
});
