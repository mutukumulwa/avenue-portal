/**
 * F0.6 (Provider Network OS) — deterministic provider-graph factory.
 *
 * The seed ships NO provider contracts, branches, applicability, or provider
 * users (see docs/provider-network-os/TEST_DB_HARNESS.md), so provider-scope
 * tests cannot lean on it. This factory builds a coherent, self-cleaning graph
 * covering the §20 UAT dataset dimensions that the current schema supports:
 *
 *   - two tenants (Alpha, Beta) → true cross-tenant tests;
 *   - providers A + B in Alpha, provider C in Beta;
 *   - branches A1/A2/B1/C1 (rows only — user→branch assignment arrives in F1.2,
 *     so this factory deliberately does NOT assign users to branches yet);
 *   - a client/group/package/version/benefit per tenant, in different currencies
 *     (Alpha UGX, Beta KES);
 *   - members active + inactive;
 *   - provider users for every persona label, all on the coarse PROVIDER_USER
 *     role (granular permissions arrive in F1.1), plus one suspended user;
 *   - ProviderContracts ACTIVE / EXPIRED / future-APPROVED and INCLUDE + EXCLUDE
 *     ContractApplicability — the effective-dating F1.8/F1.10/F1.11 exercise.
 *
 * Every run is namespaced by a unique token so parallel/repeat setup never
 * collides, and `teardown()` deletes in FK-safe order. No shared mutable state.
 *
 * Test-only: direct model creates here are outside the runtime claim/PA creator
 * allowlist by design (docs/claims-autopilot/CLAIM_CREATOR_INVENTORY §2).
 */
import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";

export type ProviderWorld = Awaited<ReturnType<typeof buildProviderWorld>>;

type Prisma = PrismaClient | any;

const DAY = 24 * 60 * 60 * 1000;

export interface BuildOptions {
  /** stable across a run; defaults to a fresh short uuid. */
  token?: string;
}

export async function buildProviderWorld(prisma: Prisma, opts: BuildOptions = {}) {
  const token = opts.token ?? randomUUID().slice(0, 8);
  const now = new Date();
  const past = (d: number) => new Date(now.getTime() - d * DAY);
  const future = (d: number) => new Date(now.getTime() + d * DAY);
  const pwHash = "$2a$10$abcdefghijklmnopqrstuv"; // not a login target; placeholder hash

  // ── tenants ──────────────────────────────────────────────────────────────
  const alpha = await prisma.tenant.create({ data: { name: `Alpha ${token}`, slug: `alpha-${token}` } });
  const beta = await prisma.tenant.create({ data: { name: `Beta ${token}`, slug: `beta-${token}` } });

  // ── clients (payers) — different currencies ──────────────────────────────
  const clientAlpha = await prisma.client.create({
    data: { operatorTenantId: alpha.id, type: "EMPLOYER_SELF_FUNDED", name: `Alpha Payer ${token}`, slug: `alpha-payer-${token}`, currency: "UGX", memberNumberPrefix: `ALP${token.slice(0, 3).toUpperCase()}` },
  });
  const clientBeta = await prisma.client.create({
    data: { operatorTenantId: beta.id, type: "INSURER", name: `Beta Payer ${token}`, slug: `beta-payer-${token}`, currency: "KES", memberNumberPrefix: `BET${token.slice(0, 3).toUpperCase()}` },
  });

  // ── packages + versions + one benefit each ───────────────────────────────
  async function mkPackage(tenantId: string, name: string) {
    const pkg = await prisma.package.create({
      data: { tenantId, name: `${name} ${token}`, annualLimit: 1_000_000, contributionAmount: 50_000, status: "ACTIVE" },
    });
    const version = await prisma.packageVersion.create({
      data: { packageId: pkg.id, versionNumber: 1, effectiveFrom: past(365) },
    });
    await prisma.benefitConfig.create({
      data: { packageVersionId: version.id, category: "OUTPATIENT", annualSubLimit: 500_000 },
    });
    await prisma.package.update({ where: { id: pkg.id }, data: { currentVersionId: version.id } });
    return { pkg, version };
  }
  const pkgAlpha = await mkPackage(alpha.id, "Alpha Essential");
  const pkgBeta = await mkPackage(beta.id, "Beta Essential");

  // ── groups (schemes) ──────────────────────────────────────────────────────
  async function mkGroup(tenantId: string, clientId: string, packageId: string, name: string) {
    return prisma.group.create({
      data: {
        tenantId, clientId, packageId, name: `${name} ${token}`,
        contactPersonName: "Ops Lead", contactPersonPhone: "+256700000000", contactPersonEmail: `ops.${token}@example.test`,
        contributionRate: 50_000, effectiveDate: past(365), renewalDate: future(30), status: "ACTIVE",
      },
    });
  }
  const groupAlpha = await mkGroup(alpha.id, clientAlpha.id, pkgAlpha.pkg.id, "Alpha Scheme");
  const groupAlpha2 = await mkGroup(alpha.id, clientAlpha.id, pkgAlpha.pkg.id, "Alpha Scheme Two");
  const groupBeta = await mkGroup(beta.id, clientBeta.id, pkgBeta.pkg.id, "Beta Scheme");

  // ── members ────────────────────────────────────────────────────────────────
  let memberSeq = 0;
  async function mkMember(tenantId: string, groupId: string, packageId: string, prefix: string, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    memberSeq += 1;
    return prisma.member.create({
      data: {
        tenantId, groupId, packageId,
        memberNumber: `${prefix}-${token}-${String(memberSeq).padStart(4, "0")}`,
        firstName: "Test", lastName: `Member${memberSeq}`, dateOfBirth: new Date("1990-01-01"), gender: "FEMALE",
        enrollmentDate: past(300), activationDate: past(299), coverStartDate: past(299), coverEndDate: future(60),
        status,
      },
    });
  }
  const memberAlpha = await mkMember(alpha.id, groupAlpha.id, pkgAlpha.pkg.id, "ALP");
  const memberAlpha2 = await mkMember(alpha.id, groupAlpha2.id, pkgAlpha.pkg.id, "ALP");
  const memberAlphaInactive = await mkMember(alpha.id, groupAlpha.id, pkgAlpha.pkg.id, "ALP", "SUSPENDED");
  const memberBeta = await mkMember(beta.id, groupBeta.id, pkgBeta.pkg.id, "BET");

  // ── providers + branches ────────────────────────────────────────────────
  async function mkProvider(tenantId: string, name: string) {
    return prisma.provider.create({ data: { tenantId, name: `${name} ${token}`, type: "HOSPITAL", contractStatus: "ACTIVE", servicesOffered: ["Outpatient", "Inpatient"] } });
  }
  const providerA = await mkProvider(alpha.id, "Provider A");
  const providerB = await mkProvider(alpha.id, "Provider B");
  const providerC = await mkProvider(beta.id, "Provider C");
  const mkBranch = (tenantId: string, providerId: string, name: string) =>
    prisma.providerBranch.create({ data: { tenantId, providerId, name: `${name} ${token}`, isActive: true } });
  const branchA1 = await mkBranch(alpha.id, providerA.id, "A1");
  const branchA2 = await mkBranch(alpha.id, providerA.id, "A2");
  const branchB1 = await mkBranch(alpha.id, providerB.id, "B1");
  const branchC1 = await mkBranch(beta.id, providerC.id, "C1");

  // ── provider users (persona labels; all coarse PROVIDER_USER role) ────────
  const personas = ["frontdesk", "clinician", "biller", "finance", "admin", "integration"] as const;
  const usersA: Record<string, { id: string; email: string }> = {};
  for (const p of personas) {
    const u = await prisma.user.create({
      data: {
        tenantId: alpha.id, providerId: providerA.id, role: "PROVIDER_USER",
        email: `${p}.${token}@provider-a.test`, passwordHash: pwHash, firstName: p, lastName: "A", isActive: true,
      },
    });
    usersA[p] = { id: u.id, email: u.email };
  }
  const userB = await prisma.user.create({
    data: { tenantId: alpha.id, providerId: providerB.id, role: "PROVIDER_USER", email: `biller.${token}@provider-b.test`, passwordHash: pwHash, firstName: "biller", lastName: "B", isActive: true },
  });
  const userC = await prisma.user.create({
    data: { tenantId: beta.id, providerId: providerC.id, role: "PROVIDER_USER", email: `biller.${token}@provider-c.test`, passwordHash: pwHash, firstName: "biller", lastName: "C", isActive: true },
  });
  const userASuspended = await prisma.user.create({
    data: { tenantId: alpha.id, providerId: providerA.id, role: "PROVIDER_USER", email: `suspended.${token}@provider-a.test`, passwordHash: pwHash, firstName: "suspended", lastName: "A", isActive: false },
  });

  // ── contracts + applicability (effective-dating + INCLUDE/EXCLUDE) ────────
  let contractSeq = 0;
  async function mkContract(tenantId: string, providerId: string, status: string, start: Date, end: Date) {
    contractSeq += 1;
    return prisma.providerContract.create({
      data: {
        tenantId, providerId, status: status as any,
        contractNumber: `PC-${token}-${String(contractSeq).padStart(3, "0")}`,
        title: `${status} contract ${token}`, startDate: start, endDate: end,
      },
    });
  }
  // Provider A: ACTIVE (now), EXPIRED (past), future-APPROVED
  const contractAActive = await mkContract(alpha.id, providerA.id, "ACTIVE", past(90), future(275));
  const contractAExpired = await mkContract(alpha.id, providerA.id, "EXPIRED", past(800), past(400));
  const contractAFuture = await mkContract(alpha.id, providerA.id, "APPROVED", future(30), future(400));
  // Provider B: ACTIVE
  const contractBActive = await mkContract(alpha.id, providerB.id, "ACTIVE", past(90), future(275));
  // Provider C (Beta): ACTIVE
  const contractCActive = await mkContract(beta.id, providerC.id, "ACTIVE", past(90), future(275));

  const mkApplic = (contractId: string, clientId: string, groupId: string | null, rule: "INCLUDE" | "EXCLUDE", effFrom: Date, effTo: Date | null) =>
    prisma.contractApplicability.create({
      data: { contractId, clientId, groupId, inclusionType: rule as any, effectiveFrom: effFrom, effectiveTo: effTo, isActive: true },
    });
  // A ACTIVE: INCLUDE whole Alpha client, EXCLUDE the second Alpha group
  await mkApplic(contractAActive.id, clientAlpha.id, null, "INCLUDE", past(90), null);
  await mkApplic(contractAActive.id, clientAlpha.id, groupAlpha2.id, "EXCLUDE", past(90), null);
  // A EXPIRED: INCLUDE but expired window
  await mkApplic(contractAExpired.id, clientAlpha.id, null, "INCLUDE", past(800), past(400));
  // A FUTURE: INCLUDE starting in the future
  await mkApplic(contractAFuture.id, clientAlpha.id, null, "INCLUDE", future(30), null);
  // B ACTIVE: INCLUDE only groupAlpha (group-level)
  await mkApplic(contractBActive.id, clientAlpha.id, groupAlpha.id, "INCLUDE", past(90), null);
  // C ACTIVE: INCLUDE Beta client
  await mkApplic(contractCActive.id, clientBeta.id, null, "INCLUDE", past(90), null);

  const tenantIds = [alpha.id, beta.id];

  // ── reusable claim/PA targets (F2+) ────────────────────────────────────────
  let targetSeq = 0;
  const createdClaimIds: string[] = [];
  const createdPreauthIds: string[] = [];
  const createdCaseIds: string[] = [];
  const providerCId = providerC.id;

  async function createClaim(opts: { providerId?: string; branchId?: string | null; memberId?: string; status?: string } = {}) {
    targetSeq += 1;
    const providerId = opts.providerId ?? providerA.id;
    const tId = providerId === providerCId ? beta.id : alpha.id;
    const memberId = opts.memberId ?? (tId === beta.id ? memberBeta.id : memberAlpha.id);
    const row = await prisma.claim.create({
      data: {
        tenantId: tId, claimNumber: `CLM-${token}-${targetSeq}`, memberId, providerId,
        providerBranchId: opts.branchId ?? null, serviceType: "OUTPATIENT", dateOfService: now,
        diagnoses: [], procedures: [], billedAmount: 1000, benefitCategory: "OUTPATIENT",
        ...(opts.status ? { status: opts.status as never } : {}),
      },
    });
    createdClaimIds.push(row.id);
    return row;
  }

  async function createPreauth(opts: { providerId?: string; memberId?: string } = {}) {
    targetSeq += 1;
    const providerId = opts.providerId ?? providerA.id;
    const tId = providerId === providerCId ? beta.id : alpha.id;
    const memberId = opts.memberId ?? (tId === beta.id ? memberBeta.id : memberAlpha.id);
    const row = await prisma.preAuthorization.create({
      data: {
        tenantId: tId, preauthNumber: `PA-${token}-${targetSeq}`, memberId, providerId,
        submittedBy: "PROVIDER", diagnoses: [], procedures: [], estimatedCost: 1000, benefitCategory: "OUTPATIENT",
      },
    });
    createdPreauthIds.push(row.id);
    return row;
  }

  async function teardown() {
    // FK-safe order: branch assignments → applicability → contracts → members →
    // groups → benefit → version → package → branches → users → providers →
    // clients → tenants.
    const providerIds = [providerA.id, providerB.id, providerC.id];
    const contractIds = [contractAActive.id, contractAExpired.id, contractAFuture.id, contractBActive.id, contractCActive.id];
    // PNOS F1.2: assignments reference tenant/provider/user/branch — clear first.
    await prisma.providerUserBranchAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // Provider services audit against this world's users (AuditLog.userId FK) —
    // clear those rows before the users are deleted. Scoped to this world's users.
    const worldUserIds = [
      ...Object.values(usersA).map((u) => u.id),
      userB.id, userC.id, userASuspended.id,
    ];
    await prisma.auditLog.deleteMany({ where: { userId: { in: worldUserIds } } });
    // F2+ targets (+ documents referencing them or scoped to this world) — before members/providers.
    await prisma.document.deleteMany({ where: { OR: [{ claimId: { in: createdClaimIds } }, { preauthId: { in: createdPreauthIds } }, { caseId: { in: createdCaseIds } }, { tenantId: { in: tenantIds } }] } });
    // F5.7: claims may now be created through the canonical intake (a correction's child —
    // an UNTRACKED id, with lines + a processing run + an intake receipt), so tear claims down
    // by TENANT (these tenants are world-exclusive) and clear every claim-FK dependent first.
    const worldClaimIds = (await prisma.claim.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } })).map((c: { id: string }) => c.id);
    await prisma.adjudicationLog.deleteMany({ where: { claimId: { in: worldClaimIds } } });
    await prisma.claimLine.deleteMany({ where: { claimId: { in: worldClaimIds } } });
    await prisma.claimProcessingRun.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.claim.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // F3.2 intake evidence + F4.1 info requests (relation-less, so no FK forces this — kept tidy anyway)
    await prisma.preAuthorizationEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.preauthIntakeReceipt.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.preauthInfoRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notificationOutbox.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.preAuthorization.deleteMany({ where: { id: { in: createdPreauthIds } } });
    await prisma.clinicalCase.deleteMany({ where: { id: { in: createdCaseIds } } });
    await prisma.contractApplicability.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.providerContract.deleteMany({ where: { id: { in: contractIds } } });
    await prisma.member.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.group.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const versionIds = [pkgAlpha.version.id, pkgBeta.version.id];
    const pkgIds = [pkgAlpha.pkg.id, pkgBeta.pkg.id];
    await prisma.package.updateMany({ where: { id: { in: pkgIds } }, data: { currentVersionId: null } });
    await prisma.benefitConfig.deleteMany({ where: { packageVersionId: { in: versionIds } } });
    await prisma.packageVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.package.deleteMany({ where: { id: { in: pkgIds } } });
    await prisma.providerBranch.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.provider.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.client.deleteMany({ where: { operatorTenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }

  return {
    token,
    tenants: { alpha, beta },
    clients: { alpha: clientAlpha, beta: clientBeta },
    packages: { alpha: pkgAlpha, beta: pkgBeta },
    groups: { alpha: groupAlpha, alpha2: groupAlpha2, beta: groupBeta },
    members: { alpha: memberAlpha, alpha2: memberAlpha2, alphaInactive: memberAlphaInactive, beta: memberBeta },
    providers: { a: providerA, b: providerB, c: providerC },
    branches: { a1: branchA1, a2: branchA2, b1: branchB1, c1: branchC1 },
    users: { a: usersA, b: userB, c: userC, aSuspended: userASuspended },
    contracts: { aActive: contractAActive, aExpired: contractAExpired, aFuture: contractAFuture, bActive: contractBActive, cActive: contractCActive },
    createClaim,
    createPreauth,
    teardown,
  };
}
