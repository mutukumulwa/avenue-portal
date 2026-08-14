/**
 * Resolve member imports that stopped without finishing.
 *
 * `finishRow` throws and `confirmImportAction` does not catch it, so a crash
 * mid-import leaves the batch PROCESSING with `finalize` never called. `reserve`
 * then refuses to replay a non-terminal batch, and because the idempotency key
 * hashes the file's content, THAT FILE CAN NEVER BE SUBMITTED FOR THAT GROUP
 * AGAIN. This is the way out.
 *
 * See `MemberImportJobService.reap` for how it decides — briefly: it does not
 * guess. For every stranded row that has a national ID it asks whether the
 * record actually exists, so a row whose member was created before the crash is
 * recovered as ACCEPTED rather than falsely failed. Rows with nothing to match
 * on stay UNKNOWN and keep their batch UNKNOWN, which is the honest answer.
 *
 * ## Reports by default, writes only with --apply
 *
 * A dry run performs every lookup and no write, so its counts are the real
 * ones. Read them, then re-run with --apply.
 *
 *   npx tsx scripts/reap-stuck-imports.ts                  # report
 *   npx tsx scripts/reap-stuck-imports.ts --apply          # resolve
 *   npx tsx scripts/reap-stuck-imports.ts --stale-minutes 60 --limit 5
 *
 * ## Why a script and not only the worker job
 *
 * `member-import-reaper.job.ts` runs this on a schedule, and the worker is not
 * provisioned in production — so on the day an import wedges, this script is
 * what an operator actually has. It needs nothing but DATABASE_URL.
 */
import "dotenv/config";

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--apply");
const staleMinutes = Number(flagValue("--stale-minutes") ?? "");
const limit = Number(flagValue("--limit") ?? "");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const { MemberImportJobService, STALE_IMPORT_AFTER_MS } = await import(
    "../src/server/services/member-import-job.service"
  );

  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

  try {
    const staleAfterMs = Number.isFinite(staleMinutes) && staleMinutes > 0
      ? staleMinutes * 60_000
      : STALE_IMPORT_AFTER_MS;

    console.log(
      `\nStuck member imports — ${APPLY ? "APPLYING" : "report only, no writes"}` +
        `  (stale after ${Math.round(staleAfterMs / 60_000)} min)\n`,
    );

    const outcomes = await MemberImportJobService.reap(prisma, {
      staleAfterMs,
      dryRun: !APPLY,
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    });

    if (outcomes.length === 0) {
      console.log("  No stuck imports. Nothing to do.\n");
      return;
    }

    for (const o of outcomes) {
      console.log(`  ${o.batchRef}  [${o.lane}]  →  ${o.status}`);
      console.log(
        `      recovered ${o.recovered}   abandoned ${o.abandoned}   inconclusive ${o.inconclusive}`,
      );
      if (o.recovered > 0) {
        console.log(
          `      ${o.recovered} row(s) HAD created their record before the crash — recorded as accepted,`,
        );
        console.log("      which is what stops the next attempt creating duplicates.");
      }
      if (o.inconclusive > 0) {
        console.log(
          `      ${o.inconclusive} row(s) carry no national ID to check. This batch stays UNKNOWN`,
        );
        console.log("      and still refuses replay — deliberately. A person must decide.");
      }
    }

    const totals = outcomes.reduce(
      (t, o) => ({
        recovered: t.recovered + o.recovered,
        abandoned: t.abandoned + o.abandoned,
        inconclusive: t.inconclusive + o.inconclusive,
        unresolved: t.unresolved + (o.status === "UNKNOWN" ? 1 : 0),
      }),
      { recovered: 0, abandoned: 0, inconclusive: 0, unresolved: 0 },
    );

    console.log(
      `\n  ${outcomes.length} batch(es): ${totals.recovered} recovered, ` +
        `${totals.abandoned} abandoned, ${totals.inconclusive} inconclusive.`,
    );
    if (!APPLY) {
      console.log("  Nothing was written. Re-run with --apply to resolve them.\n");
    } else {
      console.log(
        `  ${outcomes.length - totals.unresolved} batch(es) now hold a terminal status and will` +
          " replay their\n  recorded result instead of refusing." +
          (totals.unresolved > 0
            ? `\n  ${totals.unresolved} remain UNKNOWN and still need a person.\n`
            : "\n"),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
