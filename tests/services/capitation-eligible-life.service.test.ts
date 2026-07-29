/**
 * F10.3 — eligible-life snapshot (opt-in DB). Canonical coverage + status + scope
 * classify each candidate (COVERED / NOT_ACTIVE / NO_COVERAGE_ON_SNAPSHOT_DAY);
 * dependants count; the snapshot-day boundary is inclusive; replay is a control-hash
 * no-op; a coverage change recomputes; freeze locks the roster. No accrual.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F10.3 eligible-life snapshot (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Arr: typeof import("@/server/services/capitation/arrangement.service").CapitationArrangementService;
  let Elig: typeof import("@/server/services/capitation/eligible-life.service").EligibleLifeSnapshotService;
  let world: import("../factories/provider-network").ProviderWorld;

  const SNAP = new Date("2028-06-15T00:00:00Z");
  const createdMemberIds: string[] = [];
  let seq = 0;
  const actor = (role = "SUPER_ADMIN") => ({ userId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, role });

  async function mkMember(status: string, relationship: string) {
    const m = await prisma.member.create({
      data: {
        tenantId: world.tenants.alpha.id, memberNumber: `ELG-${++seq}`, groupId: world.groups.alpha.id, packageId: world.packages.alpha.pkg.id,
        firstName: "T", lastName: `M${seq}`, dateOfBirth: new Date("1990-01-01Z"), gender: "MALE", relationship: relationship as never, status: status as never,
        enrollmentDate: new Date("2028-01-01Z"),
      },
    });
    createdMemberIds.push(m.id);
    return m.id;
  }
  const mkCoverage = (memberId: string, startDate: Date, endDate: Date | null) =>
    prisma.memberCoveragePeriod.create({ data: { tenantId: world.tenants.alpha.id, memberId, startDate, endDate, reason: "ACTIVATION" } });

  let arrId = "";
  let periodId = "";
  let principalId = "";
  let depId = "";
  let joinerId = "";
  let suspendedId = "";

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Arr = (await import("@/server/services/capitation/arrangement.service")).CapitationArrangementService;
    Elig = (await import("@/server/services/capitation/eligible-life.service")).EligibleLifeSnapshotService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);

    const arr = await Arr.createArrangement(actor(), {
      providerId: world.providers.a.id, clientId: null, groupId: world.groups.alpha.id, packageId: world.packages.alpha.pkg.id,
      label: "cap", rate: "12000.00", currency: "UGX", eligibilityDefinitionVersion: "CAP-1.0",
      effectiveFrom: new Date("2028-01-01Z"), effectiveTo: new Date("2028-12-31Z"),
    });
    arrId = arr.id;
    const p = await Arr.openPeriod(actor(), arrId, "2028-06", { periodStart: new Date("2028-06-01Z"), periodEnd: new Date("2028-06-30Z") });
    periodId = p.id;

    // Scope = groupAlpha + pkgAlpha. Candidates: an active principal (boundary-inclusive
    // coverage), an active dependant (covered), an active joiner (covers only next month),
    // and a suspended member.
    principalId = await mkMember("ACTIVE", "PRINCIPAL");
    await mkCoverage(principalId, new Date("2028-06-01Z"), SNAP); // endDate == snapshot → inclusive → COVERED
    depId = await mkMember("ACTIVE", "SPOUSE");
    await mkCoverage(depId, new Date("2028-06-01Z"), null); // open → COVERED
    joinerId = await mkMember("ACTIVE", "PRINCIPAL");
    await mkCoverage(joinerId, new Date("2028-07-01Z"), null); // starts after snapshot → NO_COVERAGE
    suspendedId = await mkMember("SUSPENDED", "PRINCIPAL");
    await mkCoverage(suspendedId, new Date("2028-06-01Z"), null); // covered but NOT_ACTIVE
  });
  afterAll(async () => {
    await prisma.memberCoveragePeriod.deleteMany({ where: { tenantId: world.tenants.alpha.id } });
    await prisma.member.deleteMany({ where: { id: { in: createdMemberIds } } });
    if (world) await world.teardown();
  });

  it("classifies covered/dependant/joiner/suspended at the (inclusive) snapshot boundary", async () => {
    const r = await Elig.computeSnapshot(actor(), periodId, { snapshotInstant: SNAP });
    expect(r.changed).toBe(true);

    // Assert per-member outcomes (robust to other in-scope members the factory seeds).
    const roster = await prisma.capitationEligibleLife.findMany({ where: { periodId } });
    const reason = new Map(roster.map((x) => [x.memberId, x.reasonCode]));
    expect(reason.get(principalId)).toBe("COVERED"); // boundary endDate == snapshot → inclusive
    expect(reason.get(depId)).toBe("COVERED"); // a dependant counts as a life
    expect(reason.get(joinerId)).toBe("NO_COVERAGE_ON_SNAPSHOT_DAY"); // joins next month
    expect(reason.get(suspendedId)).toBe("NOT_ACTIVE"); // covered but not active

    const includedIds = roster.filter((x) => x.included).map((x) => x.memberId);
    expect(includedIds).toEqual(expect.arrayContaining([principalId, depId]));
    expect(includedIds).not.toContain(joinerId);

    const period = await prisma.capitationPeriod.findUniqueOrThrow({ where: { id: periodId } });
    expect(period.eligibleLifeCount).toBe(r.count); // period count == service count
    expect(period.eligibleLifeControlHash).toHaveLength(64);
  });

  it("replays as a control-hash no-op, and recomputes when coverage changes", async () => {
    const before = await prisma.capitationPeriod.findUniqueOrThrow({ where: { id: periodId } });
    const replay = await Elig.computeSnapshot(actor(), periodId, { snapshotInstant: SNAP });
    expect(replay.changed).toBe(false);
    expect(replay.controlHash).toBe(before.eligibleLifeControlHash);

    // The joiner's coverage now starts before the snapshot → COVERED on recompute.
    await prisma.memberCoveragePeriod.updateMany({ where: { memberId: joinerId }, data: { startDate: new Date("2028-06-01Z") } });
    const changed = await Elig.computeSnapshot(actor(), periodId, { snapshotInstant: SNAP });
    expect(changed.changed).toBe(true);
    expect(changed.count).toBe(3);
    expect(changed.controlHash).not.toBe(before.eligibleLifeControlHash);
  });

  it("does not include an out-of-scope member (different group)", async () => {
    const roster = await prisma.capitationEligibleLife.findMany({ where: { periodId } });
    expect(roster.some((r) => r.memberId === world.members.alpha2.id)).toBe(false); // groupAlpha2 is out of scope
  });

  it("freezes the snapshot with a completeness check and blocks recompute after", async () => {
    const frozen = await Elig.freezeSnapshot(actor(), periodId);
    expect(frozen.status).toBe("CALCULATED");
    await expect(Elig.computeSnapshot(actor(), periodId, { snapshotInstant: SNAP })).rejects.toMatchObject({ code: "PERIOD_IMMUTABLE" });
  });
});
