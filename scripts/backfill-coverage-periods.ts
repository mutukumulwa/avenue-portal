/**
 * backfill-coverage-periods.ts (WP-B2 / FG-C5)
 *
 * Seeds MemberCoveragePeriod for members that have none yet, so point-in-time
 * eligibility (coverage.service) works for the existing book. Per member:
 *   - startDate = coverStartDate ?? enrollmentDate
 *   - coverage-ended status (TERMINATED*, EXPIRED, CANCELLED_COOLING_OFF,
 *     LAPSED_BEFORE_ACTIVATION) → a CLOSED window ending at min(coverEndDate,
 *     updatedAt) so historical in-window claims file while post-termination ones
 *     do not (the exact termination date isn't recorded — updatedAt is the
 *     proxy, and we never extend past it, so no cover leaks).
 *   - everyone else (ACTIVE / PENDING_ACTIVATION / SUSPENDED / LAPSED) → an OPEN
 *     window (endDate NULL).
 *
 * Idempotent: only members with zero coverage periods are touched.
 *
 * Usage: npx tsx --env-file=.env scripts/backfill-coverage-periods.ts [--dry-run]
 */
import { prisma } from "@/lib/prisma";
import { isCoverageEnded } from "@/server/services/coverage.service";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let grandOpen = 0;
  let grandClosed = 0;

  for (const t of tenants) {
    const members = await prisma.member.findMany({
      where: { tenantId: t.id, coveragePeriods: { none: {} } },
      select: {
        id: true, status: true,
        coverStartDate: true, enrollmentDate: true, coverEndDate: true, updatedAt: true,
      },
    });
    if (members.length === 0) continue;

    const rows = members.map((m) => {
      const startDate = m.coverStartDate ?? m.enrollmentDate;
      let endDate: Date | null = null;
      if (isCoverageEnded(m.status)) {
        // Cap the window at the termination proxy so cover never leaks past it.
        endDate = m.coverEndDate && m.coverEndDate < m.updatedAt ? m.coverEndDate : m.updatedAt;
        if (endDate < startDate) endDate = startDate; // floor — never an inverted window
      }
      return { tenantId: t.id, memberId: m.id, startDate, endDate, reason: "BACKFILL" };
    });

    const open = rows.filter((r) => r.endDate === null).length;
    const closed = rows.length - open;
    grandOpen += open;
    grandClosed += closed;

    if (dryRun) {
      console.log(`[dry-run] ${t.name}: would create ${rows.length} periods (${open} open, ${closed} closed)`);
      continue;
    }

    // Chunk the inserts to keep each statement small.
    for (let i = 0; i < rows.length; i += 500) {
      await prisma.memberCoveragePeriod.createMany({ data: rows.slice(i, i + 500) });
    }
    console.log(`${t.name}: created ${rows.length} coverage periods (${open} open, ${closed} closed)`);
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Done — ${grandOpen + grandClosed} periods total (${grandOpen} open, ${grandClosed} closed).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
