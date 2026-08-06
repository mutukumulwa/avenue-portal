/**
 * Diagnosis Gate C1.2 — protocol-pack lifecycle REAL-DB proof.
 *
 * Proves the one door clinical content may enter through (DG-D6):
 *   import → DRAFT → submit → approve (maker ≠ checker) → activate → supersede
 * and the properties that make it safe to run against live claims:
 *   • a pack with blocking errors can never be imported;
 *   • the importer cannot approve their own content;
 *   • exactly one pack is ever in force, even under concurrent activation;
 *   • a catch-all condition can never be switched to live routing (DG-D8);
 *   • withdrawing content leaves NO active pack, which the stage treats as "pass".
 *
 * Self-contained: creates its own tenant, users and matrix rule, so it does not depend
 * on a seeded database. OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { ProtocolPackService } from "@/server/services/diagnosis-gate/protocol-pack.service";
import { PACK_FORMAT_VERSION, type ProtocolPack } from "@/server/services/diagnosis-gate/pack-types";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

function pack(overrides: Partial<ProtocolPack> = {}, marker = "A"): ProtocolPack {
  return {
    meta: { formatVersion: PACK_FORMAT_VERSION, sourceFileName: `workbook-${marker}.xlsx` },
    groups: [
      { groupCode: "CIG-001", name: `Malaria ${marker}`, isCatchAll: false, confirmationLookbackHours: 72 },
      { groupCode: "CIG-002", name: "Atopy", isCatchAll: true },
    ],
    memberships: [
      { groupCode: "CIG-001", codeSystem: "ICD11", code: "1F40", provenance: "AUTHORED" },
      { groupCode: "CIG-002", codeSystem: "ICD11", code: "EK00", provenance: "AUTHORED" },
    ],
    labRules: [
      { testCode: "LAB003", testName: "Malaria RDT", requiresDiagnosis: true, repeatWindowHours: 12, failureMessage: "Malaria RDT lacks a supporting diagnosis" },
    ],
    links: [
      { testCode: "LAB003", groupCode: "CIG-001", linkType: "SUPPORTED" },
      { testCode: "LAB003", groupCode: "CIG-001", linkType: "CONFIRMATORY" },
    ],
    aliases: [{ testCode: "LAB003", matchType: "NORMALIZED_NAME", value: "MALARIA RDT" }],
    ...overrides,
  };
}

describe.skipIf(!URL_SET)("DG C1.2 integration — protocol pack lifecycle", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string;
  let makerId: string;
  let checkerId: string;
  const slug = `dg-lifecycle-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const tenant = await prisma.tenant.create({ data: { name: "DG Lifecycle Test", slug } });
    tenantId = tenant.id;
    const mk = async (email: string, role: "SUPER_ADMIN" | "MEDICAL_OFFICER") =>
      (await prisma.user.create({ data: { tenantId, email: `${email}@${slug}.test`, passwordHash: "x", firstName: email, lastName: "T", role } })).id;
    makerId = await mk("maker", "MEDICAL_OFFICER");
    checkerId = await mk("checker", "SUPER_ADMIN");
    // The governed path requires a matrix rule; without one, submit must refuse (W2).
    await prisma.approvalMatrix.create({
      data: { tenantId, actionType: "CLINICAL_PROTOCOL_CHANGE", requiredRole: "SUPER_ADMIN", requiresDual: false, effectiveFrom: new Date("2020-01-01") },
    });
  });

  afterAll(async () => {
    if (!prisma || !tenantId) return;
    const packIds = (await prisma.clinicalProtocolPack.findMany({ where: { tenantId }, select: { id: true } })).map((p) => p.id);
    await prisma.clinicalLineAlias.deleteMany({ where: { packId: { in: packIds } } });
    await prisma.clinicalLabRuleGroupLink.deleteMany({ where: { packId: { in: packIds } } });
    await prisma.clinicalCodeMembership.deleteMany({ where: { packId: { in: packIds } } });
    await prisma.clinicalLabRule.deleteMany({ where: { packId: { in: packIds } } });
    await prisma.clinicalInterventionGroup.deleteMany({ where: { packId: { in: packIds } } });
    await prisma.clinicalProtocolPack.deleteMany({ where: { tenantId } });
    // ApprovalDecision cascades from the request, ApprovalStep from the matrix.
    await prisma.approvalRequest.deleteMany({ where: { tenantId } });
    await prisma.approvalMatrix.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("refuses a pack with blocking errors — a gap never becomes a rule", async () => {
    const broken = pack();
    broken.memberships = []; // every group now has no codes (V9)
    await expect(ProtocolPackService.createDraftFromImport(tenantId, broken, { createdById: makerId })).rejects.toThrow(/blocking error/i);
    expect(await prisma.clinicalProtocolPack.count({ where: { tenantId } })).toBe(0);
  });

  it("imports a valid pack as DRAFT with all content, and nothing is in force yet", async () => {
    const { packId, version } = await ProtocolPackService.createDraftFromImport(tenantId, pack(), { createdById: makerId, notes: "first import" });
    expect(version).toBe(1);

    const row = await prisma.clinicalProtocolPack.findUniqueOrThrow({ where: { id: packId } });
    expect(row.status).toBe("DRAFT");
    expect(row.isActive).toBe(false);
    expect(await ProtocolPackService.getActivePack(prisma, tenantId)).toBeNull();

    expect(await prisma.clinicalInterventionGroup.count({ where: { packId } })).toBe(2);
    expect(await prisma.clinicalCodeMembership.count({ where: { packId } })).toBe(2);
    expect(await prisma.clinicalLabRule.count({ where: { packId } })).toBe(1);
    expect(await prisma.clinicalLabRuleGroupLink.count({ where: { packId } })).toBe(2);
    expect(await prisma.clinicalLineAlias.count({ where: { packId } })).toBe(1);

    // Live routing is off for every condition on arrival (DG-D5).
    expect(await prisma.clinicalInterventionGroup.count({ where: { packId, enabledForLive: true } })).toBe(0);
  });

  it("runs the governed chain: submit → approve → activate", async () => {
    const draft = await prisma.clinicalProtocolPack.findFirstOrThrow({ where: { tenantId, status: "DRAFT" } });

    const { requestId } = await ProtocolPackService.submitForApproval(tenantId, draft.id, makerId);
    expect((await prisma.clinicalProtocolPack.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("PENDING_APPROVAL");
    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.actionType).toBe("CLINICAL_PROTOCOL_CHANGE");
    // The approval payload carries identity and size only — never the clinical content.
    expect(JSON.stringify(request.payload)).not.toMatch(/Malaria RDT lacks/);

    // The importer cannot approve their own content.
    await expect(ProtocolPackService.applyApprovedPackChange(tenantId, draft.id, makerId)).rejects.toThrow(/cannot approve/i);

    await ProtocolPackService.applyApprovedPackChange(tenantId, draft.id, checkerId);
    const approved = await prisma.clinicalProtocolPack.findUniqueOrThrow({ where: { id: draft.id } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(checkerId);
    // Approval alone does NOT put content in force.
    expect(approved.isActive).toBe(false);
    expect(await ProtocolPackService.getActivePack(prisma, tenantId)).toBeNull();

    await ProtocolPackService.activate(tenantId, draft.id, checkerId);
    const active = await prisma.clinicalProtocolPack.findUniqueOrThrow({ where: { id: draft.id } });
    expect(active.isActive).toBe(true);
    expect(active.activatedById).toBe(checkerId);
    expect((await ProtocolPackService.getActivePack(prisma, tenantId))?.id).toBe(draft.id);
  });

  it("re-approval and re-activation are replay-safe", async () => {
    const p = await prisma.clinicalProtocolPack.findFirstOrThrow({ where: { tenantId, isActive: true } });
    await ProtocolPackService.applyApprovedPackChange(tenantId, p.id, checkerId);
    await ProtocolPackService.activate(tenantId, p.id, checkerId);
    expect(await prisma.clinicalProtocolPack.count({ where: { tenantId, isActive: true } })).toBe(1);
  });

  it("refuses to import content identical to what is already in force", async () => {
    await expect(ProtocolPackService.createDraftFromImport(tenantId, pack(), { createdById: makerId })).rejects.toThrow(/identical/i);
  });

  it("a second version supersedes the first — exactly one pack is ever in force", async () => {
    const v1 = await prisma.clinicalProtocolPack.findFirstOrThrow({ where: { tenantId, isActive: true } });
    const { packId: v2Id, version } = await ProtocolPackService.createDraftFromImport(tenantId, pack({}, "B"), { createdById: makerId });
    expect(version).toBe(2);

    await ProtocolPackService.applyApprovedPackChange(tenantId, v2Id, checkerId);
    await ProtocolPackService.activate(tenantId, v2Id, checkerId);

    expect(await prisma.clinicalProtocolPack.count({ where: { tenantId, isActive: true } })).toBe(1);
    expect((await ProtocolPackService.getActivePack(prisma, tenantId))?.id).toBe(v2Id);
    const old = await prisma.clinicalProtocolPack.findUniqueOrThrow({ where: { id: v1.id } });
    expect(old.isActive).toBe(false);
    expect(old.status).toBe("SUPERSEDED");
    expect(old.supersededAt).not.toBeNull();
  });

  it("CONCURRENT activation still leaves exactly one pack in force", async () => {
    const { packId: v3Id } = await ProtocolPackService.createDraftFromImport(tenantId, pack({}, "C"), { createdById: makerId });
    await ProtocolPackService.applyApprovedPackChange(tenantId, v3Id, checkerId);

    // Two operators clicking Activate at the same instant.
    await Promise.all([
      ProtocolPackService.activate(tenantId, v3Id, checkerId),
      ProtocolPackService.activate(tenantId, v3Id, checkerId),
    ]);

    expect(await prisma.clinicalProtocolPack.count({ where: { tenantId, isActive: true } })).toBe(1);
    expect((await ProtocolPackService.getActivePack(prisma, tenantId))?.id).toBe(v3Id);
  });

  it("a catch-all condition can never be switched to live routing (DG-D8)", async () => {
    const activePack = await prisma.clinicalProtocolPack.findFirstOrThrow({ where: { tenantId, isActive: true } });
    const catchAll = await prisma.clinicalInterventionGroup.findFirstOrThrow({ where: { packId: activePack.id, isCatchAll: true } });
    const specific = await prisma.clinicalInterventionGroup.findFirstOrThrow({ where: { packId: activePack.id, isCatchAll: false } });

    await expect(ProtocolPackService.setGroupEnablement(tenantId, catchAll.id, { enabledForLive: true })).rejects.toThrow(/broad category/i);
    expect((await prisma.clinicalInterventionGroup.findUniqueOrThrow({ where: { id: catchAll.id } })).enabledForLive).toBe(false);

    // A specific condition can be enabled — the bar is on categories, not on the feature.
    await ProtocolPackService.setGroupEnablement(tenantId, specific.id, { enabledForLive: true });
    expect((await prisma.clinicalInterventionGroup.findUniqueOrThrow({ where: { id: specific.id } })).enabledForLive).toBe(true);
  });

  it("cannot activate a pack that was never approved", async () => {
    const { packId } = await ProtocolPackService.createDraftFromImport(tenantId, pack({}, "D"), { createdById: makerId });
    await expect(ProtocolPackService.activate(tenantId, packId, checkerId)).rejects.toThrow(/APPROVED/);
  });

  it("withdrawing content leaves NO pack in force — the stage then passes every claim", async () => {
    const active = await prisma.clinicalProtocolPack.findFirstOrThrow({ where: { tenantId, isActive: true } });
    await expect(ProtocolPackService.deactivate(tenantId, active.id, checkerId, "  ")).rejects.toThrow(/reason is required/i);

    await ProtocolPackService.deactivate(tenantId, active.id, checkerId, "Withdrawn during shadow tuning");
    expect(await ProtocolPackService.getActivePack(prisma, tenantId)).toBeNull();
    const row = await prisma.clinicalProtocolPack.findUniqueOrThrow({ where: { id: active.id } });
    expect(row.status).toBe("DEACTIVATED");
    expect(row.deactivationReason).toBe("Withdrawn during shadow tuning");
  });

  it("diffs two versions so a reviewer sees what actually changed", async () => {
    const packs = await prisma.clinicalProtocolPack.findMany({ where: { tenantId }, orderBy: { version: "asc" }, select: { id: true } });
    const diff = await ProtocolPackService.diffPacks(tenantId, packs[0].id, packs[1].id);
    // Version B renamed the malaria group; the diff must surface it rather than
    // requiring the reviewer to trust that nothing else moved.
    expect(diff.groups.renamed).toEqual([{ groupCode: "CIG-001", from: "Malaria A", to: "Malaria B" }]);
    expect(diff.groups.added).toEqual([]);
    expect(diff.groups.removed).toEqual([]);
    expect(diff.labRules.changed).toEqual([]);
  });
});
