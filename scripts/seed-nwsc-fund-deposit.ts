/**
 * seed-nwsc-fund-deposit.ts
 *
 * Seeds an initial funding deposit for the NWSC self-funded scheme so the fund
 * balance goes positive and above its minimum, and conservation (M26) ties out.
 * Fixes CU-OBS-5 (fund showed -1,496,500 with 0 deposited — the scheme was never
 * funded in the seed, only drawn against by 11 PAID claims = 1,496,500).
 *
 * Faithful to the app's recordDepositAction (src/app/fund/[groupId]/actions.ts):
 * inside one transaction — bump SelfFundedAccount.balance + totalDeposited and
 * append a FundTransaction(type=DEPOSIT, balanceAfter=newBalance). Self-funded
 * deposits do NOT post to the double-entry GL (separate fund ledger), so no
 * JournalEntry is created — GL is untouched.
 *
 * DRY RUN by default (prints before/after + conservation check, then rolls back).
 * Pass --commit to persist.
 *
 * Usage:
 *   npx tsx --env-file=.env.prod scripts/seed-nwsc-fund-deposit.ts            # dry run
 *   npx tsx --env-file=.env.prod scripts/seed-nwsc-fund-deposit.ts --commit   # persist
 */
import { prisma } from "@/lib/prisma";

const COMMIT = process.argv.includes("--commit");
const NWSC_CLIENT_ID = "cmr94t90k000004jssvqx1ppp";
const DEPOSIT = 500_000_000; // UGX — initial annual scheme funding (above the 300M minimum floor)
const REFERENCE = "NWSC-FUND-2026-001";
const DESCRIPTION = "Initial scheme funding — FY2026";

class DryRunRollback extends Error {}

async function main() {
  // Resolve the NWSC self-funded scheme (don't hardcode the account id).
  const group = await prisma.group.findFirst({
    where: { clientId: NWSC_CLIENT_ID, fundingMode: "SELF_FUNDED" },
    select: { id: true, name: true, tenantId: true, effectiveDate: true, renewalDate: true, selfFundedAccount: true },
  });
  if (!group) throw new Error("No SELF_FUNDED group found under the NWSC client — aborting.");
  if (!group.name.toUpperCase().includes("NWSC")) throw new Error(`SAFETY GUARD: group "${group.name}" is not an NWSC scheme — aborting.`);
  if (!group.selfFundedAccount) throw new Error(`Group "${group.name}" has no SelfFundedAccount — aborting.`);

  const poster = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, email: true },
  });

  const acc = group.selfFundedAccount;
  const before = Number(acc.balance);
  const after = before + DEPOSIT;

  console.log(`\n${COMMIT ? "🔴 COMMIT — persisting deposit" : "🟡 DRY RUN — will roll back"}`);
  console.log(`Scheme: ${group.name} (account ${acc.id})`);
  console.log(`Poster: ${poster?.email ?? "(none — postedById null)"}\n`);
  console.log(`  balance        ${before.toLocaleString()}  →  ${after.toLocaleString()} UGX`);
  console.log(`  totalDeposited ${Number(acc.totalDeposited).toLocaleString()}  →  ${(Number(acc.totalDeposited) + DEPOSIT).toLocaleString()} UGX`);
  console.log(`  minimumBalance ${Number(acc.minimumBalance).toLocaleString()} — after deposit balance is ${after >= Number(acc.minimumBalance) ? "ABOVE ✅" : "BELOW ❌"} minimum`);

  // Conservation (M26): deposited == claims + adminFees + balance
  const deposited = Number(acc.totalDeposited) + DEPOSIT;
  const claims = Number(acc.totalClaims);
  const fees = Number(acc.totalAdminFees);
  const ties = Math.round((deposited - (claims + fees + after)) * 100) === 0;
  console.log(`  conservation:  deposited ${deposited.toLocaleString()} == claims ${claims.toLocaleString()} + fees ${fees.toLocaleString()} + balance ${after.toLocaleString()}  →  ${ties ? "ties ✅" : "MISMATCH ❌"}`);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.selfFundedAccount.update({
        where: { id: acc.id },
        data: { balance: after, totalDeposited: { increment: DEPOSIT } },
      });
      await tx.fundTransaction.create({
        data: {
          tenantId: group.tenantId, selfFundedAccountId: acc.id,
          type: "DEPOSIT", amount: DEPOSIT, balanceAfter: after,
          description: DESCRIPTION, referenceNumber: REFERENCE, postedById: poster?.id ?? null,
          currency: acc.currency,
        },
      });
      if (!ties) throw new Error("ASSERT FAILED: conservation does not tie out — rolling back.");
      if (!COMMIT) throw new DryRunRollback();
    });
    console.log(`\n✅ COMMITTED — NWSC scheme funded. Balance now ${after.toLocaleString()} UGX.`);
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
