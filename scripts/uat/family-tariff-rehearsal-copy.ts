/**
 * Family Hospital UAT plan P01.02 step 7 — build a DISPOSABLE database on which
 * the tariff remediation's apply → rerun → rollback path is rehearsed against
 * Family's real tariff rows, with their real ids, so the rehearsal's dry run
 * reproduces the production manifest hash exactly.
 *
 * Copies ONLY commercial configuration: the tenant row, the payer (client) row,
 * the provider, its branch, contract, contract version, applicability, the
 * service-category taxonomy the tariffs use, and the provider's tariff rows.
 * It copies NO user, NO member and NO clinical record. The rehearsal's members
 * and operator are synthetic ("Rehearsal Member n", an .invalid address).
 *
 * Safety:
 *   - the source is read inside one `SET TRANSACTION READ ONLY` transaction;
 *   - the target must be a localhost database, or the script refuses;
 *   - the target must not already contain the tenant.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=<prod, read-only use> TARGET_DATABASE_URL=postgresql://postgres@localhost:54331/fh_rehearsal \
 *     npx tsx scripts/uat/family-tariff-rehearsal-copy.ts
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { FAMILY_REVIEWED } from "../lib/family-hospital-reviewed";

function client(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
}

/** Prisma returns JSON nulls as `null`, but writes need DbNull. */
function jsonIn(v: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

async function main(): Promise<void> {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) throw new Error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL.");
  const targetHost = new URL(targetUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(targetHost)) throw new Error(`Refusing: target ${targetHost} is not a local disposable database.`);

  const source = client(sourceUrl);
  const target = client(targetUrl);
  const R = FAMILY_REVIEWED;

  try {
    if (await target.tenant.findUnique({ where: { id: R.tenantId }, select: { id: true } })) {
      throw new Error("Target already contains the tenant — use a fresh disposable database.");
    }

    const data = await source.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: R.tenantId }, select: { id: true, name: true, slug: true } });
        const provider = await tx.provider.findUniqueOrThrow({ where: { id: R.providerId }, select: { id: true, tenantId: true, name: true, type: true, contractStatus: true } });
        const branches = await tx.providerBranch.findMany({ where: { providerId: R.providerId } });
        const contract = await tx.providerContract.findUniqueOrThrow({ where: { id: R.contractId } });
        const versions = await tx.contractVersion.findMany({ where: { contractId: R.contractId } });
        const applicability = await tx.contractApplicability.findMany({ where: { contractId: R.contractId } });
        const clients = await tx.client.findMany({
          where: { id: { in: [...new Set(applicability.map((a) => a.clientId))] } },
          select: { id: true, operatorTenantId: true, type: true, name: true, slug: true },
        });
        const tariffs = await tx.providerTariff.findMany({ where: { providerId: R.providerId }, orderBy: { id: "asc" } });
        const categories = await tx.serviceCategory.findMany({ where: { tenantId: R.tenantId } });
        return { tenant, provider, branches, contract, versions, applicability, clients, tariffs, categories };
      },
      { timeout: 180_000, maxWait: 30_000 },
    );

    // Parents first (taxonomy has a self-relation).
    const catById = new Map(data.categories.map((c) => [c.id, c]));
    const depth = (id: string | null): number => (id ? 1 + depth(catById.get(id)?.parentId ?? null) : 0);
    const orderedCategories = [...data.categories].sort((a, b) => depth(a.id) - depth(b.id));

    await target.$transaction(
      async (tx) => {
        await tx.tenant.create({ data: data.tenant });
        for (const c of data.clients) await tx.client.create({ data: c });
        await tx.provider.create({ data: data.provider });
        for (const b of data.branches) await tx.providerBranch.create({ data: b });
        for (const c of orderedCategories) await tx.serviceCategory.create({ data: c });

        const { currentVersionId, signatories, ...contractRest } = data.contract;
        await tx.providerContract.create({ data: { ...contractRest, signatories: jsonIn(signatories), currentVersionId: null } });
        for (const v of data.versions) {
          await tx.contractVersion.create({ data: { ...v, snapshot: jsonIn(v.snapshot), validationReport: jsonIn(v.validationReport) } });
        }
        await tx.providerContract.update({ where: { id: data.contract.id }, data: { currentVersionId } });
        for (const a of data.applicability) await tx.contractApplicability.create({ data: a });

        await tx.providerTariff.createMany({
          data: data.tariffs.map((t) => ({ ...t, diagnosisRestriction: jsonIn(t.diagnosisRestriction), sourceRef: jsonIn(t.sourceRef) })),
        });

        // Synthetic only: a package, a group, three members, one operator.
        const payer = data.applicability.find((a) => a.inclusionType === "INCLUDE")!;
        const pkg = await tx.package.create({ data: { tenantId: R.tenantId, name: "Rehearsal package", annualLimit: 1_000_000, contributionAmount: 0 } });
        const group = await tx.group.create({
          data: {
            tenantId: R.tenantId,
            clientId: payer.clientId,
            name: "Rehearsal group",
            contactPersonName: "Rehearsal contact",
            contactPersonPhone: "000",
            contactPersonEmail: "rehearsal-contact@example.invalid",
            packageId: pkg.id,
            contributionRate: 0,
            effectiveDate: new Date("2026-08-01T00:00:00Z"),
            renewalDate: new Date("2027-08-01T00:00:00Z"),
            status: "ACTIVE",
          },
        });
        for (let i = 1; i <= 3; i += 1) {
          await tx.member.create({
            data: {
              tenantId: R.tenantId,
              memberNumber: `RHS-2026-0000${i}`,
              groupId: group.id,
              firstName: "Rehearsal",
              lastName: `Member ${i}`,
              dateOfBirth: new Date("1990-01-01T00:00:00Z"),
              gender: "FEMALE",
              packageId: pkg.id,
              enrollmentDate: new Date("2026-08-01T00:00:00Z"),
              status: "ACTIVE",
            },
          });
        }
        await tx.user.create({
          data: {
            id: "rehearsal-operator",
            tenantId: R.tenantId,
            email: "rehearsal-operator@example.invalid",
            passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
            firstName: "Rehearsal",
            lastName: "Operator",
            role: "SUPER_ADMIN",
          },
        });
      },
      { timeout: 180_000, maxWait: 30_000 },
    );

    console.log(
      JSON.stringify({ copied: { tariffs: data.tariffs.length, categories: data.categories.length, branches: data.branches.length, versions: data.versions.length, applicability: data.applicability.length }, synthetic: { members: 3, operatorUserId: "rehearsal-operator" } }, null, 2),
    );
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((err) => {
  console.error("rehearsal copy failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
