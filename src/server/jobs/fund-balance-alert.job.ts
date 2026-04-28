/**
 * fund-balance-alert.job.ts
 * Daily scan: any SELF_FUNDED scheme whose balance has dropped below
 * minimumBalance triggers an email to all FUND_ADMINISTRATOR users
 * assigned to that group.
 *
 * Triggered by: daily cron (scheduleDailyJobs in queue.ts).
 */

import { prisma } from "@/lib/prisma";
import { NotificationService } from "../services/notification.service";

export async function runFundBalanceAlertJob() {
  console.info("[fund-balance-alert] Scanning self-funded accounts…");

  // Fetch all accounts and filter in application layer (Prisma doesn't support
  // column-vs-column comparisons in where without raw SQL)
  const allAccounts = await prisma.selfFundedAccount.findMany({
    include: {
      group: {
        select: {
          name: true,
          id: true,
          fundAdministrators: { select: { email: true, firstName: true } },
        },
      },
    },
  });

  const accounts = allAccounts.filter(
    acc => Number(acc.minimumBalance) > 0 && Number(acc.balance) < Number(acc.minimumBalance),
  );

  let alerted = 0;
  for (const acc of accounts) {
    const balance  = Number(acc.balance);
    const minimum  = Number(acc.minimumBalance);

    for (const admin of acc.group.fundAdministrators) {
      await NotificationService.executeEmailDispatch({
        to:      admin.email,
        subject: `⚠ Low Fund Balance — ${acc.group.name}`,
        body: `Hi ${admin.firstName},\n\nThe self-funded account for ${acc.group.name} has dropped below its minimum balance threshold.\n\nCurrent balance: KES ${balance.toLocaleString()}\nMinimum balance: KES ${minimum.toLocaleString()}\nShortfall: KES ${(minimum - balance).toLocaleString()}\n\nPlease arrange a top-up to avoid disruption to member claims.\n\nLog in to the Fund Admin portal to record a deposit:\nhttps://avenue.co.ke/fund/${acc.groupId}\n\nAvenue Healthcare`,
      });
      alerted++;
    }
  }

  console.info(`[fund-balance-alert] Done — ${alerted} alert(s) sent across ${accounts.length} low-balance scheme(s).`);
  return alerted;
}
