/**
 * Eligibility Verification UAT — member + network fixtures (R3). Local-only, labelled, idempotent.
 *
 * Builds an EL-UAT-* cohort where EACH member isolates ONE eligibility dimension, so an agent
 * can objectively record "did the system catch it?" across the provider portal, TPA ops, and the
 * /api/v1 rails. R2 adds identity/wrong-patient, date-boundary, balance-boundary, and
 * data-integrity fixtures per the 2026-08-10 deficiency assessment.
 *
 * Run:  TZ=Africa/Kampala npx tsx scripts/uat-eligibility-fixtures.ts
 * Wipe is prefix-scoped (memberNumber / group / client / contract all start "EL-UAT"),
 * so this never touches real data or the inpatient IP-UAT-* cohort.
 *
 * CLOCK (deficiency PLAN-02): all date-sensitive fixtures are computed RELATIVE TO `new Date()`
 * at build time and the build date is printed. Execute the campaign on the SAME calendar day the
 * fixtures were built (or freeze the environment clock to that day). The provider UI accepts a
 * service date, but blank-date and routes that use their own clock still require the same-day/frozen
 * canary. Run with `TZ=Africa/Kampala`; the script fails if the runtime timezone differs.
 *
 * CONTROL TOTAL (deficiency PLAN-09): EXPECTED_COUNT is derived from the FIXTURES array and both
 * printed and asserted against the DB after build; setup FAILS on mismatch.
 *
 * The clinical stories and amounts here are fictional UAT fixtures, not treatment guidance or
 * negotiated terms. Currency UGX; business timezone Africa/Kampala.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { normalizeLegalName } from '../src/lib/normalize';

const M = 1_000_000;
const BUSINESS_TZ = 'Africa/Kampala';
const runtimeTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (runtimeTimezone !== BUSINESS_TZ) {
  throw new Error(`Eligibility UAT fixtures require TZ=${BUSINESS_TZ}; runtime resolved ${runtimeTimezone}. Run: TZ=${BUSINESS_TZ} npx tsx scripts/uat-eligibility-fixtures.ts`);
}
const NOW = new Date();
const Y = NOW.getFullYear();
const YEAR_START = new Date(Y, 0, 1);
const YEAR_END = new Date(Y, 11, 31, 23, 59, 59);
const PERIOD_START = new Date(Y, 0, 1);
const PERIOD_END = new Date(Y + 1, 0, 1);
const daysFromNow = (n: number) => { const d = new Date(NOW); d.setDate(d.getDate() + n); return d; };
const yearsAgo = (n: number) => new Date(NOW.getFullYear() - n, NOW.getMonth(), NOW.getDate());
const TODAY_END = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 23, 59, 59);
const TOMORROW = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1);
const DOB_ADULT = yearsAgo(36);
const DOB_CHILD = yearsAgo(12);
const DEP_MAX_AGE = 24; // Package.dependentMaxAge default

type Cat =
  | 'INPATIENT' | 'OUTPATIENT' | 'SURGICAL' | 'MATERNITY'
  | 'DENTAL' | 'OPTICAL' | 'CHRONIC_DISEASE' | 'AMBULANCE_EMERGENCY';

type MemberStatus =
  | 'ACTIVE' | 'PENDING_ACTIVATION' | 'SUSPENDED' | 'LAPSED' | 'TERMINATED' | 'EXPIRED';

type CoCoType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'NONE';

interface Cfg { cat: Cat; sub: number; copayPct?: number; waitDays?: number; perVisit?: number }

interface Fx {
  num: string;
  first: string;
  last: string;
  gender: 'MALE' | 'FEMALE';
  relationship?: 'PRINCIPAL' | 'CHILD';
  principalOf?: string;         // CHILD: principal's memberNumber. CHILD with none = orphan (principalId null).
  status?: MemberStatus;        // default ACTIVE
  scheme?: 'NILE' | 'SUSPENDED' | 'FOREIGN';  // which group; default NILE (active, contracted)
  dob?: Date;
  overall: number;
  configs: Cfg[];
  sharedPackageKey?: string;    // members with the same key share ONE package/version
  familyPool?: { cat: Cat; limit: number };  // add a FAMILY SharedLimitGroup on this category
  used?: Array<{ cat: Cat; amount: number }>;
  coverStart?: Date;
  coverEnd?: Date;
  coveragePeriodEnd?: Date | null; // write a MemberCoveragePeriod ending here (null = open)
  waiting?: { cats: Cat[]; days: number; start: Date; end: Date };
  exclusionIcd?: string;
  coContribution?: { cat: Cat; type: CoCoType; pct?: number; fixed?: number };
  note: string;
}

const FIXTURES: Fx[] = [
  // ── Happy path (the daily reception case) ──────────────────────────────────
  { num: 'EL-UAT-ACTIVE-01', first: 'Grace', last: 'Ainembabazi', gender: 'FEMALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }, { cat: 'DENTAL', sub: 100_000, copayPct: 20, waitDays: 90 }, { cat: 'OPTICAL', sub: 80_000 }],
    used: [{ cat: 'OUTPATIENT', amount: 50_000 }],
    note: 'Clean ACTIVE principal, ACTIVE scheme — baseline ELIGIBLE, the every-day case.' },

  // ── Family with a real FAMILY shared pool (dependant resolution + 2-consumer race) ─
  { num: 'EL-UAT-FAM-P', first: 'Julius', last: 'Okwir', gender: 'MALE', overall: 8 * M,
    sharedPackageKey: 'FAM', familyPool: { cat: 'OUTPATIENT', limit: 300_000 },
    configs: [{ cat: 'OUTPATIENT', sub: 800_000 }, { cat: 'INPATIENT', sub: 5 * M }, { cat: 'MATERNITY', sub: 2 * M }],
    used: [{ cat: 'OUTPATIENT', amount: 100_000 }],
    note: 'Family principal sharing a 300k FAMILY OUTPATIENT pool with the dependant — for OPS-09 two-consumer race.' },
  { num: 'EL-UAT-FAM-D', first: 'Shantel', last: 'Okwir', gender: 'FEMALE', relationship: 'CHILD', principalOf: 'EL-UAT-FAM-P',
    dob: DOB_CHILD, overall: 8 * M, sharedPackageKey: 'FAM', configs: [],
    note: 'Genuine child dependant (age ~12) sharing the family pool — ELIGIBLE via principal.' },

  // ── Enrolment / active-cover status matrix (one member per non-ACTIVE state) ─
  { num: 'EL-UAT-PENDING', first: 'Peter', last: 'Wanyama', gender: 'MALE', status: 'PENDING_ACTIVATION', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'PENDING_ACTIVATION → expected NOT ELIGIBLE.' },
  { num: 'EL-UAT-SUSPENDED', first: 'Anne', last: 'Namutebi', gender: 'FEMALE', status: 'SUSPENDED', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'SUSPENDED member → expected NOT ELIGIBLE.' },
  { num: 'EL-UAT-LAPSED', first: 'Moses', last: 'Kirya', gender: 'MALE', status: 'LAPSED', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'LAPSED → expected NOT ELIGIBLE; member portal shows lapsed banner.' },
  { num: 'EL-UAT-TERMINATED', first: 'Sarah', last: 'Atim', gender: 'FEMALE', status: 'TERMINATED', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'TERMINATED → expected NOT ELIGIBLE.' },
  { num: 'EL-UAT-EXPIRED', first: 'John', last: 'Ssemakula', gender: 'MALE', status: 'EXPIRED', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'EXPIRED → expected NOT ELIGIBLE.' },

  // ── Group / scheme level ────────────────────────────────────────────────────
  { num: 'EL-UAT-GRPSUSP', first: 'Rita', last: 'Nabirye', gender: 'FEMALE', status: 'ACTIVE', scheme: 'SUSPENDED', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }],
    note: 'Member ACTIVE under a SUSPENDED scheme → business expectation NOT ELIGIBLE with scheme-level reason.' },

  // ── Coverage-window boundary set (dates relative to build day) ──────────────
  { num: 'EL-UAT-COVEXPIRED', first: 'Daniel', last: 'Opio', gender: 'MALE', status: 'ACTIVE', overall: 5 * M,
    coverEnd: daysFromNow(-40), coveragePeriodEnd: daysFromNow(-40), configs: [{ cat: 'OUTPATIENT', sub: 500_000 }],
    note: 'ACTIVE status/scheme but cover ended 40 days ago → business expectation NOT ELIGIBLE for today.' },
  { num: 'EL-UAT-STARTS-TMRW', first: 'Naomi', last: 'Apio', gender: 'FEMALE', status: 'ACTIVE', overall: 5 * M,
    coverStart: TOMORROW, coveragePeriodEnd: null, configs: [{ cat: 'OUTPATIENT', sub: 500_000 }],
    note: 'ACTIVE but cover STARTS TOMORROW → business expectation NOT ELIGIBLE today; DATE-01 boundary.' },
  { num: 'EL-UAT-ENDS-TODAY', first: 'Simon', last: 'Ekwaru', gender: 'MALE', status: 'ACTIVE', overall: 5 * M,
    coverEnd: TODAY_END, coveragePeriodEnd: TODAY_END, configs: [{ cat: 'OUTPATIENT', sub: 500_000 }],
    note: 'Cover ends END OF TODAY (Africa/Kampala) → three-way boundary check day-before/on/day-after (DATE-03).' },

  // ── Balance / sublimit set ──────────────────────────────────────────────────
  { num: 'EL-UAT-NEARCAP', first: 'Esther', last: 'Nakimuli', gender: 'FEMALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], used: [{ cat: 'OUTPATIENT', amount: 450_000 }],
    note: 'OUTPATIENT 90% consumed (450k/500k) — near cap; true remaining 50k.' },
  { num: 'EL-UAT-EXHAUST-CAT', first: 'Brian', last: 'Kato', gender: 'MALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }, { cat: 'DENTAL', sub: 100_000 }],
    used: [{ cat: 'DENTAL', amount: 100_000 }, { cat: 'OUTPATIENT', amount: 50_000 }],
    note: 'DENTAL sublimit fully exhausted (100k/100k), overall fine → still ELIGIBLE; DENTAL remaining 0.' },
  { num: 'EL-UAT-OVERALL-BIND', first: 'Faith', last: 'Auma', gender: 'FEMALE', overall: 2 * M,
    configs: [{ cat: 'INPATIENT', sub: 5 * M }, { cat: 'OUTPATIENT', sub: 2 * M }], used: [{ cat: 'OUTPATIENT', amount: 1_600_000 }],
    note: 'OVERALL 2M binds BELOW the INPATIENT 5M sublimit; business binding remaining is 400k on every channel.' },
  { num: 'EL-UAT-ZERO-REM', first: 'Agnes', last: 'Nangobi', gender: 'FEMALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], used: [{ cat: 'OUTPATIENT', amount: 500_000 }],
    note: 'OUTPATIENT remaining EXACTLY 0 (500k/500k) — for equals/±UGX1 requested-amount boundary probes (OPS-09).' },

  // ── Waiting / exclusion / age / gender business-rule fixtures ─────────────
  { num: 'EL-UAT-WAIT', first: 'Ronald', last: 'Mugisha', gender: 'MALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }, { cat: 'DENTAL', sub: 200_000, waitDays: 90 }],
    waiting: { cats: ['DENTAL'], days: 90, start: daysFromNow(-30), end: daysFromNow(90) },
    note: 'Active DENTAL waiting period; must be visible before treatment and enforced consistently.' },
  { num: 'EL-UAT-EXCL-ICD', first: 'Lydia', last: 'Akello', gender: 'FEMALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }, { cat: 'CHRONIC_DISEASE', sub: 1 * M }], exclusionIcd: 'E11.9',
    note: 'Active MembershipExclusion ICD E11.9; must apply consistently to every supported diagnosis object shape.' },
  { num: 'EL-UAT-OLDCHILD', first: 'Kevin', last: 'Ainembabazi', gender: 'MALE', relationship: 'CHILD', principalOf: 'EL-UAT-ACTIVE-01',
    dob: yearsAgo(40), overall: 5 * M, configs: [{ cat: 'OUTPATIENT', sub: 500_000 }],
    note: 'Dependant CHILD age ~40 vs dependentMaxAge 24 → business expectation NOT ELIGIBLE as dependant.' },
  { num: 'EL-UAT-AGEOUT', first: 'Brenda', last: 'Okwir', gender: 'FEMALE', relationship: 'CHILD', principalOf: 'EL-UAT-FAM-P',
    dob: yearsAgo(DEP_MAX_AGE), overall: 5 * M, configs: [{ cat: 'OUTPATIENT', sub: 500_000 }],
    note: 'Dependant ageing out EXACTLY today (age = dependentMaxAge 24) → signed boundary rule governs DATE-07.' },
  { num: 'EL-UAT-MALE-MAT', first: 'Isaac', last: 'Bukenya', gender: 'MALE', overall: 8 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }, { cat: 'MATERNITY', sub: 2 * M }],
    note: 'MALE principal requesting MATERNITY → membership remains distinct from service-level non-applicability.' },

  // ── Data-integrity fail-safe (must route to manual, not crash) ──────────────
  { num: 'EL-UAT-ORPHAN', first: 'Timothy', last: 'Ssali', gender: 'MALE', relationship: 'CHILD', /* principalOf omitted → null */
    overall: 5 * M, familyPool: { cat: 'OUTPATIENT', limit: 300_000 }, configs: [{ cat: 'OUTPATIENT', sub: 500_000 }],
    note: 'CHILD with NO principal + a FAMILY shared pool → computeAvailability throws (DEC-06). Fail-safe: must route DATA_INCOMPLETE/manual, never an exception page.' },

  // ── Identity / wrong-patient cohort (OPS-01 / IDV) ──────────────────────────
  { num: 'EL-UAT-TWIN-A', first: 'Grace', last: 'Namukasa', gender: 'FEMALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'Same full name "Grace Namukasa" as TWIN-B, different number — name-search collision (IDV-01/IDV-07).' },
  { num: 'EL-UAT-TWIN-B', first: 'Grace', last: 'Namukasa', gender: 'FEMALE', overall: 3 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 300_000 }], note: 'Same full name as TWIN-A, different number/plan — must be distinguishable at search + detail.' },
  { num: 'EL-UAT-NEAR-0001', first: 'Alfred', last: 'Byaruhanga', gender: 'MALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'Member number one digit from NEAR-0002 (both valid) — mistype resolves the WRONG real member (IDV-04).' },
  { num: 'EL-UAT-NEAR-0002', first: 'Alice', last: 'Kabanda', gender: 'FEMALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'The other side of the one-digit pair — different person; identity attributes must expose the mismatch.' },
  { num: 'EL-UAT-DUP-OLD', first: 'David', last: 'Ochola', gender: 'MALE', status: 'TERMINATED', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'Old/duplicate record for "David Ochola" (TERMINATED) — old-card / duplicate-enrollment (IDV-05/06); search must not rank this first as covered.' },
  { num: 'EL-UAT-DUP-NEW', first: 'David', last: 'Ochola', gender: 'MALE', status: 'ACTIVE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], note: 'Current ACTIVE record for the same identity as DUP-OLD — inactive+active same person (OPS-08).' },

  // ── Copay / member-liability variants (OPS-12) ──────────────────────────────
  { num: 'EL-UAT-COPAY', first: 'Denis', last: 'Wasswa', gender: 'MALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000, copayPct: 20 }], coContribution: { cat: 'OUTPATIENT', type: 'PERCENTAGE', pct: 20 },
    note: 'OUTPATIENT 20% copay (legacy copayPercentage + a PERCENTAGE co-contribution rule).' },
  { num: 'EL-UAT-COPAY-FIXED', first: 'Harriet', last: 'Nabukenya', gender: 'FEMALE', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }], coContribution: { cat: 'OUTPATIENT', type: 'FIXED_AMOUNT', fixed: 20_000 },
    note: 'FIXED_AMOUNT co-contribution 20,000 UGX per encounter — provider must be able to quote the exact amount.' },
  { num: 'EL-UAT-COPAY-FULL', first: 'George', last: 'Tumwine', gender: 'MALE', overall: 5 * M,
    configs: [{ cat: 'OPTICAL', sub: 200_000, copayPct: 100 }], coContribution: { cat: 'OPTICAL', type: 'PERCENTAGE', pct: 100 },
    note: '100% member share on OPTICAL — member pays all; the answer must make that unmistakable before treatment.' },

  // ── Network / cross-provider scoping ────────────────────────────────────────
  { num: 'EL-UAT-FOREIGN', first: 'Patricia', last: 'Nyangoma', gender: 'FEMALE', status: 'ACTIVE', scheme: 'FOREIGN', overall: 5 * M,
    configs: [{ cat: 'OUTPATIENT', sub: 500_000 }],
    note: 'ACTIVE member of a DIFFERENT employer Kampala is NOT contracted for; every provider rail must be non-enumerating.' },
];

const EXPECTED_COUNT = FIXTURES.length;
const CONTRACT_NUMBER = 'PC-EL-UAT-ELIG-2026';
const FOREIGN_CLIENT_SLUG = 'el-uat-foreign-employer';

async function findConfigId(pvId: string, cat: string): Promise<string> {
  const c = await prisma.benefitConfig.findFirst({ where: { packageVersionId: pvId, category: cat as never } });
  if (!c) throw new Error(`config ${cat} not found on ${pvId}`);
  return c.id;
}

async function wipe(tenantId: string) {
  const members = await prisma.member.findMany({
    where: { tenantId, memberNumber: { startsWith: 'EL-UAT-' } },
    select: { id: true, packageId: true, packageVersionId: true },
  });
  const memberIds = members.map((m) => m.id);
  const pkgIds = [...new Set(members.map((m) => m.packageId).filter(Boolean))] as string[];
  const pvIds = [...new Set(members.map((m) => m.packageVersionId).filter(Boolean))] as string[];

  await prisma.membershipExclusion.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.waitingPeriodApplication.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.memberCoveragePeriod.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.benefitUsage.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.clinicalCase.deleteMany({ where: { memberId: { in: memberIds } } }).catch(() => {});
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });

  for (const pkgId of pkgIds) await prisma.coContributionRule.deleteMany({ where: { packageId: pkgId } }).catch(() => {});
  for (const pvId of pvIds) {
    await prisma.benefitConfigSharedLimit.deleteMany({ where: { benefitConfig: { packageVersionId: pvId } } }).catch(() => {});
    await prisma.sharedLimitGroup.deleteMany({ where: { packageVersionId: pvId } }).catch(() => {});
    await prisma.benefitConfig.deleteMany({ where: { packageVersionId: pvId } });
  }
  for (const pkgId of pkgIds) {
    await prisma.package.update({ where: { id: pkgId }, data: { currentVersionId: null } }).catch(() => {});
    await prisma.packageVersion.deleteMany({ where: { packageId: pkgId } });
  }
  await prisma.package.deleteMany({ where: { id: { in: pkgIds } } });

  const contract = await prisma.providerContract.findFirst({ where: { tenantId, contractNumber: CONTRACT_NUMBER } });
  if (contract) {
    await prisma.contractApplicability.deleteMany({ where: { contractId: contract.id } });
    await prisma.providerContract.delete({ where: { id: contract.id } }).catch(() => {});
  }

  const groups = await prisma.group.findMany({ where: { tenantId, name: { startsWith: 'EL-UAT' } }, select: { id: true, packageId: true } });
  for (const g of groups) {
    await prisma.group.delete({ where: { id: g.id } }).catch(() => {});
    if (g.packageId) {
      await prisma.benefitConfig.deleteMany({ where: { packageVersion: { packageId: g.packageId } } }).catch(() => {});
      await prisma.package.update({ where: { id: g.packageId }, data: { currentVersionId: null } }).catch(() => {});
      await prisma.packageVersion.deleteMany({ where: { packageId: g.packageId } }).catch(() => {});
      await prisma.package.delete({ where: { id: g.packageId } }).catch(() => {});
    }
  }
  await prisma.client.deleteMany({ where: { operatorTenantId: tenantId, slug: FOREIGN_CLIENT_SLUG } }).catch(() => {});
}

async function buildPackage(tenantId: string, name: string, overall: number, configs: Cfg[], familyPool?: Fx['familyPool']) {
  const pkg = await prisma.package.create({ data: { tenantId, name, annualLimit: overall, contributionAmount: 0, type: 'GROUP', status: 'ACTIVE', dependentMaxAge: DEP_MAX_AGE } });
  const pv = await prisma.packageVersion.create({ data: { packageId: pkg.id, versionNumber: 1, effectiveFrom: YEAR_START } });
  await prisma.package.update({ where: { id: pkg.id }, data: { currentVersionId: pv.id } });
  for (const c of configs) {
    await prisma.benefitConfig.create({
      data: {
        packageVersionId: pv.id, category: c.cat as never, annualSubLimit: c.sub,
        ...(c.copayPct != null ? { copayPercentage: c.copayPct } : {}),
        ...(c.waitDays != null ? { waitingPeriodDays: c.waitDays } : {}),
        ...(c.perVisit != null ? { perVisitLimit: c.perVisit } : {}),
      },
    });
  }
  if (familyPool) {
    const slg = await prisma.sharedLimitGroup.create({ data: { packageVersionId: pv.id, name: `EL-UAT FAMILY ${familyPool.cat} pool`, limitAmount: familyPool.limit, appliesTo: 'FAMILY' } });
    const cfgId = await findConfigId(pv.id, familyPool.cat);
    await prisma.benefitConfigSharedLimit.create({ data: { benefitConfigId: cfgId, sharedLimitGroupId: slg.id } });
  }
  return { pkgId: pkg.id, pvId: pv.id };
}

async function ensureGroup(tenantId: string, clientId: string, name: string, status: 'ACTIVE' | 'SUSPENDED') {
  const existing = await prisma.group.findFirst({ where: { tenantId, name } });
  if (existing) return existing;
  const { pkgId } = await buildPackage(tenantId, `${name} — scheme package`, 5 * M, [{ cat: 'OUTPATIENT', sub: 500_000 }]);
  return prisma.group.create({
    data: {
      // ELIG-GAP-002: set nameNormalized so the deploy-gated
      // `@@unique([clientId, nameNormalized])` can't collide on a default empty
      // key with the seeded group(s) under the same client.
      tenantId, clientId, name, nameNormalized: normalizeLegalName(name), packageId: pkgId, contributionRate: 0,
      contactPersonName: 'UAT Scheme Admin', contactPersonPhone: '+256700000000', contactPersonEmail: 'uat.scheme@example.invalid',
      effectiveDate: YEAR_START, renewalDate: new Date(Y + 1, 0, 1), status,
      ...(status === 'SUSPENDED' ? { suspendedAt: daysFromNow(-20), suspensionReason: 'EL-UAT fixture: suspended scheme' } : {}),
      notes: 'EL-UAT local-only eligibility fixture scheme. Not a negotiated term.',
    },
  });
}

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error('tenant not found');
  const tenantId = tenant.id;

  const nile = await prisma.group.findFirst({ where: { tenantId, name: { contains: 'Nile Telecom' } } });
  if (!nile) throw new Error('Nile Telecom group not found — run `npx prisma db seed` first');
  const provider = await prisma.provider.findFirst({ where: { tenantId, name: { contains: 'Kampala Hospital' } } });
  if (!provider) throw new Error('Kampala Hospital provider not found — run `npx prisma db seed` first');

  await wipe(tenantId);

  const foreignClient = await prisma.client.create({
    // ELIG-GAP-003: set an EXPLICIT unique member-number prefix. Omitting it
    // defaults to "MVX" (schema default), which collides with the seeded default
    // client under the deploy-gated `@@unique` member-prefix constraint (P2002).
    // Also set nameNormalized explicitly so the deploy-gated client-name unique
    // constraint (ELIG-GAP-002) cannot trip on a default empty key.
    data: { operatorTenantId: tenantId, type: 'INSURER', name: 'EL-UAT Foreign Employer', nameNormalized: normalizeLegalName('EL-UAT Foreign Employer'), slug: FOREIGN_CLIENT_SLUG, memberNumberPrefix: 'ELUATF', currency: 'UGX', status: 'ACTIVE' },
  });
  const foreignGroup = await ensureGroup(tenantId, foreignClient.id, 'EL-UAT Foreign Scheme', 'ACTIVE');
  const suspendedGroup = await ensureGroup(tenantId, nile.clientId, 'EL-UAT Suspended Scheme', 'SUSPENDED');
  const groupFor = (s?: Fx['scheme']) => (s === 'FOREIGN' ? foreignGroup.id : s === 'SUSPENDED' ? suspendedGroup.id : nile.id);

  const idByNum = new Map<string, string>();
  const sharedPkgs = new Map<string, { pkgId: string; pvId: string }>();

  const resolvePackage = async (f: Fx) => {
    if (f.sharedPackageKey) {
      const hit = sharedPkgs.get(f.sharedPackageKey);
      if (hit) return hit;
      const built = await buildPackage(tenantId, `EL-UAT Package — SHARED ${f.sharedPackageKey}`, f.overall, f.configs, f.familyPool);
      sharedPkgs.set(f.sharedPackageKey, built);
      return built;
    }
    return buildPackage(tenantId, `EL-UAT Package — ${f.num}`, f.overall, f.configs, f.familyPool);
  };

  // Pass 1: principals + standalone
  for (const f of FIXTURES.filter((x) => x.relationship !== 'CHILD')) {
    const { pkgId, pvId } = await resolvePackage(f);
    const m = await prisma.member.create({
      data: {
        tenantId, groupId: groupFor(f.scheme), memberNumber: f.num, firstName: f.first, lastName: `${f.last} UAT`,
        dateOfBirth: f.dob ?? DOB_ADULT, gender: f.gender, relationship: 'PRINCIPAL', packageId: pkgId, packageVersionId: pvId,
        enrollmentDate: YEAR_START, activationDate: f.status && f.status !== 'ACTIVE' ? null : YEAR_START,
        coverStartDate: f.coverStart ?? YEAR_START, coverEndDate: f.coverEnd ?? YEAR_END, status: (f.status ?? 'ACTIVE') as never,
      },
    });
    idByNum.set(f.num, m.id);
    await applyExtras(tenantId, m.id, pvId, f);
  }

  // Pass 2: children (principalOf resolved; omitted = orphan, principalId null)
  for (const f of FIXTURES.filter((x) => x.relationship === 'CHILD')) {
    const principalId = f.principalOf ? idByNum.get(f.principalOf) ?? null : null;
    if (f.principalOf && !principalId) throw new Error(`principal ${f.principalOf} not built for ${f.num}`);
    const groupId = principalId
      ? (await prisma.member.findUnique({ where: { id: principalId }, select: { groupId: true } }))!.groupId
      : groupFor(f.scheme);
    const { pkgId, pvId } = await resolvePackage(f);
    const m = await prisma.member.create({
      data: {
        tenantId, groupId, memberNumber: f.num, firstName: f.first, lastName: `${f.last} UAT`,
        dateOfBirth: f.dob ?? DOB_CHILD, gender: f.gender, relationship: 'CHILD', principalId, packageId: pkgId, packageVersionId: pvId,
        enrollmentDate: YEAR_START, activationDate: YEAR_START, coverStartDate: f.coverStart ?? YEAR_START, coverEndDate: f.coverEnd ?? YEAR_END, status: (f.status ?? 'ACTIVE') as never,
      },
    });
    idByNum.set(f.num, m.id);
    await applyExtras(tenantId, m.id, pvId, f);
  }

  const contract = await prisma.providerContract.create({
    data: {
      tenantId, providerId: provider.id, contractNumber: CONTRACT_NUMBER,
      title: 'EL-UAT Eligibility Fixture Contract (local test)', contractType: 'RATE_SCHEDULE', status: 'ACTIVE',
      branchScope: 'ALL_BRANCHES', startDate: YEAR_START, endDate: YEAR_END, currency: 'UGX',
      notes: 'EL-UAT local-only eligibility fixture. Not a negotiated term.',
    },
  });
  await prisma.contractApplicability.create({
    data: { contractId: contract.id, clientId: nile.clientId, inclusionType: 'INCLUDE', effectiveFrom: YEAR_START, isActive: true },
  });

  // Control total (PLAN-09): assert DB matches the fixture manifest.
  const dbCount = await prisma.member.count({ where: { tenantId, memberNumber: { startsWith: 'EL-UAT-' } } });
  console.log(`\n════ EL-UAT CONTROL TOTAL ════`);
  console.log(`  build day (${BUSINESS_TZ}): ${new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(NOW)}  — run the campaign THIS day or freeze the clock to it`);
  console.log(`  expected members: ${EXPECTED_COUNT}   built (DB): ${dbCount}   ${dbCount === EXPECTED_COUNT ? 'OK ✅' : 'MISMATCH ❌'}`);
  if (dbCount !== EXPECTED_COUNT) throw new Error(`Control-total mismatch: expected ${EXPECTED_COUNT}, DB has ${dbCount}. Investigate before executing.`);
  console.log(`  Nile (contracted) clientId=${nile.clientId}; foreign clientId=${foreignClient.id}; suspended groupId=${suspendedGroup.id}`);
  console.log(`  Kampala Hospital providerId=${provider.id}; contract ${CONTRACT_NUMBER} ACTIVE → applicability INCLUDE Nile client.`);
  console.log(`════ ${EXPECTED_COUNT} fixtures ════`);
  for (const f of FIXTURES) console.log(`   • ${f.num.padEnd(22)} ${f.note}`);
  await prisma.$disconnect();
}

async function applyExtras(tenantId: string, memberId: string, pvId: string, f: Fx) {
  for (const u of f.used ?? []) {
    const cfgId = await findConfigId(pvId, u.cat);
    await prisma.benefitUsage.create({ data: { memberId, benefitConfigId: cfgId, periodStart: PERIOD_START, periodEnd: PERIOD_END, amountUsed: u.amount, claimCount: 1 } });
  }
  if (f.coveragePeriodEnd !== undefined) {
    await prisma.memberCoveragePeriod.create({ data: { tenantId, memberId, startDate: f.coverStart ?? YEAR_START, endDate: f.coveragePeriodEnd, reason: f.coveragePeriodEnd === null ? 'BINDING' : 'EXPIRED' } });
  } else if ((f.status ?? 'ACTIVE') === 'ACTIVE') {
    await prisma.memberCoveragePeriod.create({ data: { tenantId, memberId, startDate: f.coverStart ?? YEAR_START, endDate: null, reason: 'BINDING' } });
  }
  if (f.waiting) {
    await prisma.waitingPeriodApplication.create({
      data: { tenantId, memberId, benefitCategories: f.waiting.cats, waitingPeriodDays: f.waiting.days, startDate: f.waiting.start, endDate: f.waiting.end, sourceDecisionId: 'EL-UAT-synthetic-underwriting', isActive: true },
    });
  }
  if (f.exclusionIcd) {
    await prisma.membershipExclusion.create({
      data: { tenantId, memberId, icd10Code: f.exclusionIcd, description: 'EL-UAT fixture exclusion', sourceDecisionId: 'EL-UAT-synthetic-underwriting', effectiveFrom: YEAR_START, isActive: true },
    });
  }
  if (f.coContribution && f.coContribution.type !== 'NONE') {
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { packageId: true } });
    if (member?.packageId) {
      await prisma.coContributionRule.create({
        data: {
          tenantId, packageId: member.packageId, benefitCategory: f.coContribution.cat as never, networkTier: 'TIER_2', type: f.coContribution.type as never,
          ...(f.coContribution.pct != null ? { percentage: f.coContribution.pct } : {}),
          ...(f.coContribution.fixed != null ? { fixedAmount: f.coContribution.fixed } : {}),
          effectiveFrom: YEAR_START, isActive: true,
        },
      });
    }
  }
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
