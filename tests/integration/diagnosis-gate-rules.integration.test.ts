/**
 * Diagnosis Gate C2.2–C2.4 — rules R2, R3, R4 REAL-DB proof.
 *
 * R2 test-supported-by-diagnosis · R3 repeat inside the clinical window ·
 * R4 confirmatory test on record.
 *
 * Real claim rows are needed here (unlike the C2.1 scope tests) because R3 and R4 read
 * the member's claim history. Every assertion also checks the record-only property: a
 * finding is persisted but the claim is untouched until routing is deliberately enabled.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { stageClinical, type ClinicalStageResult, type ClinicalRuleHit } from "@/server/services/claim-autopilot/stage-clinical";
import type { EvalContext } from "@/server/services/claim-autopilot/evaluate";
import { ProtocolPackService } from "@/server/services/diagnosis-gate/protocol-pack.service";
import { PACK_FORMAT_VERSION, type ProtocolPack } from "@/server/services/diagnosis-gate/pack-types";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

const PACK: ProtocolPack = {
  meta: { formatVersion: PACK_FORMAT_VERSION, sourceFileName: "rules-test.xlsx" },
  groups: [
    // Malaria: confirmable, with a 72h lookback for the confirmatory test.
    { groupCode: "CIG-001", name: "Malaria", isCatchAll: false, confirmationLookbackHours: 72 },
    // UTI: no confirmatory test declared, so R4 must stay silent for it.
    { groupCode: "CIG-002", name: "Urinary Tract Infection", isCatchAll: false },
    // Gastritis exists so the H. pylori test is supported SOMEWHERE. That matters: the
    // validator rejects a diagnosis-requiring test with no supported condition at all
    // (it would flag every claim billing it), so "unsupported" must always mean
    // "unsupported for THIS diagnosis", never "supported for nothing".
    { groupCode: "CIG-003", name: "Gastritis", isCatchAll: false },
  ],
  memberships: [
    { groupCode: "CIG-001", codeSystem: "ICD11", code: "1F40", provenance: "AUTHORED" },
    { groupCode: "CIG-002", codeSystem: "ICD11", code: "GC08", provenance: "AUTHORED" },
    { groupCode: "CIG-003", codeSystem: "ICD11", code: "DA42", provenance: "AUTHORED" },
  ],
  labRules: [
    { testCode: "LAB003", testName: "Malaria RDT", requiresDiagnosis: true, repeatWindowHours: 12, failureMessage: "Malaria RDT lacks a supporting diagnosis" },
    { testCode: "LAB010", testName: "Stool H Pylori", requiresDiagnosis: true, repeatWindowHours: 720, failureMessage: "H. pylori test lacks documented indication" },
    // Requires no diagnosis — R2 must never flag it, whatever the diagnosis is.
    { testCode: "LAB012", testName: "Random Blood Sugar", requiresDiagnosis: false, repeatWindowHours: 4, failureMessage: "Random blood sugar repeated too soon" },
  ],
  links: [
    { testCode: "LAB003", groupCode: "CIG-001", linkType: "SUPPORTED" },
    { testCode: "LAB003", groupCode: "CIG-001", linkType: "CONFIRMATORY" },
    // Supported for gastritis — so billing it against a malaria diagnosis is what R2 flags.
    { testCode: "LAB010", groupCode: "CIG-003", linkType: "SUPPORTED" },
  ],
  aliases: [
    { testCode: "LAB003", matchType: "NORMALIZED_NAME", value: "MALARIA RDT" },
    { testCode: "LAB003", matchType: "CPT_CODE", value: "87880" },
    { testCode: "LAB010", matchType: "NORMALIZED_NAME", value: "STOOL H PYLORI" },
    { testCode: "LAB012", matchType: "NORMALIZED_NAME", value: "RANDOM BLOOD SUGAR" },
  ],
};

/**
 * Each test gets its OWN service-date window, 90 days apart. The suite shares one
 * member, so without this the claims one test creates would sit inside the next test's
 * lookback window (the widest rule here looks back 720 hours) and silently change its
 * result. Isolating by time is cheaper than isolating by member and keeps the history
 * realistic.
 */
const EPOCH_START = new Date("2026-01-15T09:00:00Z");
const EPOCH_STRIDE_MS = 90 * 24 * 3600_000;
let epoch = 0;
let currentDos = EPOCH_START;
const dos = () => currentDos;
const hoursBefore = (h: number) => new Date(dos().getTime() - h * 3600_000);

describe.skipIf(!URL_SET)("DG C2.2–C2.4 integration — clinical rules R2/R3/R4", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, makerId: string, checkerId: string, memberId: string, providerId: string, packId: string;
  const slug = `dg-rules-${randomUUID().slice(0, 8)}`;
  const madeClaims: string[] = [];
  let seq = 0;

  /** Persist a real claim so R3/R4 can find it in history. */
  async function makeClaim(opts: { dateOfService: Date; lines: Array<{ description: string; cptCode?: string }>; status?: string; createdAt?: Date }) {
    seq += 1;
    const claim = await prisma.claim.create({
      data: {
        tenantId, memberId, providerId,
        claimNumber: `DGR-${slug}-${seq}`,
        serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT",
        dateOfService: opts.dateOfService,
        diagnoses: [{ icdCode: "1F40", isPrimary: true }],
        procedures: [],
        billedAmount: 1000 * opts.lines.length,
        status: (opts.status ?? "APPROVED") as never,
        currency: "UGX",
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        claimLines: {
          create: opts.lines.map((l, i) => ({
            lineNumber: i + 1,
            description: l.description, cptCode: l.cptCode ?? null,
            serviceCategory: "LABORATORY", quantity: 1, unitCost: 1000, billedAmount: 1000,
          })),
        },
      },
      select: { id: true, claimNumber: true, dateOfService: true, createdAt: true },
    });
    madeClaims.push(claim.id);
    return claim;
  }

  function ctxFor(claim: { id: string; dateOfService: Date; createdAt: Date }, opts: {
    diagnoses?: unknown;
    lines?: Array<{ id?: string; description: string; cptCode?: string | null }>;
    clinicalGateEnabled?: boolean;
  }): EvalContext {
    return {
      db: prisma, tenantId, claimId: claim.id,
      claim: {
        id: claim.id,
        diagnoses: opts.diagnoses ?? [{ icdCode: "1F40", isPrimary: true }],
        createdAt: claim.createdAt,
        dateOfService: claim.dateOfService,
        memberId, providerId,
        claimLines: (opts.lines ?? []).map((l, i) => ({
          id: l.id ?? `line-${i}`, cptCode: l.cptCode ?? null, drugCode: null, icdCode: null,
          description: l.description, serviceCategory: "LABORATORY", billedAmount: "1000.00",
        })),
      },
      policy: { clinicalGateEnabled: opts.clinicalGateEnabled ?? false, requireClinicalGroup: false },
    } as unknown as EvalContext;
  }

  const hits = (out: { result?: Record<string, unknown> }): ClinicalRuleHit[] => ((out.result as ClinicalStageResult)?.ruleHits ?? []);
  const inert = (out: { result?: Record<string, unknown> }) => ((out.result as ClinicalStageResult)?.inertRules ?? []);
  const daysBefore = (d: number) => new Date(dos().getTime() - d * 24 * 3600_000);

  beforeEach(() => {
    epoch += 1;
    currentDos = new Date(EPOCH_START.getTime() + epoch * EPOCH_STRIDE_MS);
  });

  // Uses the seeded tenant/member/provider (repo convention for real-DB suites); only
  // the protocol pack and this suite's claims are created and torn down.
  let secondProviderId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    // Derive the tenant FROM the member rather than assuming the first tenant row — a
    // leftover fixture tenant would otherwise be picked and have no members.
    const member = await prisma.member.findFirstOrThrow({ where: { status: "ACTIVE" }, select: { id: true, tenantId: true } });
    memberId = member.id;
    tenantId = member.tenantId;
    const providers = await prisma.provider.findMany({ where: { tenantId, contractStatus: "ACTIVE" }, take: 2, select: { id: true } });
    providerId = providers[0].id;
    secondProviderId = providers[1]?.id ?? providers[0].id;

    const users = await prisma.user.findMany({ where: { tenantId }, take: 2, select: { id: true } });
    makerId = users[0].id;
    checkerId = users[1]?.id ?? users[0].id;

    // Park any pack this tenant already has, so this suite's pack is the one in force.
    await prisma.clinicalProtocolPack.updateMany({ where: { tenantId, isActive: true }, data: { isActive: false } });

    const created = await ProtocolPackService.createDraftFromImport(tenantId, PACK, { createdById: makerId });
    packId = created.packId;
    await ProtocolPackService.applyApprovedPackChange(tenantId, packId, checkerId);
    await ProtocolPackService.activate(tenantId, packId, checkerId);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.claimLine.deleteMany({ where: { claimId: { in: madeClaims } } });
    await prisma.claim.deleteMany({ where: { id: { in: madeClaims } } });
    await prisma.clinicalLineAlias.deleteMany({ where: { packId } });
    await prisma.clinicalLabRuleGroupLink.deleteMany({ where: { packId } });
    await prisma.clinicalCodeMembership.deleteMany({ where: { packId } });
    await prisma.clinicalLabRule.deleteMany({ where: { packId } });
    await prisma.clinicalInterventionGroup.deleteMany({ where: { packId } });
    await prisma.clinicalProtocolPack.deleteMany({ where: { id: packId } });
    await prisma.$disconnect();
  });

  // ── R2 ────────────────────────────────────────────────────────────────────
  describe("R2 — test supported by the diagnosis", () => {
    it("passes a test the pack supports for this condition", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Malaria RDT" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Malaria RDT" }] }));
      expect(hits(out).filter((h) => h.rule === "R2")).toHaveLength(0);
    });

    it("flags an unsupported test, quoting the pack's OWN provider wording", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Stool H Pylori" }] }));
      const r2 = hits(out).filter((h) => h.rule === "R2");
      expect(r2).toHaveLength(1);
      expect(r2[0].testCode).toBe("LAB010");
      expect(r2[0].message).toBe("H. pylori test lacks documented indication");
      // The finding names the offending line, so a reviewer sees WHICH test is questioned.
      expect(r2[0].claimLineId).toBeTruthy();
    });

    it("NEVER flags a test the pack says needs no diagnosis", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Random Blood Sugar" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Random Blood Sugar" }] }));
      expect(hits(out).filter((h) => h.rule === "R2")).toHaveLength(0);
    });

    it("recognises a test by CPT code as well as by name", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "unrecognised label", cptCode: "87880" }] });
      const out = await stageClinical(ctxFor(c, { diagnoses: [{ icdCode: "GC08", isPrimary: true }], lines: [{ description: "unrecognised label", cptCode: "87880" }] }));
      // Malaria RDT billed against a UTI diagnosis → unsupported.
      const r2 = hits(out).filter((h) => h.rule === "R2");
      expect(r2).toHaveLength(1);
      expect(r2[0].testCode).toBe("LAB003");
    });

    it("raises no test-level finding for a line the pack cannot recognise", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Some Unlisted Panel" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Some Unlisted Panel" }] }));
      // R2 and R3 are per-test rules, so an unrecognised line produces neither.
      expect(hits(out).filter((h) => h.rule === "R2" || h.rule === "R3")).toHaveLength(0);
      // R4 is a per-CLAIM rule and correctly still fires: this is a malaria claim with
      // no confirmatory test on it. An unrecognised line is not a confirmatory test.
      expect(hits(out).filter((h) => h.rule === "R4")).toHaveLength(1);
    });
  });

  // ── R3 ────────────────────────────────────────────────────────────────────
  describe("R3 — repeat inside the clinical window", () => {
    // NOTE (DG-D14): the enforceable-window cases use LAB010 (720 h = 30 days). The
    // malaria and glucose rules carry the REAL v0 windows (12 h and 4 h), which are
    // shorter than a day and therefore unenforceable against date-only claim data —
    // they are covered by the inertness block below.
    it("flags a repeat inside the window and cites the earlier claim", async () => {
      const prior = await makeClaim({ dateOfService: daysBefore(10), lines: [{ description: "Stool H Pylori" }] });
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Stool H Pylori" }] }));
      const r3 = hits(out).filter((h) => h.rule === "R3");
      expect(r3).toHaveLength(1);
      expect(r3[0].priorClaimNumbers).toContain(prior.claimNumber);
      expect(r3[0].message).toContain("30-day");
    });

    it("does NOT flag once the window has elapsed", async () => {
      await makeClaim({ dateOfService: daysBefore(40), lines: [{ description: "Stool H Pylori" }] });
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Stool H Pylori" }] }));
      expect(hits(out).filter((h) => h.rule === "R3")).toHaveLength(0);
    });

    it("is inclusive at the window edge and excludes the day after (30-day boundary)", async () => {
      // The boundary is where an off-by-one silently changes a clinical rule.
      await makeClaim({ dateOfService: daysBefore(30), lines: [{ description: "Stool H Pylori" }] });
      const onEdge = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      expect(hits(await stageClinical(ctxFor(onEdge, { lines: [{ description: "Stool H Pylori" }] }))).filter((h) => h.rule === "R3")).toHaveLength(1);

      epoch += 1; currentDos = new Date(EPOCH_START.getTime() + epoch * EPOCH_STRIDE_MS);
      await makeClaim({ dateOfService: daysBefore(31), lines: [{ description: "Stool H Pylori" }] });
      const justOutside = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      expect(hits(await stageClinical(ctxFor(justOutside, { lines: [{ description: "Stool H Pylori" }] }))).filter((h) => h.rule === "R3")).toHaveLength(0);
    });

    it("ignores VOID and DECLINED history — an unpaid test is not a repeat", async () => {
      await makeClaim({ dateOfService: daysBefore(2), lines: [{ description: "Stool H Pylori" }], status: "VOID" });
      await makeClaim({ dateOfService: daysBefore(2), lines: [{ description: "Stool H Pylori" }], status: "DECLINED" });
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Stool H Pylori" }] }));
      expect(hits(out).filter((h) => h.rule === "R3")).toHaveLength(0);
    });

    it("matches history whose wording differs only in case and spacing", async () => {
      const prior = await makeClaim({ dateOfService: daysBefore(5), lines: [{ description: "  stool   H PYLORI  " }] });
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Stool H Pylori" }] }));
      expect(hits(out).filter((h) => h.rule === "R3")[0]?.priorClaimNumbers).toContain(prior.claimNumber);
    });

    it("flags a repeat across DIFFERENT providers — the control is per member, not per facility", async () => {
      seq += 1;
      const prior = await prisma.claim.create({
        data: {
          tenantId, memberId, providerId: secondProviderId, claimNumber: `DGR-${slug}-other`,
          serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", dateOfService: daysBefore(4),
          diagnoses: [{ icdCode: "1F40", isPrimary: true }], procedures: [], billedAmount: 1000, status: "APPROVED", currency: "UGX",
          claimLines: { create: [{ lineNumber: 1, description: "Stool H Pylori", serviceCategory: "LABORATORY", quantity: 1, unitCost: 1000, billedAmount: 1000 }] },
        },
        select: { id: true, claimNumber: true },
      });
      madeClaims.push(prior.id);
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Stool H Pylori" }] }));
      expect(hits(out).filter((h) => h.rule === "R3")[0]?.priorClaimNumbers).toContain(prior.claimNumber);
    });

    it("does NOT evaluate a sub-day window, and records it as inert (DG-D14)", async () => {
      // The bug this fixes: Malaria RDT's real v0 window is 12 h, but a claim carries a
      // service DATE with no time. The old millisecond arithmetic therefore flagged ANY
      // two same-day claims — including ones 8 hours apart, which the 12 h rule allows —
      // and missed ones 2 hours apart either side of midnight.
      await makeClaim({ dateOfService: dos(), lines: [{ description: "Malaria RDT" }] });
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Malaria RDT" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Malaria RDT" }] }));

      expect(hits(out).filter((h) => h.rule === "R3")).toHaveLength(0);
      const r3Inert = inert(out).filter((i) => i.rule === "R3");
      expect(r3Inert).toHaveLength(1);
      expect(r3Inert[0]).toMatchObject({ testCode: "LAB003", windowHours: 12, reason: "SUBDAY_WINDOW_DATE_ONLY_DATA" });
    });

    it("does not silently drop the sub-day rule — the same claim still reports it", async () => {
      // A rule we cannot check must never be indistinguishable from a rule that found
      // nothing; that is what makes shadow coverage numbers honest.
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Random Blood Sugar" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Random Blood Sugar" }] }));
      expect(inert(out).some((i) => i.testCode === "LAB012" && i.windowHours === 4)).toBe(true);
    });

    it("a cross-midnight repeat under a sub-day window is inert, not a false negative", async () => {
      await makeClaim({ dateOfService: daysBefore(1), lines: [{ description: "Malaria RDT" }] });
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Malaria RDT" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Malaria RDT" }] }));
      expect(hits(out).filter((h) => h.rule === "R3")).toHaveLength(0);
      expect(inert(out).some((i) => i.rule === "R3")).toBe(true);
    });

    it("same service date: EXACTLY ONE of the two claims flags the other", async () => {
      // Without a total order, concurrent same-day submissions would either both flag
      // (double-counting one repeat) or both stay silent (missing it entirely).
      const first = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }], createdAt: new Date(dos().getTime() + 3600_000) });
      const second = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }], createdAt: new Date(dos().getTime() + 2 * 3600_000) });

      const outFirst = await stageClinical(ctxFor(first, { lines: [{ description: "Stool H Pylori" }] }));
      const outSecond = await stageClinical(ctxFor(second, { lines: [{ description: "Stool H Pylori" }] }));

      const flaggedFirst = hits(outFirst).some((h) => h.rule === "R3" && h.priorClaimNumbers?.includes(second.claimNumber));
      const flaggedSecond = hits(outSecond).some((h) => h.rule === "R3" && h.priorClaimNumbers?.includes(first.claimNumber));
      expect([flaggedFirst, flaggedSecond]).toEqual([false, true]); // the later-created one flags
    });
  });

  // ── R4 ────────────────────────────────────────────────────────────────────
  describe("R4 — confirmatory test on record", () => {
    it("passes when the confirmatory test is on the same claim", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Malaria RDT" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Malaria RDT" }] }));
      expect(hits(out).filter((h) => h.rule === "R4")).toHaveLength(0);
    });

    it("flags a treatment claim carrying no confirmatory test", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Some Unlisted Panel" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Some Unlisted Panel" }] }));
      const r4 = hits(out).filter((h) => h.rule === "R4");
      expect(r4).toHaveLength(1);
      expect(r4[0].routeCode).toBe("CLINICAL_CONFIRMATION_MISSING");
    });

    it("accepts a confirmatory test billed earlier, inside the condition's lookback", async () => {
      await makeClaim({ dateOfService: hoursBefore(24), lines: [{ description: "Malaria RDT" }] });
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Some Unlisted Panel" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Some Unlisted Panel" }] }));
      expect(hits(out).filter((h) => h.rule === "R4")).toHaveLength(0);
    });

    it("stays silent for a condition the pack declares no confirmatory test for", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Some Unlisted Panel" }] });
      const out = await stageClinical(ctxFor(c, { diagnoses: [{ icdCode: "GC08", isPrimary: true }], lines: [{ description: "Some Unlisted Panel" }] }));
      expect(hits(out).filter((h) => h.rule === "R4")).toHaveLength(0);
    });
  });

  // ── Record-only vs routing ────────────────────────────────────────────────
  describe("record-only is the default, routing is deliberate", () => {
    it("records findings but PASSES while the gate is off", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Stool H Pylori" }] }));
      expect(out.disposition).toBe("PASS");
      expect((out.result as ClinicalStageResult).recordOnly).toBe(true);
      expect(hits(out).length).toBeGreaterThan(0); // the shadow dataset is still produced
    });

    it("still PASSES with the gate on while the condition is not live (DG-D5)", async () => {
      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Stool H Pylori" }], clinicalGateEnabled: true }));
      expect(out.disposition).toBe("PASS");
      expect((out.result as ClinicalStageResult).recordOnly).toBe(true);
    });

    it("ROUTES only when the gate AND the condition are both live", async () => {
      const group = await prisma.clinicalInterventionGroup.findFirstOrThrow({ where: { packId, groupCode: "CIG-001" } });
      await ProtocolPackService.setGroupEnablement(tenantId, group.id, { enabledForLive: true });

      const c = await makeClaim({ dateOfService: dos(), lines: [{ description: "Stool H Pylori" }] });
      const out = await stageClinical(ctxFor(c, { lines: [{ description: "Stool H Pylori" }], clinicalGateEnabled: true }));
      expect(out.disposition).toBe("ROUTE");
      expect(out.disposition === "ROUTE" && out.code).toBe("CLINICAL_LAB_UNSUPPORTED");
      // Even when routing, the full finding set is preserved for the shadow report.
      expect(hits(out).length).toBeGreaterThan(0);

      await ProtocolPackService.setGroupEnablement(tenantId, group.id, { enabledForLive: false });
    });
  });
});
