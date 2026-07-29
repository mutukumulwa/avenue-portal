/**
 * F10.5 — link encounters + protect carve-outs (opt-in DB). Included vs carve-out
 * vs no-arrangement classification (with the effective-date boundary); an included
 * zero-pay line cannot enter FFS settlement; a line links at most once (no
 * double-count); the link never mutates the encounter (utilization remains).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F10.5 encounter link + carve-outs (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Arr: typeof import("@/server/services/capitation/arrangement.service").CapitationArrangementService;
  let Link: typeof import("@/server/services/capitation/encounter-link.service").CapitationEncounterLinkService;
  let world: import("../factories/provider-network").ProviderWorld;

  const actor = (role = "SUPER_ADMIN") => ({ userId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, role });
  const tid = () => world.tenants.alpha.id;
  const pid = () => world.providers.a.id;
  const IN_RANGE = new Date("2031-06-15T00:00:00Z");
  const OUT_OF_RANGE = new Date("2032-06-15T00:00:00Z");
  let arrId = "";
  const testCaseIds: string[] = [];
  let linkSeq = 0;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Arr = (await import("@/server/services/capitation/arrangement.service")).CapitationArrangementService;
    Link = (await import("@/server/services/capitation/encounter-link.service")).CapitationEncounterLinkService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
    const a = await Arr.createArrangement(actor(), {
      providerId: pid(), label: "cap", rate: "12000.00", currency: "UGX", eligibilityDefinitionVersion: "CAP-1.0",
      effectiveFrom: new Date("2031-01-01T00:00:00Z"), effectiveTo: new Date("2031-12-31T00:00:00Z"),
    });
    await Arr.activate(actor(), a.id);
    arrId = a.id;
  });
  afterAll(async () => {
    await prisma.caseServiceEntry.deleteMany({ where: { caseId: { in: testCaseIds } } });
    await prisma.clinicalCase.deleteMany({ where: { id: { in: testCaseIds } } });
    if (world) await world.teardown();
  });

  const linkInput = (funding: "INCLUDED" | "CARVE_OUT", entityId: string) => ({
    arrangementId: arrId, memberId: world.members.alpha.id, providerId: pid(), serviceDate: IN_RANGE,
    entityType: "CASE_SERVICE_ENTRY" as const, entityId, funding,
  });

  it("classifies included / carve-out / no-arrangement (with the effective-date boundary)", async () => {
    expect(await Link.classify(tid(), { serviceDate: IN_RANGE, providerId: pid(), serviceFunding: "CAPITATION" })).toMatchObject({ funding: "INCLUDED", arrangementId: arrId });
    expect(await Link.classify(tid(), { serviceDate: IN_RANGE, providerId: pid(), serviceFunding: "FEE_FOR_SERVICE" })).toMatchObject({ funding: "CARVE_OUT", arrangementId: arrId });
    // outside the arrangement's effective window → ordinary FFS, no arrangement
    expect(await Link.classify(tid(), { serviceDate: OUT_OF_RANGE, providerId: pid(), serviceFunding: "CAPITATION" })).toMatchObject({ funding: "FFS", arrangementId: null, reason: "NO_ARRANGEMENT" });
  });

  it("hard-denies FFS settlement of an included zero-pay line; a carve-out settles", async () => {
    await Link.linkEncounter(actor(), linkInput("INCLUDED", `inc-${++linkSeq}`));
    const incId = `inc-${linkSeq}`;
    await expect(Link.assertFfsSettlementAllowed(tid(), "CASE_SERVICE_ENTRY", incId)).rejects.toMatchObject({ code: "PERIOD_IMMUTABLE" });

    await Link.linkEncounter(actor(), linkInput("CARVE_OUT", `carve-${++linkSeq}`));
    await expect(Link.assertFfsSettlementAllowed(tid(), "CASE_SERVICE_ENTRY", `carve-${linkSeq}`)).resolves.toBeUndefined();
    // an unlinked line settles normally too
    await expect(Link.assertFfsSettlementAllowed(tid(), "CASE_SERVICE_ENTRY", "never-linked")).resolves.toBeUndefined();
  });

  it("refuses to link the same line twice (no double-count without an explicit split)", async () => {
    const entityId = `dup-${++linkSeq}`;
    await Link.linkEncounter(actor(), linkInput("INCLUDED", entityId));
    await expect(Link.linkEncounter(actor(), linkInput("CARVE_OUT", entityId))).rejects.toMatchObject({ code: "OVERLAP" });
  });

  it("preserves clinical utilization — the link never mutates or deletes the encounter", async () => {
    const c = await prisma.clinicalCase.create({
      data: {
        tenantId: tid(), caseNumber: "CASE-F105-1", memberId: world.members.alpha.id, providerId: pid(),
        caseType: "INPATIENT_ADMISSION", benefitCategory: "INPATIENT", status: "OPEN", admissionDate: new Date("2031-06-01Z"),
        openedById: world.users.a.admin.id, currency: "UGX",
      },
    });
    testCaseIds.push(c.id);
    const entry = await prisma.caseServiceEntry.create({
      data: { caseId: c.id, entryDate: IN_RANGE, category: "PHARMACY", description: "Capitated drug", quantity: 1, unitAmount: 500, totalAmount: 500, source: "MANUAL" },
    });
    await Link.linkEncounter(actor(), linkInput("INCLUDED", entry.id));
    // the entry is untouched — still present, not voided, amount intact (utilization evidence remains)
    const after = await prisma.caseServiceEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after.voided).toBe(false);
    expect(Number(after.totalAmount)).toBe(500);
  });

  it("requires a finance role to link", async () => {
    await expect(Link.linkEncounter(actor("PROVIDER_USER"), linkInput("INCLUDED", `role-${++linkSeq}`))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
