/**
 * Diagnosis Gate C2.1 — CLINICAL stage scope resolution, REAL-DB proof.
 *
 * The stage is exercised directly (rather than through the whole evaluator) because
 * what is under test is its own decision-making: which condition a claim resolves to,
 * and whether a finding is acted on or merely recorded. Only the protocol pack needs to
 * be real; the claim is supplied in memory, since the stage never writes to it.
 *
 * The first test is the one that matters most for deployment safety: with no pack in
 * force the stage must be completely inert.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { stageClinical } from "@/server/services/claim-autopilot/stage-clinical";
import type { EvalContext } from "@/server/services/claim-autopilot/evaluate";
import { ProtocolPackService } from "@/server/services/diagnosis-gate/protocol-pack.service";
import { PACK_FORMAT_VERSION, type ProtocolPack } from "@/server/services/diagnosis-gate/pack-types";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

const PACK: ProtocolPack = {
  meta: { formatVersion: PACK_FORMAT_VERSION, sourceFileName: "scope-test.xlsx" },
  groups: [
    { groupCode: "CIG-001", name: "Malaria", isCatchAll: false, confirmationLookbackHours: 72 },
    { groupCode: "CIG-002", name: "Urinary Tract Infection", isCatchAll: false },
    { groupCode: "CIG-009", name: "Atopy", isCatchAll: true },
  ],
  memberships: [
    // Same condition reachable under BOTH code systems (DG-D3).
    { groupCode: "CIG-001", codeSystem: "ICD11", code: "1F40", provenance: "AUTHORED" },
    { groupCode: "CIG-001", codeSystem: "ICD10", code: "B50.9", provenance: "GENERATED_CROSSWALK" },
    { groupCode: "CIG-002", codeSystem: "ICD11", code: "GC08", provenance: "AUTHORED" },
    { groupCode: "CIG-009", codeSystem: "ICD11", code: "EK00", provenance: "AUTHORED" },
  ],
  labRules: [{ testCode: "LAB003", testName: "Malaria RDT", requiresDiagnosis: true, repeatWindowHours: 12, failureMessage: "Malaria RDT lacks a supporting diagnosis" }],
  links: [
    { testCode: "LAB003", groupCode: "CIG-001", linkType: "SUPPORTED" },
    { testCode: "LAB003", groupCode: "CIG-001", linkType: "CONFIRMATORY" },
  ],
  aliases: [{ testCode: "LAB003", matchType: "NORMALIZED_NAME", value: "MALARIA RDT" }],
};

describe.skipIf(!URL_SET)("DG C2.1 integration — CLINICAL stage scope resolution", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string;
  let makerId: string;
  let checkerId: string;
  let packId: string;
  const slug = `dg-scope-${randomUUID().slice(0, 8)}`;

  /** A claim shaped exactly as `loadClaim` returns it — the stage never reads the DB for it. */
  function ctxFor(opts: {
    diagnoses?: unknown;
    lines?: Array<Partial<{ id: string; cptCode: string | null; drugCode: string | null; icdCode: string | null; description: string }>>;
    clinicalGateEnabled?: boolean;
    requireClinicalGroup?: boolean;
  }): EvalContext {
    return {
      db: prisma,
      tenantId,
      claimId: "claim-under-test",
      claim: {
        id: "claim-under-test",
        diagnoses: opts.diagnoses ?? [],
        claimLines: (opts.lines ?? []).map((l, i) => ({
          id: l.id ?? `line-${i}`,
          cptCode: l.cptCode ?? null,
          drugCode: l.drugCode ?? null,
          icdCode: l.icdCode ?? null,
          description: l.description ?? "Consultation",
          serviceCategory: "CONSULTATION",
          billedAmount: "1000.00",
        })),
        dateOfService: new Date("2026-07-01T00:00:00Z"),
        memberId: "member-1",
        providerId: "provider-1",
      },
      policy: {
        clinicalGateEnabled: opts.clinicalGateEnabled ?? false,
        requireClinicalGroup: opts.requireClinicalGroup ?? false,
      },
    } as unknown as EvalContext;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.create({ data: { name: "DG Scope Test", slug } })).id;
    const mk = async (n: string, role: "SUPER_ADMIN" | "MEDICAL_OFFICER") =>
      (await prisma.user.create({ data: { tenantId, email: `${n}@${slug}.test`, passwordHash: "x", firstName: n, lastName: "T", role } })).id;
    makerId = await mk("maker", "MEDICAL_OFFICER");
    checkerId = await mk("checker", "SUPER_ADMIN");
    // The import path existence-checks every ICD-10 membership against the platform's
    // own reference table (the offline converter cannot). That makes a populated
    // ICD10Code table a real prerequisite for importing any crosswalked content.
    await prisma.iCD10Code.upsert({
      where: { code: "B50.9" },
      update: {},
      create: { code: "B50.9", description: "Plasmodium falciparum malaria, unspecified", category: "Certain infectious and parasitic diseases", chapterCode: "I" },
    });
  });

  afterAll(async () => {
    if (!prisma || !tenantId) return;
    const ids = (await prisma.clinicalProtocolPack.findMany({ where: { tenantId }, select: { id: true } })).map((p) => p.id);
    await prisma.clinicalLineAlias.deleteMany({ where: { packId: { in: ids } } });
    await prisma.clinicalLabRuleGroupLink.deleteMany({ where: { packId: { in: ids } } });
    await prisma.clinicalCodeMembership.deleteMany({ where: { packId: { in: ids } } });
    await prisma.clinicalLabRule.deleteMany({ where: { packId: { in: ids } } });
    await prisma.clinicalInterventionGroup.deleteMany({ where: { packId: { in: ids } } });
    await prisma.clinicalProtocolPack.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("is COMPLETELY INERT with no pack in force — the shipped state changes nothing", async () => {
    // Even with the gate switched fully on, no clinical content means no opinion.
    const out = await stageClinical(ctxFor({ diagnoses: [{ code: "1F40", isPrimary: true }], clinicalGateEnabled: true, requireClinicalGroup: true }));
    expect(out.disposition).toBe("PASS");
    expect((out.result as Record<string, unknown>).skipped).toBe("NO_ACTIVE_PACK");
  });

  it("activates a pack for the remaining tests", async () => {
    const created = await ProtocolPackService.createDraftFromImport(tenantId, PACK, { createdById: makerId });
    packId = created.packId;
    await ProtocolPackService.applyApprovedPackChange(tenantId, packId, checkerId);
    await ProtocolPackService.activate(tenantId, packId, checkerId);
    expect((await ProtocolPackService.getActivePack(prisma, tenantId))?.id).toBe(packId);
  });

  it("resolves a governed condition from the canonical { icdCode } shape", async () => {
    const out = await stageClinical(ctxFor({ diagnoses: [{ icdCode: "1F40", isPrimary: true }] }));
    expect(out.disposition).toBe("PASS");
    expect(out.result).toMatchObject({ groupCode: "CIG-001", groupName: "Malaria" });
  });

  it("resolves the same condition from the { code } shape written by other services", async () => {
    const out = await stageClinical(ctxFor({ diagnoses: [{ code: "1F40", isPrimary: true }] }));
    expect(out.result).toMatchObject({ groupCode: "CIG-001" });
  });

  it("resolves an ICD-10 claim against ICD-11-authored content (DG-D3)", async () => {
    // This is the case that matters in production: providers bill ICD-10 today while the
    // clinical workbook is authored in ICD-11.
    const out = await stageClinical(ctxFor({ diagnoses: [{ code: "B50.9", isPrimary: true }] }));
    expect(out.result).toMatchObject({ groupCode: "CIG-001", groupName: "Malaria" });
  });

  it("falls back to a line-level diagnosis when the header carries none", async () => {
    const out = await stageClinical(ctxFor({ diagnoses: [], lines: [{ icdCode: "GC08", description: "Urinalysis" }] }));
    expect(out.result).toMatchObject({ groupCode: "CIG-002" });
  });

  it("prefers the primary diagnosis over a secondary one", async () => {
    const out = await stageClinical(
      ctxFor({ diagnoses: [{ code: "GC08", isPrimary: false }, { code: "1F40", isPrimary: true }] }),
    );
    expect(out.result).toMatchObject({ groupCode: "CIG-001" });
  });

  it("EVALUATES NOTHING when the diagnosis matches several conditions (DG-D15)", async () => {
    // Picking the first match would let database row order decide which clinical rules
    // run — and that ordering is not even stable across queries.
    const out = await stageClinical(
      ctxFor({
        diagnoses: [{ code: "1F40", isPrimary: true }, { code: "GC08", isPrimary: true }],
        lines: [{ description: "Malaria RDT" }],
      }),
    );
    const r = out.result as Record<string, unknown>;
    expect(out.disposition).toBe("PASS");
    expect(r.ambiguous).toBe(true);
    expect(r.ruleHits ?? []).toHaveLength(0);
    // No single condition is claimed...
    expect(r.groupCode).toBeUndefined();
    // ...but every candidate is named, so the pack can be disambiguated.
    expect(r.candidateGroups).toEqual([
      { groupCode: "CIG-001", groupName: "Malaria" },
      { groupCode: "CIG-002", groupName: "Urinary Tract Infection" },
    ]);
  });

  it("candidate ordering is stable, so the record does not churn between runs", async () => {
    const a = await stageClinical(ctxFor({ diagnoses: [{ code: "1F40", isPrimary: true }, { code: "GC08", isPrimary: true }] }));
    const b = await stageClinical(ctxFor({ diagnoses: [{ code: "GC08", isPrimary: true }, { code: "1F40", isPrimary: true }] }));
    expect((a.result as Record<string, unknown>).candidateGroups).toEqual((b.result as Record<string, unknown>).candidateGroups);
  });

  it("strict mode treats an ambiguous diagnosis as unresolved, not as a governed one", async () => {
    const out = await stageClinical(
      ctxFor({
        diagnoses: [{ code: "1F40", isPrimary: true }, { code: "GC08", isPrimary: true }],
        clinicalGateEnabled: true,
        requireClinicalGroup: true,
      }),
    );
    expect(out.disposition).toBe("ROUTE");
    expect(out.disposition === "ROUTE" && out.code).toBe("CLINICAL_SCOPE_REVIEW");
  });

  it("passes an out-of-scope diagnosis by default — the gate governs only what it knows (DG-D11)", async () => {
    const out = await stageClinical(ctxFor({ diagnoses: [{ code: "ZZ99", isPrimary: true }], clinicalGateEnabled: true }));
    expect(out.disposition).toBe("PASS");
    expect((out.result as Record<string, unknown>).outOfScope).toBe(true);
  });

  it("routes an out-of-scope diagnosis ONLY when the business switches on strict mode", async () => {
    const out = await stageClinical(ctxFor({ diagnoses: [{ code: "ZZ99", isPrimary: true }], clinicalGateEnabled: true, requireClinicalGroup: true }));
    expect(out.disposition).toBe("ROUTE");
    expect(out.disposition === "ROUTE" && out.code).toBe("CLINICAL_SCOPE_REVIEW");
  });

  it("strict mode alone does nothing while the gate is still record-only", async () => {
    const out = await stageClinical(ctxFor({ diagnoses: [{ code: "ZZ99", isPrimary: true }], clinicalGateEnabled: false, requireClinicalGroup: true }));
    expect(out.disposition).toBe("PASS");
  });

  it("skips a condition switched off for shadow, without withdrawing the pack", async () => {
    const group = await prisma.clinicalInterventionGroup.findFirstOrThrow({ where: { packId, groupCode: "CIG-002" } });
    await ProtocolPackService.setGroupEnablement(tenantId, group.id, { enabledForShadow: false });
    const out = await stageClinical(ctxFor({ diagnoses: [{ code: "GC08", isPrimary: true }] }));
    expect(out.disposition).toBe("PASS");
    expect((out.result as Record<string, unknown>).skipped).toBe("GROUP_DISABLED");
    await ProtocolPackService.setGroupEnablement(tenantId, group.id, { enabledForShadow: true });
  });

  it("records the pack version on every evaluation, so a finding is attributable to the content in force", async () => {
    const out = await stageClinical(ctxFor({ diagnoses: [{ code: "1F40", isPrimary: true }] }));
    expect(out.result).toMatchObject({ packId, packVersion: 1 });
  });
});
