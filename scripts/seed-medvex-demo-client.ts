/**
 * seed-medvex-demo-client.ts
 *
 * Seeds a clean, internally-consistent INSURED corporate demo client alongside
 * NWSC, so E2E tests can exercise the risk-bearing (premium) model — the one
 * NWSC's SELF_FUNDED scheme doesn't cover.
 *
 * It is its OWN client (PayerType=INSURER) with a single INSURED group, so the
 * cross-employer pooling that caused N3 (one INSURER client holding many
 * employers) cannot recur here. Reuses the generic tenant-level "Medvex Premier"
 * package. No claims are seeded — enrolled members + open coverage periods are
 * enough to drive the full pipeline (create claim → adjudicate → settle) from the
 * UI/API, with FG-C5 point-in-time eligibility satisfied.
 *
 * Idempotent guard: aborts if a client with slug "pearl-health" already exists.
 * DRY RUN by default (creates everything in a transaction then rolls back). Pass
 * --commit to persist.
 *
 * Usage:
 *   npx tsx --env-file=.env.prod scripts/seed-medvex-demo-client.ts            # dry run
 *   npx tsx --env-file=.env.prod scripts/seed-medvex-demo-client.ts --commit   # persist
 */
import { prisma } from "@/lib/prisma";

const COMMIT = process.argv.includes("--commit");
const TENANT_ID = "cmr3ae8v30000nlvqxrqlfn38"; // Medvex operator tenant
const PREMIER_PACKAGE_ID = "cmr3af6dy0010nlvqyi7fruou"; // generic "Medvex Premier"
const SLUG = "pearl-health";
const PREFIX = "PHA";
const EFFECTIVE = new Date("2026-07-01T00:00:00Z");
const RENEWAL = new Date("2027-07-01T00:00:00Z");
const PREMIUM = 1_200_000; // UGX annual premium per member

type G = "MALE" | "FEMALE";
type Dep = { firstName: string; lastName: string; gender: G; dob: string; relationship: "SPOUSE" | "CHILD" };
type Fam = { firstName: string; lastName: string; gender: G; dob: string; deps: Dep[] };

const families: Fam[] = [
  { firstName: "Denis", lastName: "Okello", gender: "MALE", dob: "1982-03-14", deps: [
    { firstName: "Sarah", lastName: "Okello", gender: "FEMALE", dob: "1985-07-02", relationship: "SPOUSE" },
    { firstName: "Brian", lastName: "Okello", gender: "MALE", dob: "2013-01-20", relationship: "CHILD" },
    { firstName: "Aceng", lastName: "Okello", gender: "FEMALE", dob: "2016-09-11", relationship: "CHILD" },
  ] },
  { firstName: "Ritah", lastName: "Namutebi", gender: "FEMALE", dob: "1988-11-05", deps: [
    { firstName: "Joseph", lastName: "Ssali", gender: "MALE", dob: "1986-04-19", relationship: "SPOUSE" },
    { firstName: "Esther", lastName: "Nabirye", gender: "FEMALE", dob: "2018-12-01", relationship: "CHILD" },
  ] },
  { firstName: "Isaac", lastName: "Wasswa", gender: "MALE", dob: "1991-06-27", deps: [] },
  { firstName: "Grace", lastName: "Auma", gender: "FEMALE", dob: "1979-02-08", deps: [
    { firstName: "Patricia", lastName: "Apio", gender: "FEMALE", dob: "2009-05-30", relationship: "CHILD" },
    { firstName: "Samuel", lastName: "Opio", gender: "MALE", dob: "2011-08-16", relationship: "CHILD" },
    { firstName: "Faith", lastName: "Adong", gender: "FEMALE", dob: "2015-03-22", relationship: "CHILD" },
  ] },
  { firstName: "Moses", lastName: "Kato", gender: "MALE", dob: "1984-10-12", deps: [
    { firstName: "Juliet", lastName: "Nabukenya", gender: "FEMALE", dob: "1987-01-25", relationship: "SPOUSE" },
  ] },
];

class DryRunRollback extends Error {}

async function main() {
  const existing = await prisma.client.findFirst({ where: { slug: SLUG }, select: { id: true } });
  if (existing) throw new Error(`A client with slug "${SLUG}" already exists (${existing.id}) — already seeded; aborting.`);
  const pkg = await prisma.package.findUnique({ where: { id: PREMIER_PACKAGE_ID }, select: { id: true, name: true } });
  if (!pkg) throw new Error(`Package ${PREMIER_PACKAGE_ID} (Medvex Premier) not found — aborting.`);

  const totalMembers = families.reduce((n, f) => n + 1 + f.deps.length, 0);
  console.log(`\n${COMMIT ? "🔴 COMMIT — persisting demo client" : "🟡 DRY RUN — will roll back"}`);
  console.log(`Client "Pearl Health Assurance" (INSURER) · group "Kyoga Foods Ltd — Staff Scheme" (INSURED)`);
  console.log(`Package: ${pkg.name} · ${families.length} families / ${totalMembers} members · cover from ${EFFECTIVE.toISOString().slice(0, 10)}\n`);

  const report = { members: 0, dependents: 0, coverage: 0 };

  try {
    await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          operatorTenantId: TENANT_ID, type: "INSURER", name: "Pearl Health Assurance",
          slug: SLUG, currency: "UGX", memberNumberPrefix: PREFIX, status: "ACTIVE", isActive: true,
        },
      });
      const group = await tx.group.create({
        data: {
          tenantId: TENANT_ID, clientId: client.id, name: "Kyoga Foods Ltd — Staff Scheme",
          industry: "Food & Beverage Manufacturing",
          contactPersonName: "Grace Nabweteme", contactPersonPhone: "+256772100200", contactPersonEmail: "hr@kyogafoods.co.ug",
          packageId: PREMIER_PACKAGE_ID, fundingMode: "INSURED", contributionRate: PREMIUM,
          paymentFrequency: "ANNUAL", status: "ACTIVE", effectiveDate: EFFECTIVE, renewalDate: RENEWAL,
        },
      });
      const tier = await tx.groupBenefitTier.create({
        data: {
          groupId: group.id, name: "Staff", packageId: PREMIER_PACKAGE_ID, contributionRate: PREMIUM,
          isDefault: true, description: "All Kyoga Foods staff — Medvex Premier cover",
        },
      });

      let seq = 0;
      const mkMember = async (
        f: { firstName: string; lastName: string; gender: G; dob: string },
        relationship: "PRINCIPAL" | "SPOUSE" | "CHILD",
        principalId: string | null,
      ) => {
        seq += 1;
        const m = await tx.member.create({
          data: {
            tenantId: TENANT_ID, groupId: group.id, memberNumber: `${PREFIX}-2026-${String(seq).padStart(5, "0")}`,
            firstName: f.firstName, lastName: f.lastName, dateOfBirth: new Date(f.dob), gender: f.gender,
            packageId: PREMIER_PACKAGE_ID, benefitTierId: tier.id, relationship, principalId,
            status: "ACTIVE", coverStartDate: EFFECTIVE, enrollmentDate: EFFECTIVE,
          },
        });
        await tx.memberCoveragePeriod.create({ data: { tenantId: TENANT_ID, memberId: m.id, startDate: EFFECTIVE } });
        report.coverage += 1;
        if (relationship === "PRINCIPAL") report.members += 1;
        else report.dependents += 1;
        return m;
      };

      for (const fam of families) {
        const principal = await mkMember(fam, "PRINCIPAL", null);
        for (const dep of fam.deps) await mkMember(dep, dep.relationship, principal.id);
      }

      console.log(`  created → 1 client, 1 group, 1 tier, ${report.members} principals + ${report.dependents} dependents, ${report.coverage} coverage periods`);
      if (!COMMIT) throw new DryRunRollback();
    }, { timeout: 60_000 });

    console.log(`\n✅ COMMITTED — Pearl Health Assurance / Kyoga Foods demo scheme is live. Ready for E2E (create claims from the UI/API).`);
  } catch (e) {
    if (e instanceof DryRunRollback) {
      console.log(`\n🟡 DRY RUN complete — rolled back (no changes). Re-run with --commit to persist.`);
      return;
    }
    throw e;
  }
}

main()
  .catch((e) => {
    console.error("\n❌ Aborted:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
