/**
 * backfill-claim-currency.ts (PR-017 D2)
 *
 * Ratified backfill rule: existing claims take the provider's ACTIVE contract
 * currency where determinable, else the client's transaction currency, else
 * KES for the legacy demo book (which was captured in KES while the column
 * defaulted to UGX).
 *
 * Idempotent: only touches claims whose currency still equals the schema
 * default ("UGX") — claims already carrying an explicit non-default currency
 * are left alone.
 *
 * Usage: npx tsx scripts/backfill-claim-currency.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }));
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const claims = await prisma.claim.findMany({
    where: { currency: "UGX" },
    select: {
      id: true,
      claimNumber: true,
      providerId: true,
      member: { select: { group: { select: { client: { select: { currency: true } } } } } },
    },
  });
  console.log(`${claims.length} claim(s) carry the default currency (UGX) — evaluating backfill...`);

  const contractCurrencyByProvider = new Map<string, string | null>();
  let updated = 0;

  for (const c of claims) {
    let target: string | null = null;

    if (!contractCurrencyByProvider.has(c.providerId)) {
      const contract = await prisma.providerContract.findFirst({
        where: { providerId: c.providerId, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        select: { currency: true },
      });
      contractCurrencyByProvider.set(c.providerId, contract?.currency ?? null);
    }
    target = contractCurrencyByProvider.get(c.providerId) ?? null;

    if (!target) target = c.member?.group?.client?.currency ?? null;
    if (!target || target === "UGX") target = "KES"; // legacy demo book rule

    if (target !== "UGX") {
      if (!dryRun) {
        await prisma.claim.update({ where: { id: c.id }, data: { currency: target } });
      }
      updated++;
    }
  }

  console.log(`${dryRun ? "[dry-run] would update" : "Updated"} ${updated} claim(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
